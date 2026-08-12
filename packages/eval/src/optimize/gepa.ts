import type { LlmProvider, VariantConfig } from "@acme/ai";
import { z } from "zod";

import type { EvalFixture } from "../fixtures";
import type { ItemResult } from "../metrics";
import { runEvaluation } from "../runner";

/**
 * Reflective prompt evolution (GEPA-style).
 *
 * The idea the method rests on: a natural-language rollout carries far more
 * signal than the scalar reward an RL update sees. Instead of nudging weights
 * with a number, the optimiser *reads* what went wrong on the failing
 * scenarios and rewrites the prompt — which is why it converges in tens of
 * rollouts where policy-gradient methods need thousands.
 *
 * Two things make it more than "ask a model to improve the prompt":
 *
 * 1. A **Pareto frontier** of candidates, not a single incumbent. A candidate
 *    is kept if it is the best on *any* individual scenario. Greedy hill
 *    climbing on the average collapses onto one local optimum and stays there;
 *    keeping per-scenario champions preserves the diversity that later
 *    mutations recombine.
 * 2. **Held-out validation.** A candidate is only promoted if it also wins on
 *    scenarios it was never shown, otherwise the optimiser writes prompts that
 *    memorise the minibatch.
 */

export interface GepaSlot {
  /** Which variant parameter this optimiser writes to. */
  param: "roleRules" | "styleJudgeSystem" | "criteriaJudgeSystem";
  /** Human-readable description of the prompt's job, used in reflection. */
  role: string;
  /** Starting text. */
  seed: string;
}

export interface GepaOptions {
  slot: GepaSlot;
  /** Variant the optimiser runs the pipeline as. */
  baseVariant: VariantConfig;
  provider: LlmProvider;
  /** Model used for reflection; defaults to the same provider. */
  reflectionProvider?: LlmProvider;
  fixtures: EvalFixture[];
  /** Scenarios per mutation step. Small is fine — the signal is the text. */
  minibatchSize?: number;
  /** Total mutation steps. */
  iterations?: number;
  concurrency?: number;
  seed?: number;
  onProgress?: (message: string) => void;
}

export interface GepaCandidate {
  id: string;
  text: string;
  /** Score per fixture id, higher is better. */
  scores: Map<string, number>;
  meanScore: number;
  parentId: string | null;
  /** Why the reflector said it changed the prompt. */
  rationale: string;
}

export interface GepaResult {
  slot: GepaSlot["param"];
  best: GepaCandidate;
  seedScore: number;
  bestScore: number;
  /** Every candidate that was ever on the frontier. */
  frontier: GepaCandidate[];
  iterations: number;
  evaluations: number;
}

const reflectionSchema = z.object({
  diagnosis: z
    .string()
    .describe("Что именно в текущей инструкции привело к ошибкам"),
  prompt: z
    .string()
    .describe("Новая версия инструкции целиком, на русском языке"),
  rationale: z.string().describe("Что изменено и почему, одно-два предложения"),
});

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Objective the optimiser maximises, per scenario.
 *
 * Combines the two things a good arm has to do at once — agree with the expert
 * and keep the character in role — so the optimiser cannot buy accuracy by
 * turning the cook into an analyst.
 */
function objective(item: ItemResult): number {
  const accuracy = 1 - Math.min(1, item.absError / 100);
  const styleMatch = item.actualStyleCorrect ? 1 : 0;
  const roleplay = item.personaViolations.length === 0 ? 1 : 0;
  const drift = 1 - Math.min(1, item.personaDrift.rate);
  return 0.4 * accuracy + 0.3 * styleMatch + 0.2 * roleplay + 0.1 * drift;
}

async function scoreCandidate(
  text: string,
  fixtures: EvalFixture[],
  options: GepaOptions,
): Promise<Map<string, number>> {
  const variant: VariantConfig = {
    ...options.baseVariant,
    id: `${options.baseVariant.id}__candidate`,
    params: { ...options.baseVariant.params, [options.slot.param]: text },
  };

  const result = await runEvaluation({
    variantIds: [variant.id],
    variants: [variant],
    provider: options.provider,
    fixtures,
    concurrency: options.concurrency ?? 4,
  });

  const scores = new Map<string, number>();
  for (const item of result.items) scores.set(item.fixtureId, objective(item));
  return scores;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Keep candidates that win at least one scenario outright.
 *
 * This is the Pareto step: a prompt that is mediocre on average but the only
 * one that handles "expert given a brand-new task" stays in the pool, because
 * that is exactly the behaviour a later mutation needs to inherit.
 */
function paretoFrontier(candidates: GepaCandidate[]): GepaCandidate[] {
  const fixtureIds = new Set<string>();
  for (const candidate of candidates) {
    for (const id of candidate.scores.keys()) fixtureIds.add(id);
  }

  const champions = new Set<string>();
  for (const fixtureId of fixtureIds) {
    let best = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      best = Math.max(best, candidate.scores.get(fixtureId) ?? 0);
    }
    for (const candidate of candidates) {
      if ((candidate.scores.get(fixtureId) ?? 0) >= best) {
        champions.add(candidate.id);
      }
    }
  }

  return candidates.filter((candidate) => champions.has(candidate.id));
}

function renderFailures(
  fixtures: EvalFixture[],
  scores: Map<string, number>,
  limit = 4,
): string {
  return [...scores.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, limit)
    .map(([fixtureId, score]) => {
      const fixture = fixtures.find((item) => item.id === fixtureId);
      if (!fixture) return "";
      return [
        `Сценарий ${fixtureId} (оценка ${score.toFixed(2)}):`,
        `  Ситуация: ${fixture.description}`,
        `  Ожидался стиль: ${fixture.label.expectedStyle}, руководитель играл: ${fixture.label.actualStyle}`,
        `  Реплики руководителя: ${fixture.script.join(" | ")}`,
        `  Эталонная оценка эксперта: ${fixture.label.expertScore}`,
      ].join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

export async function optimizePrompt(
  options: GepaOptions,
): Promise<GepaResult> {
  const iterations = options.iterations ?? 6;
  const minibatchSize = options.minibatchSize ?? 6;
  const random = mulberry32(options.seed ?? 20260812);
  const reflector = options.reflectionProvider ?? options.provider;

  // Split once: mutations only ever see `train`, promotion is decided on
  // `holdout`, so a prompt that memorises the minibatch cannot win.
  const shuffled = [...options.fixtures].sort(() => random() - 0.5);
  const splitAt = Math.max(1, Math.floor(shuffled.length * 0.6));
  const train = shuffled.slice(0, splitAt);
  const holdout = shuffled.slice(splitAt);

  let evaluations = 0;

  options.onProgress?.("оценка исходного промпта");
  const seedScores = await scoreCandidate(options.slot.seed, train, options);
  evaluations += train.length;

  const seedCandidate: GepaCandidate = {
    id: "seed",
    text: options.slot.seed,
    scores: seedScores,
    meanScore: mean([...seedScores.values()]),
    parentId: null,
    rationale: "исходная инструкция",
  };

  const pool: GepaCandidate[] = [seedCandidate];

  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    const frontier = paretoFrontier(pool);
    const parent =
      frontier[Math.floor(random() * frontier.length)] ?? seedCandidate;

    const minibatch = [...train]
      .sort(() => random() - 0.5)
      .slice(0, minibatchSize);

    options.onProgress?.(
      `итерация ${iteration}/${iterations}: мутация от ${parent.id} (${parent.meanScore.toFixed(3)})`,
    );

    const failures = renderFailures(
      options.fixtures,
      new Map(
        minibatch.map((fixture) => [
          fixture.id,
          parent.scores.get(fixture.id) ?? 0,
        ]),
      ),
    );

    let reflection: z.infer<typeof reflectionSchema>;
    try {
      const response = await reflector.generate({
        purpose: "gepa.reflect",
        schemaName: "gepa_reflection",
        schema: reflectionSchema,
        system: `Ты улучшаешь системную инструкцию для ИИ в деловой игре по ситуационному руководству.
Назначение инструкции: ${options.slot.role}

Тебе показывают текущую инструкцию и сценарии, на которых она сработала хуже всего.
Проанализируй, какая формулировка привела к ошибке, и перепиши инструкцию целиком.

Требования к новой инструкции:
- на русском языке, того же назначения и формата, что исходная;
- конкретнее там, где текущая допускает разночтение;
- не длиннее полутора исходных длин: раздувание инструкции ухудшает следование ей;
- не упоминай конкретные сценарии из примеров — инструкция должна работать на любых.`,
        messages: [
          {
            role: "user",
            content: `Текущая инструкция:\n"""\n${parent.text}\n"""\n\nХудшие сценарии:\n${failures}`,
          },
        ],
      });
      reflection = response.value;
    } catch (cause) {
      options.onProgress?.(
        `итерация ${iteration}: рефлексия не удалась (${
          cause instanceof Error ? cause.message : String(cause)
        })`,
      );
      continue;
    }

    const scores = await scoreCandidate(reflection.prompt, train, options);
    evaluations += train.length;

    const candidate: GepaCandidate = {
      id: `iter${iteration}`,
      text: reflection.prompt,
      scores,
      meanScore: mean([...scores.values()]),
      parentId: parent.id,
      rationale: reflection.rationale,
    };

    // Only candidates that beat their own parent enter the pool; without this
    // the frontier fills with noise and reflection starts mutating garbage.
    if (candidate.meanScore >= parent.meanScore) {
      pool.push(candidate);
      options.onProgress?.(
        `итерация ${iteration}: принят (${candidate.meanScore.toFixed(3)} ≥ ${parent.meanScore.toFixed(3)})`,
      );
    } else {
      options.onProgress?.(
        `итерация ${iteration}: отклонён (${candidate.meanScore.toFixed(3)} < ${parent.meanScore.toFixed(3)})`,
      );
    }
  }

  // Promotion is decided on scenarios no mutation ever saw.
  options.onProgress?.("проверка на отложенной выборке");
  const contenders = paretoFrontier(pool).slice(0, 4);
  let best = seedCandidate;
  let bestHoldout = Number.NEGATIVE_INFINITY;
  let seedHoldout = 0;

  for (const candidate of [seedCandidate, ...contenders]) {
    if (holdout.length === 0) break;
    const scores = await scoreCandidate(candidate.text, holdout, options);
    evaluations += holdout.length;
    const score = mean([...scores.values()]);
    if (candidate.id === "seed") seedHoldout = score;
    if (score > bestHoldout) {
      bestHoldout = score;
      best = candidate;
    }
  }

  return {
    slot: options.slot.param,
    best,
    seedScore: seedHoldout,
    bestScore: bestHoldout,
    frontier: paretoFrontier(pool),
    iterations,
    evaluations,
  };
}
