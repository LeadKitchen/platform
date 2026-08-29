import {
  type Catalog,
  type DialogContext,
  detectToxicity,
  type Expectation,
  resolveExpectation,
} from "@acme/game";

import { estimateCostUsd } from "./provider/pricing";
import { addUsage, type LlmProvider, type LlmUsage } from "./provider/types";
import {
  engagementRegistry,
  evaluationRegistry,
  knowledgeRegistry,
  personaRegistry,
} from "./registries";
import type {
  EvaluationResult,
  KnowledgeResult,
  PersonaFeedback,
  PersonaReply,
  StageDeps,
} from "./types";
import type { VariantConfig } from "./variants";

export interface PipelineDeps {
  provider: LlmProvider;
  catalog: Catalog;
}

export interface TurnTelemetry {
  variantId: string;
  model: string;
  usage: LlmUsage;
  costUsd: number;
  totalMs: number;
  knowledgeMs: number;
  personaMs: number;
  knowledgeSnippets: number;
  /** Strategy-specific details (chosen skills, retrieval query, …). */
  meta: Record<string, unknown>;
}

export interface TurnResult {
  reply: PersonaReply;
  /** Dialog state after the turn: history, engagement and emotion updated. */
  dialog: DialogContext;
  expectation: Expectation;
  knowledge: KnowledgeResult;
  telemetry: TurnTelemetry;
  /** True when the manager's utterance itself was flagged as toxic. */
  managerToxic: boolean;
}

export interface EvaluateResult extends EvaluationResult {
  expectation: Expectation;
  costUsd: number;
  variantId: string;
}

export interface Pipeline {
  readonly variant: VariantConfig;
  respond(input: {
    dialog: DialogContext;
    utterance: string;
    signal?: AbortSignal;
  }): Promise<TurnResult>;
  evaluate(dialog: DialogContext): Promise<EvaluateResult>;
  learn(feedback: PersonaFeedback): Promise<void>;
}

function silentReply(): PersonaReply {
  return {
    silent: true,
    reply: "",
    understood: null,
    readiness: "unsure",
    requests: [],
    confirmsCheckpoints: false,
    emotionDelta: 0,
  };
}

/**
 * Compose the stages of a variant into a runnable dialog engine.
 *
 * The pipeline owns only what must behave identically across approaches:
 * emotion bookkeeping, transcript maintenance and telemetry. Every decision —
 * whether the character is being addressed, what it knows, what it says and
 * how the dialog is scored — belongs to a swappable strategy.
 */
export function createPipeline(
  variant: VariantConfig,
  deps: PipelineDeps,
): Pipeline {
  const engagement = engagementRegistry.resolve(variant.engagement);
  const knowledge = knowledgeRegistry.resolve(variant.knowledge);
  const persona = personaRegistry.resolve(variant.persona);
  const evaluation = evaluationRegistry.resolve(variant.evaluation);

  const stageDeps: StageDeps = {
    provider: deps.provider,
    catalog: deps.catalog,
    params: variant.params,
    effort: variant.effort,
  };

  return {
    variant,

    async respond({ dialog, utterance, signal }) {
      const requestDeps: StageDeps = { ...stageDeps, signal };
      const startedAt = Date.now();
      const expectation = resolveExpectation(
        dialog.employee,
        dialog.task,
        dialog.shift,
      );
      const managerToxic = detectToxicity(utterance);

      const withManagerTurn: DialogContext = {
        ...dialog,
        turns: [
          ...dialog.turns,
          { role: "manager", text: utterance, at: new Date().toISOString() },
        ],
      };

      // The spec is explicit: the AI employee keeps quiet until the manager
      // actually brings them into the conversation. Once engaged, the gate is
      // not consulted again — the character does not fall back asleep.
      const gate = dialog.engaged
        ? { engaged: true, reason: "диалог уже идёт", latencyMs: 0 }
        : await engagement.check({ dialog, utterance }, requestDeps);

      if (!gate.engaged) {
        const gateUsage = addUsage(gate.usage);
        return {
          reply: silentReply(),
          dialog: { ...withManagerTurn, engaged: false },
          expectation,
          knowledge: { snippets: [], latencyMs: 0 },
          managerToxic,
          telemetry: {
            variantId: variant.id,
            model: deps.provider.model,
            usage: gateUsage,
            costUsd: estimateCostUsd(deps.provider.model, gateUsage),
            totalMs: Date.now() - startedAt,
            knowledgeMs: 0,
            personaMs: 0,
            knowledgeSnippets: 0,
            meta: {
              silent: true,
              engagement: engagement.id,
              reason: gate.reason,
            },
          },
        };
      }

      const knowledgeResult = await knowledge.retrieve(
        { dialog, expectation, query: utterance },
        requestDeps,
      );
      if (
        dialog.order.notes &&
        !knowledgeResult.snippets.some((snippet) =>
          snippet.text.includes(dialog.order.notes ?? ""),
        )
      ) {
        knowledgeResult.snippets.push({
          id: `order-notes:${dialog.order.id}`,
          source: "task",
          score: 1,
          text: dialog.order.notes,
        });
      }

      const personaResult = await persona.respond(
        {
          dialog: { ...dialog, engaged: true },
          expectation,
          knowledge: knowledgeResult,
          utterance,
        },
        requestDeps,
      );

      const usage = addUsage(
        gate.usage,
        knowledgeResult.usage,
        personaResult.usage,
      );

      // With a failover pool `provider.model` is only the nominal first
      // candidate — the call may well have been served by another one. The
      // stage reports what actually answered, and that is what the benchmark
      // must attribute the dialog to.
      const servedModel =
        typeof personaResult.meta?.model === "string"
          ? personaResult.meta.model
          : deps.provider.model;
      const emotion = Math.max(
        -2,
        Math.min(2, dialog.emotion + personaResult.reply.emotionDelta),
      );

      const nextTurns = [...withManagerTurn.turns];
      if (personaResult.reply.reply.trim().length > 0) {
        nextTurns.push({
          role: "employee",
          text: personaResult.reply.reply,
          at: new Date().toISOString(),
        });
      }

      return {
        reply: personaResult.reply,
        dialog: {
          ...withManagerTurn,
          turns: nextTurns,
          engaged: true,
          emotion,
        },
        expectation,
        knowledge: knowledgeResult,
        managerToxic,
        telemetry: {
          variantId: variant.id,
          model: servedModel,
          usage,
          costUsd: estimateCostUsd(servedModel, usage),
          totalMs: Date.now() - startedAt,
          knowledgeMs: knowledgeResult.latencyMs,
          personaMs: personaResult.latencyMs,
          knowledgeSnippets: knowledgeResult.snippets.length,
          meta: {
            engagement: engagement.id,
            ...knowledgeResult.meta,
            ...personaResult.meta,
          },
        },
      };
    },

    async evaluate(dialog) {
      const expectation = resolveExpectation(
        dialog.employee,
        dialog.task,
        dialog.shift,
      );
      const result = await evaluation.evaluate(
        { dialog, expectation },
        stageDeps,
      );

      return {
        ...result,
        expectation,
        variantId: variant.id,
        costUsd: result.usage
          ? estimateCostUsd(deps.provider.model, result.usage)
          : 0,
      };
    },

    async learn(feedback) {
      await persona.learn?.(feedback);
    },
  };
}
