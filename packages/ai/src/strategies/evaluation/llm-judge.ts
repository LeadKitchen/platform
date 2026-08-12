import {
  type CriterionId,
  type DialogContext,
  type Expectation,
  type ManagementStyle,
  type StyleDistribution,
  scoreDialog,
} from "@acme/game";

import { CRITERIA_JUDGE_SYSTEM, STYLE_JUDGE_SYSTEM } from "../../prompts";
import { addUsage } from "../../provider/types";
import { criteriaAssessmentSchema, styleAnalysisSchema } from "../../schemas";
import type { EvaluationStrategy, StageDeps } from "../../types";

export function renderTranscript(dialog: DialogContext): string {
  const header = [
    `Сотрудник: ${dialog.employee.name}, ${dialog.employee.role}.`,
    `Заказ: ${dialog.task.title}, ${dialog.order.portions} шт., дедлайн через ${dialog.order.deadlineMinutes} мин.`,
    `Раунд ${dialog.shift.round}, активных заказов ${dialog.shift.activeOrders}, нагрузка ${dialog.shift.load}.`,
  ].join("\n");

  const body = dialog.turns
    .map(
      (turn) =>
        `${turn.role === "manager" ? "РУКОВОДИТЕЛЬ" : "СОТРУДНИК"}: ${turn.text}`,
    )
    .join("\n");

  return `${header}\n\nРасшифровка диалога:\n${body}`;
}

export async function judgeStyle(
  dialog: DialogContext,
  deps: StageDeps,
): Promise<{
  distribution: StyleDistribution;
  evidence: { style: ManagementStyle; quote: string }[];
  usage: ReturnType<typeof addUsage>;
  model: string;
}> {
  const result = await deps.provider.generate({
    purpose: "evaluation.style",
    schemaName: "style_analysis",
    schema: styleAnalysisSchema,
    effort: deps.effort,
    system:
      typeof deps.params.styleJudgeSystem === "string"
        ? deps.params.styleJudgeSystem
        : STYLE_JUDGE_SYSTEM,
    messages: [{ role: "user", content: renderTranscript(dialog) }],
  });

  return {
    distribution: result.value.distribution,
    evidence: result.value.evidence,
    usage: addUsage(result.usage),
    model: result.model,
  };
}

export async function judgeCriteria(
  dialog: DialogContext,
  expectation: Expectation,
  deps: StageDeps,
): Promise<{
  met: Set<CriterionId>;
  comments: Partial<Record<CriterionId, string>>;
  toxicTurns: number;
  usage: ReturnType<typeof addUsage>;
}> {
  const criteriaList = expectation.requiredCriteria
    .map((criterion) => `- ${criterion.id}: ${criterion.title}`)
    .join("\n");

  const result = await deps.provider.generate({
    purpose: "evaluation.criteria",
    schemaName: "criteria_assessment",
    schema: criteriaAssessmentSchema,
    effort: deps.effort,
    system:
      typeof deps.params.criteriaJudgeSystem === "string"
        ? deps.params.criteriaJudgeSystem
        : CRITERIA_JUDGE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `${renderTranscript(dialog)}\n\nКритерии для проверки:\n${criteriaList}`,
      },
    ],
  });

  const met = new Set<CriterionId>();
  const comments: Partial<Record<CriterionId, string>> = {};
  for (const item of result.value.criteria) {
    if (item.met) met.add(item.id);
    comments[item.id] = item.comment;
  }

  const managerTurns = dialog.turns.filter((turn) => turn.role === "manager");

  // Штраф за токсичность отрезает до 45 баллов из 100 (см. TOXICITY_PENALTY в
  // @acme/game), поэтому одному числу от модели доверять нельзя: цитата
  // должна реально встречаться в речи руководителя, а итоговое число не может
  // превышать ни количество приведённых цитат, ни число реплик руководителя.
  const verifiedQuotes = result.value.toxicQuotes.filter((quote) =>
    managerTurns.some((turn) => turn.text.includes(quote.trim())),
  );
  const toxicTurns = Math.max(
    0,
    Math.min(
      Math.round(result.value.toxicTurns),
      verifiedQuotes.length,
      managerTurns.length,
    ),
  );

  return {
    met,
    comments,
    toxicTurns,
    usage: addUsage(result.usage),
  };
}

/**
 * LLM judge: the model reads the transcript, the deterministic rubric does the
 * arithmetic.
 *
 * Keeping the maths out of the model is what makes variants comparable — two
 * approaches differ in *what they observed*, not in how observations turn into
 * a percentage.
 */
export const llmJudgeEvaluation: EvaluationStrategy = {
  id: "llm-judge",
  description:
    "Модель классифицирует стиль и выполнение критериев по расшифровке; проценты считает общая рубрика.",

  async evaluate(request, deps) {
    const startedAt = Date.now();
    const { dialog, expectation } = request;

    const [style, criteria] = await Promise.all([
      judgeStyle(dialog, deps),
      judgeCriteria(dialog, expectation, deps),
    ]);

    const evaluation = scoreDialog({
      dialog,
      expectation,
      styleDistribution: style.distribution,
      metCriteria: criteria.met,
      toxicTurns: criteria.toxicTurns,
      criterionComments: criteria.comments,
    });

    return {
      evaluation,
      usage: addUsage(style.usage, criteria.usage),
      latencyMs: Date.now() - startedAt,
      meta: { evidence: style.evidence, model: style.model },
    };
  },
};
