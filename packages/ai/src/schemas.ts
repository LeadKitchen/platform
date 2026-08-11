import { CRITERION_IDS, MANAGEMENT_STYLES } from "@acme/game";
import { z } from "zod";

/**
 * Contracts for every structured LLM call.
 *
 * Numeric bounds are intentionally *not* expressed as JSON-Schema constraints
 * (structured outputs do not support `minimum`/`maximum`); they are clamped in
 * code instead, so a slightly out-of-range value never fails a whole dialog.
 */

export const personaReplySchema = z.object({
  reply: z
    .string()
    .describe("Реплика сотрудника на русском языке, от первого лица"),
  understood: z
    .string()
    .nullable()
    .describe(
      "Что сотрудник понял из задачи или переспрос; null, если задача ясна",
    ),
  readiness: z
    .enum(["confident", "unsure", "resistant"])
    .describe("Готовность взяться за задачу"),
  requests: z
    .array(z.string())
    .describe("Запросы ресурсов, помощи или уточнений"),
  confirmsCheckpoints: z
    .boolean()
    .describe("Подтвердил ли сотрудник точки контроля"),
  emotionDelta: z
    .number()
    .describe("Изменение эмоционального состояния от -2 до 2"),
});

export type PersonaReplyPayload = z.infer<typeof personaReplySchema>;

export const engagementCheckSchema = z.object({
  engaged: z
    .boolean()
    .describe(
      "true, если руководитель обратился именно к этому сотруднику: по имени, вопросом, поручением или продолжением начатого с ним разговора",
    ),
  reason: z
    .string()
    .describe("Короткое обоснование на русском языке, одно предложение"),
});

export type EngagementCheckPayload = z.infer<typeof engagementCheckSchema>;

export const styleAnalysisSchema = z.object({
  distribution: z
    .object({
      directive: z.number(),
      coaching: z.number(),
      supporting: z.number(),
      delegating: z.number(),
    })
    .describe("Доли стилей в речи руководителя, в сумме примерно 1"),
  evidence: z
    .array(
      z.object({
        style: z.enum(MANAGEMENT_STYLES),
        quote: z.string().describe("Короткая цитата руководителя"),
      }),
    )
    .describe("Опорные цитаты для каждого замеченного стиля"),
});

export type StyleAnalysisPayload = z.infer<typeof styleAnalysisSchema>;

export const criteriaAssessmentSchema = z.object({
  criteria: z.array(
    z.object({
      id: z.enum(CRITERION_IDS),
      met: z.boolean(),
      comment: z
        .string()
        .describe("Короткое обоснование на русском языке (1 предложение)"),
    }),
  ),
  toxicTurns: z
    .number()
    .describe("Сколько реплик руководителя были грубыми или вне сценария"),
  toxicQuotes: z
    .array(z.string())
    .describe(
      "Дословные цитаты грубых или неуместных реплик руководителя — по одной на каждую засчитанную в toxicTurns. Пустой массив, если таких реплик не было.",
    ),
});

export type CriteriaAssessmentPayload = z.infer<
  typeof criteriaAssessmentSchema
>;

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}
