import {
  createEngine,
  hasKnownPricing,
  type LlmProvider,
  resolveVariant,
  type VariantConfig,
} from "@acme/ai";
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
  measurePersonaDrift,
  rewardFor,
  seriesByFixture,
  setScore,
  summarize,
  type VariantSummary,
} from "./metrics";
import { comparePaired, type PairedComparison } from "./statistics";

export interface RunOptions {
  variantIds: string[];
  provider: LlmProvider;
  fixtures?: EvalFixture[];
  catalog?: Catalog;
  variants?: VariantConfig[];
  /** Repeat the fixture set N times so learning strategies can improve. */
  epochs?: number;
  /**
   * Repetitions of each fixture inside an epoch.
   *
   * LLM answers vary between identical calls; a single run per fixture cannot
   * tell a real improvement from that variance. Two or three runs give the
   * within-fixture spread that the report prints next to every mean.
   */
  runsPerFixture?: number;
  /** Arm every candidate is compared against. Defaults to `baseline`. */
  referenceVariantId?: string;
  /**
   * How many fixtures to run at once.
   *
   * Defaults to 1: sequential order is what makes a learning arm's curve
   * reproducible, since the bandit's state depends on the order rewards
   * arrive. Raise it for stateless arms, where a full sweep is otherwise
   * dominated by round-trip latency.
   */
  concurrency?: number;
  /** Feed the reward back to persona strategies that implement `learn`. */
  learn?: boolean;
  onProgress?: (message: string) => void;
}

/** One metric, compared against the reference arm. */
export interface MetricComparison extends PairedComparison {
  metric: string;
  label: string;
  direction: "lower" | "higher";
}

export interface VariantComparison {
  variantId: string;
  metrics: MetricComparison[];
}

const COMPARED_METRICS: {
  metric: string;
  label: string;
  direction: "lower" | "higher";
  select: (item: ItemResult) => number;
}[] = [
  {
    metric: "scoreMae",
    label: "MAE к эксперту",
    direction: "lower",
    select: (item) => item.absError,
  },
  {
    metric: "actualStyleAccuracy",
    label: "Точность стиля",
    direction: "higher",
    select: (item) => (item.actualStyleCorrect ? 1 : 0),
  },
  {
    metric: "criteriaF1",
    label: "F1 по критериям",
    direction: "higher",
    select: (item) => item.criteria.f1,
  },
  {
    metric: "personaAdherence",
    label: "Удержание роли",
    direction: "higher",
    select: (item) => (item.personaViolations.length === 0 ? 1 : 0),
  },
  {
    metric: "personaDriftRate",
    label: "Дрейф персоны",
    direction: "lower",
    select: (item) => item.personaDrift.rate,
  },
  {
    metric: "costUsd",
    label: "Стоимость диалога",
    direction: "lower",
    select: (item) => item.costUsd,
  },
];

/**
 * Paired comparison of every arm against the reference, over one set of items.
 *
 * Exported (not just used inline by `runEvaluation`) so a report can be
 * recomputed from a saved `items` array — e.g. after a statistics fix —
 * without re-running the arm through the provider and spending quota again.
 */
export function buildComparisons(
  items: ItemResult[],
  variantIds: string[],
  referenceVariantId: string,
): VariantComparison[] {
  return variantIds
    .filter((variantId) => variantId !== referenceVariantId)
    .map((variantId) => ({
      variantId,
      metrics: COMPARED_METRICS.map((definition) => ({
        metric: definition.metric,
        label: definition.label,
        direction: definition.direction,
        ...comparePaired({
          baseline: seriesByFixture(
            items,
            referenceVariantId,
            definition.select,
          ),
          candidate: seriesByFixture(items, variantId, definition.select),
          direction: definition.direction,
        }),
      })),
    }));
}

/** A scenario that could not be completed, kept out of the metrics. */
export interface RunFailure {
  fixtureId: string;
  variantId: string;
  message: string;
}

export interface RunResult {
  startedAt: string;
  finishedAt: string;
  providerId: string;
  model: string;
  epochs: number;
  runsPerFixture: number;
  fixtures: number;
  /** How many fixtures carry a methodologist-signed label. */
  expertLabelledFixtures: number;
  referenceVariantId: string;
  variants: VariantSummary[];
  /** Paired significance of every candidate against the reference arm. */
  comparisons: VariantComparison[];
  /** Scenarios that errored out; excluded from every metric above. */
  failures: RunFailure[];
  /**
   * Which pool candidate served how many calls, when a failover pool was used.
   *
   * A run that quietly fell back to a weaker endpoint still produces numbers;
   * this is what lets a reader see that it did.
   */
  poolStats?: {
    servedBy: Record<string, number>;
    availabilityFailures: Record<string, number>;
    capabilityFailures: Record<string, number>;
  };
  /** Per-epoch summaries, so a learning curve is visible. */
  epochSummaries: { epoch: number; variants: VariantSummary[] }[];
  items: ItemResult[];
  /**
   * Models that served at least one call but have no entry in
   * `MODEL_PRICING`. Their `$/диалог` reads as `0`, same as a confirmed free
   * tier — this is what tells the two apart in the report instead of a paid
   * gateway silently looking free.
   */
  unpricedModels: string[];
  /**
   * Non-reference variants whose `evaluation` strategy differs from the
   * reference's.
   *
   * Fixtures are labelled by (or close to) the rules engine, so a variant
   * scored by `llm-judge`/`hybrid` disagreeing with a rules-scored reference
   * on criteria F1 mostly measures judge noise against the label source, not
   * the knowledge/persona change under test. `criteriaF1` and
   * `actualStyleAccuracy` are not safe to read as an effect of the variant
   * for these arms.
   */
  evaluationStrategyMismatch: string[];
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
  const runsPerFixture = Math.max(1, options.runsPerFixture ?? 1);

  const engine = createEngine({
    provider: options.provider,
    catalog,
    variants: options.variants,
  });

  const items: ItemResult[] = [];
  const failures: RunFailure[] = [];
  const epochSummaries: RunResult["epochSummaries"] = [];

  for (let epoch = 1; epoch <= epochs; epoch += 1) {
    const epochItems: ItemResult[] = [];

    for (const variantId of options.variantIds) {
      const pipeline = engine.pipeline(variantId);

      const jobs: { fixture: EvalFixture; run: number }[] = [];
      for (const fixture of fixtures) {
        for (let run = 1; run <= runsPerFixture; run += 1) {
          jobs.push({ fixture, run });
        }
      }

      let cursor = 0;
      let done = 0;

      const worker = async (): Promise<void> => {
        while (cursor < jobs.length) {
          const job = jobs[cursor];
          cursor += 1;
          if (!job) return;
          const { fixture, run } = job;

          done += 1;
          options.onProgress?.(
            `эпоха ${epoch}/${epochs} · ${done}/${jobs.length} · ${variantId} · ${fixture.id}`,
          );

          try {
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
            const models = new Set<string>([probe.telemetry.model]);

            for (const utterance of fixture.script) {
              const turn = await pipeline.respond({ dialog, utterance });
              dialog = turn.dialog;
              latencyMs += turn.telemetry.totalMs;
              inputTokens += turn.telemetry.usage.inputTokens;
              outputTokens += turn.telemetry.usage.outputTokens;
              costUsd += turn.telemetry.costUsd;
              turnMeta.push(turn.telemetry.meta);
              models.add(turn.telemetry.model);
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
                evaluated.evaluation.expectedStyle ===
                fixture.label.expectedStyle,
              actualStyleCorrect:
                evaluated.evaluation.actualStyle === fixture.label.actualStyle,
              criteria: setScore(metCriteria, fixture.label.metCriteria),
              personaViolations: checkPersonaAdherence(dialog.turns),
              personaDrift: measurePersonaDrift(dialog.turns),
              silenceRespected: probe.reply.silent,
              employeeReplies: dialog.turns.filter(
                (turn) => turn.role === "employee",
              ).length,
              latencyMs,
              inputTokens,
              outputTokens,
              costUsd,
              run,
              models: [...models].filter(Boolean),
            };

            items.push(item);
            epochItems.push(item);

            if (options.learn) {
              await pipeline.learn({
                dialogId: `${fixture.id}:${epoch}:${run}`,
                variantId,
                evaluation: evaluated.evaluation,
                reward: rewardFor(item),
                turnMeta,
              });
            }
          } catch (cause) {
            // One unlucky dialog must not discard a benchmark that has already
            // spent an hour and real money. The failure is recorded and the
            // scenario is dropped from the metrics — reported as a count, so a
            // variant cannot look good by failing on the cases it finds hard.
            failures.push({
              fixtureId: fixture.id,
              variantId,
              message: cause instanceof Error ? cause.message : String(cause),
            });
            options.onProgress?.(
              `эпоха ${epoch}/${epochs} · ${variantId} · ${fixture.id} — СБОЙ`,
            );
          }
        }
      };

      const concurrency = Math.max(
        1,
        Math.min(options.concurrency ?? 1, jobs.length),
      );
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
    }

    epochSummaries.push({
      epoch,
      variants: options.variantIds.map((variantId) =>
        summarize(variantId, epochItems),
      ),
    });
  }

  // Significance is computed on the final epoch only: with `--learn` the
  // earlier epochs are a policy that no longer exists, and pooling them would
  // dilute the very improvement the run is meant to detect.
  const finalEpochItems = items.filter((item) => item.epoch === epochs);
  const referenceVariantId =
    options.referenceVariantId ??
    (options.variantIds.includes("baseline")
      ? "baseline"
      : (options.variantIds[0] ?? "baseline"));

  const comparisons = buildComparisons(
    finalEpochItems,
    options.variantIds,
    referenceVariantId,
  );

  // The pool exposes `stats()`; a plain provider does not. Duck-typing keeps
  // the runner independent of which provider it was handed.
  const withStats = options.provider as unknown as {
    stats?: () => RunResult["poolStats"];
  };
  const poolStats =
    typeof withStats.stats === "function" ? withStats.stats() : undefined;

  const variants = options.variantIds.map((variantId) =>
    summarize(variantId, items),
  );
  const servedModels = new Set(
    variants.flatMap((variant) => Object.keys(variant.modelMix)),
  );
  const unpricedModels = [...servedModels].filter(
    (model) => !hasKnownPricing(model),
  );

  const referenceEvaluation = resolveVariant(
    referenceVariantId,
    options.variants,
  ).evaluation;
  const evaluationStrategyMismatch = options.variantIds.filter(
    (variantId) =>
      variantId !== referenceVariantId &&
      resolveVariant(variantId, options.variants).evaluation !==
        referenceEvaluation,
  );

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    providerId: options.provider.id,
    model: options.provider.model,
    epochs,
    runsPerFixture,
    fixtures: fixtures.length,
    expertLabelledFixtures: fixtures.filter(
      (fixture) => fixture.labelSource === "expert",
    ).length,
    referenceVariantId,
    variants,
    comparisons,
    failures,
    epochSummaries,
    items,
    unpricedModels,
    evaluationStrategyMismatch,
    poolStats,
  };
}
