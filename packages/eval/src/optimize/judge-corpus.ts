import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  createEngine,
  type LlmProvider,
  renderTranscript,
  type VariantConfig,
} from "@acme/ai";
import {
  type Catalog,
  type CriterionId,
  defaultCatalog,
  detectToxicity,
  type ManagementStyle,
  resolveExpectation,
} from "@acme/game";

import type { EvalFixture } from "../fixtures";
import { buildDialog } from "../runner";

/**
 * One labelled judging task: a finished transcript plus the expert verdict.
 *
 * The point of materialising this is that a *judge* prompt cannot change the
 * transcript. Engagement, knowledge and persona all run before evaluation and
 * are untouched by `styleJudgeSystem` / `criteriaJudgeSystem`, so replaying the
 * dialog once per fixture and reusing it for every candidate turns the inner
 * loop of judge optimisation from "four LLM calls per turn plus evaluation"
 * into a single evaluation call.
 *
 * GEPA does not do this — it re-runs the whole pipeline for every candidate —
 * which is most of why judge slots are expensive to optimise today.
 */
export interface JudgeSample {
  fixtureId: string;
  description: string;
  /** `renderTranscript(dialog)`: exactly what the judge sees in production. */
  transcript: string;
  /** Criteria block the criteria judge is given, rendered the same way. */
  criteriaList: string;
  /** Criterion ids the judge is asked about, in the order they are listed. */
  criterionIds: CriterionId[];
  /** Style the methodology required, derived from the rubric, not the label. */
  resolvedExpectedStyle: ManagementStyle;
  /**
   * What the scripted manager said, in order.
   *
   * Kept because the style label only records *which* style was played, not
   * where — so a seed demonstration has to quote the script to show its
   * evidence, and inventing a quote is not an option.
   */
  managerTurns: string[];
  /**
   * Rude manager turns, by the deterministic guardrail.
   *
   * The fixtures carry no toxicity label, and asking a model to invent one
   * would put noise into the ground truth. `detectToxicity` is the same check
   * the rules-based arm scores with, so using it here keeps the seed
   * demonstration consistent with the rubric rather than with a guess.
   */
  toxicManagerQuotes: string[];
  label: {
    expectedStyle: ManagementStyle;
    actualStyle: ManagementStyle;
    expertScore: number;
    metCriteria: CriterionId[];
  };
  labelSource: EvalFixture["labelSource"];
}

interface CachedCorpus {
  version: number;
  variantId: string;
  model: string;
  fixtureHash: string;
  builtAt: string;
  samples: JudgeSample[];
}

/**
 * Bumped whenever the shape of a sample or the way it is produced changes, so
 * a stale cache is discarded instead of quietly feeding the optimiser
 * transcripts that no longer match what the judge would receive.
 */
const CACHE_VERSION = 2;

export interface BuildJudgeCorpusOptions {
  fixtures: EvalFixture[];
  variant: VariantConfig;
  provider: LlmProvider;
  catalog?: Catalog;
  /** Fixtures replayed at once. */
  concurrency?: number;
  /** Where to keep the replayed transcripts. Set to `null` to disable. */
  cachePath?: string | null;
  /** Rebuild even when a matching cache exists. */
  refresh?: boolean;
  onProgress?: (message: string) => void;
}

function fixtureHash(fixtures: EvalFixture[]): string {
  const hash = createHash("sha256");
  for (const fixture of fixtures) {
    hash.update(fixture.id);
    hash.update(fixture.script.join("\u0000"));
    hash.update(String(fixture.label.expertScore));
    hash.update(fixture.label.actualStyle);
    hash.update(fixture.label.expectedStyle);
    hash.update([...fixture.label.metCriteria].sort().join(","));
  }
  return hash.digest("hex").slice(0, 16);
}

export function defaultCorpusPath(variantId: string): string {
  return resolve(
    import.meta.dirname,
    "../../.cache",
    `judge-corpus-${variantId}.json`,
  );
}

async function readCache(
  path: string,
  expected: Pick<CachedCorpus, "variantId" | "fixtureHash">,
): Promise<JudgeSample[] | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    const cached = JSON.parse(raw) as CachedCorpus;
    if (cached.version !== CACHE_VERSION) return undefined;
    if (cached.variantId !== expected.variantId) return undefined;
    if (cached.fixtureHash !== expected.fixtureHash) return undefined;
    return cached.samples;
  } catch {
    // No cache, unreadable cache, or a shape from an older build — all mean
    // "replay the dialogs", none of them mean "fail the optimisation".
    return undefined;
  }
}

/**
 * Replay every fixture's scripted manager and keep the resulting transcript.
 *
 * A fixture that fails mid-replay is dropped rather than aborting the run, for
 * the same reason `runEvaluation` drops it: one unlucky dialog must not discard
 * work that already cost quota. The count of survivors is what the caller
 * reports.
 */
export async function buildJudgeCorpus(
  options: BuildJudgeCorpusOptions,
): Promise<JudgeSample[]> {
  const catalog = options.catalog ?? defaultCatalog;
  const hash = fixtureHash(options.fixtures);
  const cachePath =
    options.cachePath === null
      ? undefined
      : (options.cachePath ?? defaultCorpusPath(options.variant.id));

  if (cachePath && !options.refresh) {
    const cached = await readCache(cachePath, {
      variantId: options.variant.id,
      fixtureHash: hash,
    });
    if (cached) {
      options.onProgress?.(
        `корпус транскриптов взят из кэша (${cached.length} сценариев): ${cachePath}`,
      );
      return cached;
    }
  }

  const engine = createEngine({
    provider: options.provider,
    catalog,
    variants: [options.variant],
  });
  const pipeline = engine.pipeline(options.variant.id);

  const samples: JudgeSample[] = [];
  const failures: string[] = [];
  let cursor = 0;
  let done = 0;

  const worker = async (): Promise<void> => {
    while (cursor < options.fixtures.length) {
      const fixture = options.fixtures[cursor];
      cursor += 1;
      if (!fixture) return;

      done += 1;
      options.onProgress?.(
        `реплей ${done}/${options.fixtures.length} · ${fixture.id}`,
      );

      try {
        let dialog = buildDialog(fixture, catalog);
        for (const utterance of fixture.script) {
          const turn = await pipeline.respond({ dialog, utterance });
          dialog = turn.dialog;
        }

        const expectation = resolveExpectation(
          dialog.employee,
          dialog.task,
          dialog.shift,
        );

        const managerTurns = dialog.turns
          .filter((turn) => turn.role === "manager")
          .map((turn) => turn.text);

        samples.push({
          fixtureId: fixture.id,
          description: fixture.description,
          transcript: renderTranscript(dialog),
          criteriaList: expectation.requiredCriteria
            .map((criterion) => `- ${criterion.id}: ${criterion.title}`)
            .join("\n"),
          criterionIds: expectation.requiredCriteria.map(
            (criterion) => criterion.id,
          ),
          resolvedExpectedStyle: expectation.expectedStyle,
          managerTurns,
          toxicManagerQuotes: managerTurns.filter((text) =>
            detectToxicity(text),
          ),
          label: {
            expectedStyle: fixture.label.expectedStyle,
            actualStyle: fixture.label.actualStyle,
            expertScore: fixture.label.expertScore,
            metCriteria: [...fixture.label.metCriteria],
          },
          labelSource: fixture.labelSource,
        });
      } catch (cause) {
        failures.push(
          `${fixture.id}: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
        options.onProgress?.(`реплей ${fixture.id} — СБОЙ`);
      }
    }
  };

  const concurrency = Math.max(
    1,
    Math.min(options.concurrency ?? 4, options.fixtures.length),
  );
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (samples.length === 0) {
    throw new Error(
      `Не удалось воспроизвести ни один сценарий:\n${failures.join("\n")}`,
    );
  }
  if (failures.length > 0) {
    options.onProgress?.(
      `не воспроизведено ${failures.length} сценариев: ${failures.join("; ")}`,
    );
  }

  // Concurrency scrambles the order; a stable corpus keeps a seeded
  // train/holdout split reproducible across runs.
  samples.sort((a, b) => a.fixtureId.localeCompare(b.fixtureId));

  if (cachePath) {
    const payload: CachedCorpus = {
      version: CACHE_VERSION,
      variantId: options.variant.id,
      model: options.provider.model,
      fixtureHash: hash,
      builtAt: new Date().toISOString(),
      samples,
    };
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify(payload, null, 2), "utf8");
    options.onProgress?.(`корпус транскриптов сохранён: ${cachePath}`);
  }

  return samples;
}
