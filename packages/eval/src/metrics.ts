import type { CriterionId, DialogTurn, ManagementStyle } from "@acme/game";

import { cohensKappa } from "./statistics";

/**
 * Vocabulary the character must never use: naming the methodology hands the
 * participant the answer and destroys the exercise.
 */
export const FORBIDDEN_PERSONA_TERMS = [
  "стиль управления",
  "директивн",
  "делегирующ",
  "делегировани",
  "наставнич",
  "поддерживающ",
  "уровень готовности",
  "методолог",
  "критери",
  "баллов",
  "процент",
];

export function checkPersonaAdherence(turns: DialogTurn[]): string[] {
  const violations: string[] = [];

  for (const turn of turns) {
    if (turn.role !== "employee") continue;
    const text = turn.text.toLowerCase();

    for (const term of FORBIDDEN_PERSONA_TERMS) {
      if (text.includes(term)) violations.push(`упомянул «${term}»`);
    }
    if (turn.text.trim().length === 0) violations.push("пустая реплика");
  }

  return violations;
}

/**
 * Phrases that mark a slip from "cook on shift" back into "helpful assistant".
 *
 * Persona drift is gradual and turn-by-turn — measured drops of 20–40% in
 * character fidelity over 10–15 turns are typical — so a pass/fail check at
 * the end of a dialog cannot see it. These markers are the cheap, deterministic
 * signal; a model-based judge would be more sensitive but not comparable
 * across arms for free.
 */
export const ASSISTANT_REGISTER_MARKERS = [
  "чем ещё могу",
  "чем я могу помочь",
  "готов помочь",
  "если у вас есть вопросы",
  "надеюсь, это помогло",
  "вот несколько",
  "рекомендую следующее",
  "давайте разберём",
  "как ассистент",
  "как языковая модель",
  "я — ии",
  "я ии",
];

/** Share of turns that slipped into assistant register. */
function assistantRegisterRate(turns: DialogTurn[]): number {
  if (turns.length === 0) return 0;
  const slipped = turns.filter((turn) => {
    const text = turn.text.toLowerCase();
    // A bulleted list is assistant formatting, not kitchen speech.
    if (/^\s*[-*•]\s|\n\s*[-*•]\s|\n\s*\d+\.\s/.test(turn.text)) return true;
    return ASSISTANT_REGISTER_MARKERS.some((marker) => text.includes(marker));
  }).length;
  return slipped / turns.length;
}

export interface PersonaDrift {
  /** Assistant-register rate across the whole dialog, 0–1. */
  rate: number;
  /** Second half minus first half: positive means the character is slipping. */
  slope: number;
}

/**
 * How far the character drifted out of role over the course of the dialog.
 *
 * Reported separately from `personaViolations` (which catches leaking the
 * methodology): a character can never name a management style and still stop
 * sounding like a cook.
 */
export function measurePersonaDrift(turns: DialogTurn[]): PersonaDrift {
  const employeeTurns = turns.filter((turn) => turn.role === "employee");
  if (employeeTurns.length === 0) return { rate: 0, slope: 0 };

  const midpoint = Math.floor(employeeTurns.length / 2);
  const firstHalf = employeeTurns.slice(0, midpoint);
  const secondHalf = employeeTurns.slice(midpoint);

  return {
    rate: round(assistantRegisterRate(employeeTurns)),
    slope: round(
      assistantRegisterRate(secondHalf) - assistantRegisterRate(firstHalf),
    ),
  };
}

export interface SetScore {
  precision: number;
  recall: number;
  f1: number;
}

export function setScore(
  predicted: Iterable<CriterionId>,
  actual: Iterable<CriterionId>,
): SetScore {
  const predictedSet = new Set(predicted);
  const actualSet = new Set(actual);

  if (predictedSet.size === 0 && actualSet.size === 0) {
    return { precision: 1, recall: 1, f1: 1 };
  }

  let truePositives = 0;
  for (const id of predictedSet) if (actualSet.has(id)) truePositives += 1;

  const precision =
    predictedSet.size === 0 ? 0 : truePositives / predictedSet.size;
  const recall = actualSet.size === 0 ? 0 : truePositives / actualSet.size;
  const f1 =
    precision + recall === 0
      ? 0
      : (2 * precision * recall) / (precision + recall);

  return { precision, recall, f1 };
}

export interface ItemResult {
  fixtureId: string;
  variantId: string;
  epoch: number;
  score: number;
  expertScore: number;
  absError: number;
  expectedStyle: ManagementStyle;
  labelExpectedStyle: ManagementStyle;
  actualStyle: ManagementStyle;
  labelActualStyle: ManagementStyle;
  expectedStyleCorrect: boolean;
  actualStyleCorrect: boolean;
  criteria: SetScore;
  personaViolations: string[];
  personaDrift: PersonaDrift;
  silenceRespected: boolean;
  employeeReplies: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** Which repetition of the fixture this is, for variance estimates. */
  run: number;
  /** Per-turn strategy telemetry retained in the serialized run report. */
  turnMeta: Record<string, unknown>[];
  /**
   * Models that actually served this dialog.
   *
   * With a failover pool a scenario can be answered by a different model than
   * the one the run started on. Two arms served by different models are not
   * comparable, so the mix is carried per item rather than assumed uniform.
   */
  models: string[];
  /**
   * The actual dialog, kept only for the first repetition of a fixture
   * (`run === 1`) — repeated runs exist for variance estimates, not to
   * triple the transcript volume. This is what lets a report show a real
   * exchange instead of only the aggregate metrics above.
   */
  turns?: DialogTurn[];
  /** The evaluator's own account of what happened in this dialog, in Russian. */
  summary?: string;
}

export interface VariantSummary {
  variantId: string;
  items: number;
  /** Mean absolute error of the automatic score vs the expert score. */
  scoreMae: number;
  /** Spread of the automatic score across repeated runs of the same fixture. */
  scoreStdDev: number;
  /** Share of dialogs where the expected style matched the methodology. */
  expectedStyleAccuracy: number;
  /** Share of dialogs where the detected style matched the expert label. */
  actualStyleAccuracy: number;
  /**
   * Chance-corrected agreement with the expert on the detected style.
   *
   * Reported next to raw accuracy on purpose: on a skewed label distribution
   * a judge that always answers "directive" scores high accuracy and κ ≈ 0.
   */
  styleKappa: number;
  criteriaF1: number;
  /** Share of dialogs with a clean role-play (no leaked methodology). */
  personaAdherence: number;
  /** Assistant-register slip rate, and whether it grows over the dialog. */
  personaDriftRate: number;
  personaDriftSlope: number;
  /** Share of dialogs where the character kept quiet until addressed. */
  silenceAccuracy: number;
  avgLatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  avgCostUsd: number;
  /** Distinct models that served this arm, with how many dialogs each took. */
  modelMix: Record<string, number>;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Standard deviation of the automatic score *within* a fixture. */
function withinFixtureStdDev(items: ItemResult[]): number {
  const byFixture = new Map<string, number[]>();
  for (const item of items) {
    const bucket = byFixture.get(item.fixtureId) ?? [];
    bucket.push(item.score);
    byFixture.set(item.fixtureId, bucket);
  }

  const deviations: number[] = [];
  for (const scores of byFixture.values()) {
    if (scores.length < 2) continue;
    const average = mean(scores);
    const variance =
      scores.reduce((sum, score) => sum + (score - average) ** 2, 0) /
      (scores.length - 1);
    deviations.push(Math.sqrt(variance));
  }

  return mean(deviations);
}

export function summarize(
  variantId: string,
  items: ItemResult[],
): VariantSummary {
  const own = items.filter((item) => item.variantId === variantId);

  return {
    variantId,
    items: own.length,
    scoreMae: round(mean(own.map((item) => item.absError))),
    scoreStdDev: round(withinFixtureStdDev(own), 2),
    expectedStyleAccuracy: round(
      mean(own.map((item) => (item.expectedStyleCorrect ? 1 : 0))),
    ),
    actualStyleAccuracy: round(
      mean(own.map((item) => (item.actualStyleCorrect ? 1 : 0))),
    ),
    styleKappa: cohensKappa(
      own.map((item) => ({
        predicted: item.actualStyle,
        actual: item.labelActualStyle,
      })),
    ),
    criteriaF1: round(mean(own.map((item) => item.criteria.f1))),
    personaAdherence: round(
      mean(own.map((item) => (item.personaViolations.length === 0 ? 1 : 0))),
    ),
    personaDriftRate: round(mean(own.map((item) => item.personaDrift.rate))),
    personaDriftSlope: round(mean(own.map((item) => item.personaDrift.slope))),
    silenceAccuracy: round(
      mean(own.map((item) => (item.silenceRespected ? 1 : 0))),
    ),
    avgLatencyMs: Math.round(mean(own.map((item) => item.latencyMs))),
    totalInputTokens: own.reduce((sum, item) => sum + item.inputTokens, 0),
    totalOutputTokens: own.reduce((sum, item) => sum + item.outputTokens, 0),
    totalCostUsd: round(
      own.reduce((sum, item) => sum + item.costUsd, 0),
      4,
    ),
    avgCostUsd: round(mean(own.map((item) => item.costUsd)), 5),
    modelMix: own.reduce<Record<string, number>>((mix, item) => {
      for (const model of new Set(item.models)) {
        mix[model] = (mix[model] ?? 0) + 1;
      }
      return mix;
    }, {}),
  };
}

/**
 * Per-fixture metric series, averaged over repeated runs.
 *
 * This is the input to the paired comparison: one number per fixture per arm,
 * so the same scenario is compared against itself across variants.
 */
export function seriesByFixture(
  items: ItemResult[],
  variantId: string,
  metric: (item: ItemResult) => number,
): Map<string, number> {
  const buckets = new Map<string, number[]>();
  for (const item of items) {
    if (item.variantId !== variantId) continue;
    const bucket = buckets.get(item.fixtureId) ?? [];
    bucket.push(metric(item));
    buckets.set(item.fixtureId, bucket);
  }

  const series = new Map<string, number>();
  for (const [fixtureId, values] of buckets) {
    series.set(fixtureId, mean(values));
  }
  return series;
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Reward reported back to learning persona strategies.
 *
 * It measures the *character's* contribution: a dialog where the automatic
 * score tracks the expert and the role-play stayed clean is a good episode,
 * regardless of whether the participant managed well or badly.
 */
export function rewardFor(item: ItemResult): number {
  const accuracy = 1 - Math.min(1, item.absError / 100);
  const roleplay = item.personaViolations.length === 0 ? 1 : 0;
  const silence = item.silenceRespected ? 1 : 0;
  return 0.6 * accuracy + 0.25 * roleplay + 0.15 * silence;
}
