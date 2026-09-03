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
  PersonaRequest,
  PersonaResult,
  PersonaStreamChunk,
  PersonaStreamResult,
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

export interface PipelineStreamChunk {
  /** Cumulative reply text as the character "types" it. */
  reply: string;
}

export interface PipelineStreamResult {
  stream: AsyncIterable<PipelineStreamChunk>;
  /** Settles once `stream` is fully consumed — same contract as `LlmStreamResult`. */
  result: Promise<TurnResult>;
}

export interface Pipeline {
  readonly variant: VariantConfig;
  respond(input: {
    dialog: DialogContext;
    utterance: string;
    signal?: AbortSignal;
  }): Promise<TurnResult>;
  /**
   * Same turn as `respond`, but the employee's reply streams in as the model
   * produces it — for a live chat surface that wants to show the character
   * "typing" instead of a blank wait. The engagement gate and knowledge
   * retrieval still run to completion first: neither streams on its own, and
   * both normally finish well before the persona call even starts.
   *
   * A silent turn (the gate didn't engage) yields nothing — there is no reply
   * to type out. A persona strategy without its own `respondStream` (the
   * multi-call approaches: self-consistency, skill-RL) also yields nothing
   * until the single, buffered reply is ready.
   */
  respondStream(input: {
    dialog: DialogContext;
    utterance: string;
    signal?: AbortSignal;
  }): PipelineStreamResult;
  evaluate(dialog: DialogContext): Promise<EvaluateResult>;
  learn(feedback: PersonaFeedback): Promise<void>;
}

function resolveDialogExpectation(dialog: DialogContext): Expectation {
  const adaptive = resolveExpectation(
    dialog.employee,
    dialog.task,
    dialog.shift,
  );
  if (!dialog.evaluationCriteria?.length) return adaptive;
  return {
    ...adaptive,
    requiredCriteria: dialog.evaluationCriteria,
    rationale: `${adaptive.rationale} Активная рубрика: ${dialog.evaluationScorecard?.name ?? "Scorecard"}.`,
  };
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

/** A strategy without `respondStream` gets buffered into the same shape: one chunk once `respond()` resolves. */
function bufferedPersonaStream(
  pending: Promise<PersonaResult>,
): PersonaStreamResult {
  async function* chunks(): AsyncGenerator<PersonaStreamChunk> {
    const resolved = await pending;
    if (resolved.reply.reply.length > 0) {
      yield { reply: resolved.reply.reply };
    }
  }
  return { stream: chunks(), result: pending };
}

type TurnSetup =
  | { silent: true; result: TurnResult }
  | {
      silent: false;
      startedAt: number;
      dialog: DialogContext;
      withManagerTurn: DialogContext;
      expectation: Expectation;
      managerToxic: boolean;
      gate: { usage?: LlmUsage };
      knowledgeResult: KnowledgeResult;
      personaRequest: PersonaRequest;
      requestDeps: StageDeps;
    };

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

  /**
   * Everything a turn needs before the persona speaks: the engagement gate
   * and (when engaged) knowledge retrieval. Shared by `respond` and
   * `respondStream` so the two can never drift on how a turn is set up.
   */
  async function resolveTurnSetup(input: {
    dialog: DialogContext;
    utterance: string;
    signal?: AbortSignal;
  }): Promise<TurnSetup> {
    const requestDeps: StageDeps = { ...stageDeps, signal: input.signal };
    const startedAt = Date.now();
    const expectation = resolveDialogExpectation(input.dialog);
    const managerToxic = detectToxicity(input.utterance);

    const withManagerTurn: DialogContext = {
      ...input.dialog,
      turns: [
        ...input.dialog.turns,
        {
          role: "manager",
          text: input.utterance,
          at: new Date().toISOString(),
        },
      ],
    };

    // The spec is explicit: the AI employee keeps quiet until the manager
    // actually brings them into the conversation. Once engaged, the gate is
    // not consulted again — the character does not fall back asleep.
    const gate = input.dialog.engaged
      ? { engaged: true, reason: "диалог уже идёт", latencyMs: 0 }
      : await engagement.check(
          { dialog: input.dialog, utterance: input.utterance },
          requestDeps,
        );

    if (!gate.engaged) {
      const gateUsage = addUsage(gate.usage);
      return {
        silent: true,
        result: {
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
        },
      };
    }

    const knowledgeResult = await knowledge.retrieve(
      { dialog: input.dialog, expectation, query: input.utterance },
      requestDeps,
    );
    if (
      input.dialog.order.notes &&
      !knowledgeResult.snippets.some((snippet) =>
        snippet.text.includes(input.dialog.order.notes ?? ""),
      )
    ) {
      knowledgeResult.snippets.push({
        id: `order-notes:${input.dialog.order.id}`,
        source: "task",
        score: 1,
        text: input.dialog.order.notes,
      });
    }

    return {
      silent: false,
      startedAt,
      dialog: input.dialog,
      withManagerTurn,
      expectation,
      managerToxic,
      gate,
      knowledgeResult,
      personaRequest: {
        dialog: { ...input.dialog, engaged: true },
        expectation,
        knowledge: knowledgeResult,
        utterance: input.utterance,
      },
      requestDeps,
    };
  }

  /** The epilogue shared by `respond` and `respondStream`: telemetry, emotion, transcript. */
  function finishTurn(
    setup: Extract<TurnSetup, { silent: false }>,
    personaResult: PersonaResult,
  ): TurnResult {
    const usage = addUsage(
      setup.gate.usage,
      setup.knowledgeResult.usage,
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
      Math.min(2, setup.dialog.emotion + personaResult.reply.emotionDelta),
    );

    const nextTurns = [...setup.withManagerTurn.turns];
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
        ...setup.withManagerTurn,
        turns: nextTurns,
        engaged: true,
        emotion,
      },
      expectation: setup.expectation,
      knowledge: setup.knowledgeResult,
      managerToxic: setup.managerToxic,
      telemetry: {
        variantId: variant.id,
        model: servedModel,
        usage,
        costUsd: estimateCostUsd(servedModel, usage),
        totalMs: Date.now() - setup.startedAt,
        knowledgeMs: setup.knowledgeResult.latencyMs,
        personaMs: personaResult.latencyMs,
        knowledgeSnippets: setup.knowledgeResult.snippets.length,
        meta: {
          engagement: engagement.id,
          ...setup.knowledgeResult.meta,
          ...personaResult.meta,
        },
      },
    };
  }

  return {
    variant,

    async respond(input) {
      const setup = await resolveTurnSetup(input);
      if (setup.silent) return setup.result;

      const personaResult = await persona.respond(
        setup.personaRequest,
        setup.requestDeps,
      );
      return finishTurn(setup, personaResult);
    },

    respondStream(input): PipelineStreamResult {
      let resolveResult!: (value: TurnResult) => void;
      let rejectResult!: (reason: unknown) => void;
      const result = new Promise<TurnResult>((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
      });

      async function* chunks(): AsyncGenerator<PipelineStreamChunk> {
        try {
          const setup = await resolveTurnSetup(input);
          if (setup.silent) {
            resolveResult(setup.result);
            return;
          }

          const personaStream = persona.respondStream
            ? persona.respondStream(setup.personaRequest, setup.requestDeps)
            : bufferedPersonaStream(
                persona.respond(setup.personaRequest, setup.requestDeps),
              );

          for await (const chunk of personaStream.stream) {
            yield { reply: chunk.reply };
          }

          const personaResult = await personaStream.result;
          resolveResult(finishTurn(setup, personaResult));
        } catch (cause) {
          rejectResult(cause);
          throw cause;
        }
      }

      return { stream: chunks(), result };
    },

    async evaluate(dialog) {
      const expectation = resolveDialogExpectation(dialog);
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
