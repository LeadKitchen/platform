import type { CriterionId, DialogTurn, ManagementStyle } from "@acme/game";

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
  silenceRespected: boolean;
  employeeReplies: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface VariantSummary {
  variantId: string;
  items: number;
  /** Mean absolute error of the automatic score vs the expert score. */
  scoreMae: number;
  /** Share of dialogs where the expected style matched the methodology. */
  expectedStyleAccuracy: number;
  /** Share of dialogs where the detected style matched the expert label. */
  actualStyleAccuracy: number;
  criteriaF1: number;
  /** Share of dialogs with a clean role-play (no leaked methodology). */
  personaAdherence: number;
  /** Share of dialogs where the character kept quiet until addressed. */
  silenceAccuracy: number;
  avgLatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
    expectedStyleAccuracy: round(
      mean(own.map((item) => (item.expectedStyleCorrect ? 1 : 0))),
    ),
    actualStyleAccuracy: round(
      mean(own.map((item) => (item.actualStyleCorrect ? 1 : 0))),
    ),
    criteriaF1: round(mean(own.map((item) => item.criteria.f1))),
    personaAdherence: round(
      mean(own.map((item) => (item.personaViolations.length === 0 ? 1 : 0))),
    ),
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
  };
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
