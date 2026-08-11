import { simulateOutcome } from "./outcome";
import {
  COMPETENCE_LABELS,
  dominantStyle,
  normalizeStyleDistribution,
  STYLE_LABELS,
  styleCredit,
  styleIndex,
  weightedStyleCredit,
} from "./styles";
import type {
  CriterionId,
  CriterionResult,
  DialogContext,
  Evaluation,
  Expectation,
  StyleDistribution,
} from "./types";

/** Weights of the three score components. They add up to 100. */
export const SCORE_WEIGHTS = { style: 45, actions: 35, outcome: 20 } as const;

/** Penalty applied per toxic / out-of-role manager turn. */
export const TOXICITY_PENALTY = 15;

export interface ScoreInput {
  dialog: DialogContext;
  expectation: Expectation;
  /** Style mix detected in the manager's speech (any positive scale). */
  styleDistribution: StyleDistribution;
  /** Criteria the manager visibly covered. */
  metCriteria: Iterable<CriterionId>;
  /** Number of toxic / out-of-scenario manager turns. */
  toxicTurns?: number;
  /**
   * Optional per-criterion comments from an LLM judge. Purely presentational —
   * the score itself stays deterministic so variants remain comparable.
   */
  criterionComments?: Partial<Record<CriterionId, string>>;
}

/**
 * Compute the final 0–100 score plus the full breakdown shown to the
 * administrator. Deterministic on purpose: whichever AI approach produced the
 * style distribution and the criteria set, the arithmetic on top is identical,
 * which is what makes A/B comparison between variants meaningful.
 */
export function scoreDialog(input: ScoreInput): Evaluation {
  const { dialog, expectation } = input;
  const distribution = normalizeStyleDistribution(input.styleDistribution);
  const actualStyle = dominantStyle(distribution);
  const met = new Set(input.metCriteria);

  const credit = weightedStyleCredit(expectation.expectedStyle, distribution);
  const styleScore = credit * SCORE_WEIGHTS.style;

  const criteria: CriterionResult[] = expectation.requiredCriteria.map(
    (criterion) => ({
      id: criterion.id,
      title: criterion.title,
      weight: criterion.weight,
      met: met.has(criterion.id),
      comment: input.criterionComments?.[criterion.id],
    }),
  );

  const totalWeight = criteria.reduce((sum, item) => sum + item.weight, 0);
  const metWeight = criteria.reduce(
    (sum, item) => sum + (item.met ? item.weight : 0),
    0,
  );
  const actionsCoverage = totalWeight === 0 ? 1 : metWeight / totalWeight;
  const actionsScore = actionsCoverage * SCORE_WEIGHTS.actions;

  const overManaged =
    styleIndex(actualStyle) < styleIndex(expectation.expectedStyle);

  const outcome = simulateOutcome({
    employee: dialog.employee,
    task: dialog.task,
    shift: dialog.shift,
    expectation,
    styleCredit: credit,
    actionsCoverage,
    overManaged,
  });

  const outcomeScore =
    (outcome.status === "success"
      ? 1
      : outcome.status === "partial"
        ? 0.5
        : 0) *
      SCORE_WEIGHTS.outcome *
      0.8 +
    (outcome.onTime ? SCORE_WEIGHTS.outcome * 0.2 : 0);

  const penalties = -Math.min(
    SCORE_WEIGHTS.style,
    (input.toxicTurns ?? 0) * TOXICITY_PENALTY,
  );

  const scorePercent = Math.max(
    0,
    Math.min(
      100,
      Math.round(styleScore + actionsScore + outcomeScore + penalties),
    ),
  );

  return {
    scorePercent,
    expectedStyle: expectation.expectedStyle,
    actualStyle,
    styleDistribution: distribution,
    criteria,
    outcome,
    breakdown: {
      style: round1(styleScore),
      actions: round1(actionsScore),
      outcome: round1(outcomeScore),
      penalties: round1(penalties),
    },
    summary: buildSummary({
      expectation,
      actualStyle,
      credit,
      criteria,
      outcome: outcome.summary,
      penalties,
    }),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildSummary(args: {
  expectation: Expectation;
  actualStyle: Evaluation["actualStyle"];
  credit: number;
  criteria: CriterionResult[];
  outcome: string;
  penalties: number;
}): string {
  const { expectation, actualStyle, credit, criteria, outcome, penalties } =
    args;

  const expectedLabel = STYLE_LABELS[expectation.expectedStyle].toLowerCase();
  const actualLabel = STYLE_LABELS[actualStyle].toLowerCase();

  const lines: string[] = [];

  if (credit >= 0.9) {
    lines.push(`Стиль выбран верно: ${actualLabel}.`);
  } else {
    const direction =
      styleIndex(actualStyle) > styleIndex(expectation.expectedStyle)
        ? "слишком много самостоятельности"
        : "слишком много контроля";
    lines.push(
      `Ожидался ${expectedLabel} стиль, фактически — ${actualLabel} (${direction}).`,
    );
  }

  lines.push(
    `Основание: ${COMPETENCE_LABELS[expectation.competence]}, ${expectation.rationale}`,
  );

  const missed = criteria.filter((item) => !item.met);
  if (missed.length === 0) {
    lines.push("Все ключевые управленческие действия выполнены.");
  } else {
    lines.push(
      `Не сделано: ${missed.map((item) => item.title.toLowerCase()).join("; ")}.`,
    );
  }

  lines.push(`Результат заказа: ${outcome}`);

  if (penalties < 0) {
    lines.push("Снижение за некорректное общение с сотрудником.");
  }

  return lines.join(" ");
}

/** Exposed for the eval harness: raw style credit without the other parts. */
export function styleCreditFor(
  expected: Evaluation["expectedStyle"],
  actual: Evaluation["actualStyle"],
): number {
  return styleCredit(expected, actual);
}
