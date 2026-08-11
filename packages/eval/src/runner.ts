import { createEngine, type LlmProvider, type VariantConfig } from "@acme/ai";
import {
  type Catalog,
  type DialogContext,
  defaultCatalog,
  findEmployee,
  findTask,
  resolveShiftLoad,
} from "@acme/game";

import { type EvalFixture, FIXTURES, SILENCE_PROBE } from "./fixtures";
import {
  checkPersonaAdherence,
  type ItemResult,
  rewardFor,
  setScore,
  summarize,
  type VariantSummary,
} from "./metrics";

export interface RunOptions {
  variantIds: string[];
  provider: LlmProvider;
  fixtures?: EvalFixture[];
  catalog?: Catalog;
  variants?: VariantConfig[];
  /** Repeat the fixture set N times so learning strategies can improve. */
  epochs?: number;
  /** Feed the reward back to persona strategies that implement `learn`. */
  learn?: boolean;
  onProgress?: (message: string) => void;
}

export interface RunResult {
  startedAt: string;
  finishedAt: string;
  providerId: string;
  model: string;
  epochs: number;
  fixtures: number;
  variants: VariantSummary[];
  /** Per-epoch summaries, so a learning curve is visible. */
  epochSummaries: { epoch: number; variants: VariantSummary[] }[];
  items: ItemResult[];
}

function buildDialog(fixture: EvalFixture, catalog: Catalog): DialogContext {
  const employee = findEmployee(catalog, fixture.employeeId);
  const task = findTask(catalog, fixture.taskId);
  if (!employee) throw new Error(`Unknown employee "${fixture.employeeId}"`);
  if (!task) throw new Error(`Unknown task "${fixture.taskId}"`);

  return {
    employee,
    task,
    order: {
      id: `${fixture.id}-order`,
      taskId: task.id,
      employeeId: employee.id,
      portions: 1,
      deadlineMinutes: 90,
    },
    shift: {
      round: fixture.round,
      activeOrders: fixture.activeOrders,
      soloOnShift: fixture.soloOnShift,
      load: resolveShiftLoad(fixture.activeOrders, fixture.soloOnShift),
    },
    turns: [],
    engaged: false,
    emotion: 0,
  };
}

/**
 * Replay every fixture through every variant and score the results.
 *
 * This is the answer to "did the new approach help?": same scripted
 * participants, same expert labels, different pipeline — and a table of
 * accuracy, role-play cleanliness, latency and cost at the end.
 */
export async function runEvaluation(options: RunOptions): Promise<RunResult> {
  const startedAt = new Date().toISOString();
  const fixtures = options.fixtures ?? FIXTURES;
  const catalog = options.catalog ?? defaultCatalog;
  const epochs = Math.max(1, options.epochs ?? 1);

  const engine = createEngine({
    provider: options.provider,
    catalog,
    variants: options.variants,
  });

  const items: ItemResult[] = [];
  const epochSummaries: RunResult["epochSummaries"] = [];

  for (let epoch = 1; epoch <= epochs; epoch += 1) {
    const epochItems: ItemResult[] = [];

    for (const variantId of options.variantIds) {
      const pipeline = engine.pipeline(variantId);

      for (const fixture of fixtures) {
        options.onProgress?.(
          `epoch ${epoch}/${epochs} · ${variantId} · ${fixture.id}`,
        );

        // The silence requirement is checked on a throwaway copy so the probe
        // never pollutes the transcript the score is computed from.
        const probe = await pipeline.respond({
          dialog: buildDialog(fixture, catalog),
          utterance: SILENCE_PROBE,
        });

        let dialog = buildDialog(fixture, catalog);
        let latencyMs = probe.telemetry.totalMs;
        let inputTokens = probe.telemetry.usage.inputTokens;
        let outputTokens = probe.telemetry.usage.outputTokens;
        let costUsd = probe.telemetry.costUsd;
        const turnMeta: Record<string, unknown>[] = [];

        for (const utterance of fixture.script) {
          const turn = await pipeline.respond({ dialog, utterance });
          dialog = turn.dialog;
          latencyMs += turn.telemetry.totalMs;
          inputTokens += turn.telemetry.usage.inputTokens;
          outputTokens += turn.telemetry.usage.outputTokens;
          costUsd += turn.telemetry.costUsd;
          turnMeta.push(turn.telemetry.meta);
        }

        const evaluated = await pipeline.evaluate(dialog);
        latencyMs += evaluated.latencyMs;
        inputTokens += evaluated.usage?.inputTokens ?? 0;
        outputTokens += evaluated.usage?.outputTokens ?? 0;
        costUsd += evaluated.costUsd;

        const metCriteria = evaluated.evaluation.criteria
          .filter((criterion) => criterion.met)
          .map((criterion) => criterion.id);

        const item: ItemResult = {
          fixtureId: fixture.id,
          variantId,
          epoch,
          score: evaluated.evaluation.scorePercent,
          expertScore: fixture.label.expertScore,
          absError: Math.abs(
            evaluated.evaluation.scorePercent - fixture.label.expertScore,
          ),
          expectedStyle: evaluated.evaluation.expectedStyle,
          labelExpectedStyle: fixture.label.expectedStyle,
          actualStyle: evaluated.evaluation.actualStyle,
          labelActualStyle: fixture.label.actualStyle,
          expectedStyleCorrect:
            evaluated.evaluation.expectedStyle === fixture.label.expectedStyle,
          actualStyleCorrect:
            evaluated.evaluation.actualStyle === fixture.label.actualStyle,
          criteria: setScore(metCriteria, fixture.label.metCriteria),
          personaViolations: checkPersonaAdherence(dialog.turns),
          silenceRespected: probe.reply.silent,
          employeeReplies: dialog.turns.filter(
            (turn) => turn.role === "employee",
          ).length,
          latencyMs,
          inputTokens,
          outputTokens,
          costUsd,
        };

        items.push(item);
        epochItems.push(item);

        if (options.learn) {
          await pipeline.learn({
            dialogId: `${fixture.id}:${epoch}`,
            variantId,
            evaluation: evaluated.evaluation,
            reward: rewardFor(item),
            turnMeta,
          });
        }
      }
    }

    epochSummaries.push({
      epoch,
      variants: options.variantIds.map((variantId) =>
        summarize(variantId, epochItems),
      ),
    });
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    providerId: options.provider.id,
    model: options.provider.model,
    epochs,
    fixtures: fixtures.length,
    variants: options.variantIds.map((variantId) =>
      summarize(variantId, items),
    ),
    epochSummaries,
    items,
  };
}
