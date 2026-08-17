import { CRITERION_IDS, MANAGEMENT_STYLES } from "@acme/game";
import { z } from "zod";

/**
 * Contracts for every structured LLM call.
 *
 * Numeric bounds are intentionally *not* expressed as JSON-Schema constraints
 * (structured outputs do not support `minimum`/`maximum`); they are clamped in
 * code instead, so a slightly out-of-range value never fails a whole dialog.
 */

/**
 * Only `reply` is load-bearing — everything else degrades to a sane default.
 *
 * Gateways that lack native structured outputs answer from a prompt-stated
 * schema, and they miss a field or emit `"1"` instead of `1` often enough that
 * strict parsing throws away otherwise perfect replies. Failing the whole turn
 * over `confirmsCheckpoints` costs a retry and, in a long benchmark, the run.
 */
export const personaReplySchema = z.object({
  reply: z
    .string()
    .describe("Реплика сотрудника на русском языке, от первого лица"),
  // No `.transform()` here: zod transforms cannot be rendered into JSON
  // Schema, and the schema is what gets stated in the prompt for gateways
  // without native structured outputs. `undefined` is normalised in code.
  understood: z
    .string()
    .nullish()
    .catch(null)
    .describe(
      "Что сотрудник понял из задачи или переспрос; null, если задача ясна",
    ),
  readiness: z
    .enum(["confident", "unsure", "resistant"])
    .catch("confident")
    .describe("Готовность взяться за задачу"),
  requests: z
    .array(z.string())
    .catch([])
    .describe("Запросы ресурсов, помощи или уточнений"),
  confirmsCheckpoints: z
    .boolean()
    .catch(false)
    .describe("Подтвердил ли сотрудник точки контроля"),
  emotionDelta: z.coerce
    .number()
    .catch(0)
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
      directive: z.coerce.number().catch(0),
      coaching: z.coerce.number().catch(0),
      supporting: z.coerce.number().catch(0),
      delegating: z.coerce.number().catch(0),
    })
    .describe("Доли стилей в речи руководителя, в сумме примерно 1"),
  evidence: z
    .array(
      z.object({
        style: z.enum(MANAGEMENT_STYLES),
        quote: z.string().describe("Короткая цитата руководителя"),
      }),
    )
    .catch([])
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
  toxicTurns: z.coerce
    .number()
    .catch(0)
    .describe("Сколько реплик руководителя были грубыми или вне сценария"),
  toxicQuotes: z
    .array(z.string())
    .catch([])
    .describe(
      "Дословные цитаты грубых или неуместных реплик руководителя — по одной на каждую засчитанную в toxicTurns. Пустой массив, если таких реплик не было.",
    ),
});

export type CriteriaAssessmentPayload = z.infer<
  typeof criteriaAssessmentSchema
>;

/**
 * HyDE: гипотетический документ, который модель считает правдоподобным
 * ответом на реплику руководителя. Не используется как реплика — только как
 * расширенный семантический запрос для ретривала.
 */
export const hypotheticalDocumentSchema = z.object({
  document: z
    .string()
    .describe(
      "1-3 предложения на русском — предполагаемая справка, регламент или профильный факт, ответ на который ищется в базе знаний. Пиши в утвердительной форме, без обращения к руководителю.",
    ),
});

export type HypotheticalDocumentPayload = z.infer<
  typeof hypotheticalDocumentSchema
>;

/**
 * Судья-грейдер релевантности сниппетов (CRAG).
 *
 * Оценивает каждый сниппет по шкале 0..1 и возвращает флаг:
 *   correct    — есть уверенно релевантный сниппет
 *   ambiguous  — сниппеты близки, но не точны
 *   incorrect  — релевантных сниппетов нет, нужна переформулировка запроса
 */
export const retrievalGradeSchema = z.object({
  verdict: z.enum(["correct", "ambiguous", "incorrect"]),
  bestScore: z.coerce.number().catch(0),
  rewrittenQuery: z
    .string()
    .nullish()
    .catch(null)
    .describe(
      "Переформулированный запрос, если релевантных сниппетов не нашлось; null иначе.",
    ),
});

export type RetrievalGradePayload = z.infer<typeof retrievalGradeSchema>;

/**
 * Ранжирующий вердикт cross-encoder-подобного LLM-реранкера.
 *
 * Модель получает список сниппетов и запрос, возвращает индексы в новом
 * порядке — только те, что действительно нужны. Индексы вне диапазона молча
 * отбрасываются вызывающим кодом.
 */
export const rerankingSchema = z.object({
  order: z
    .array(z.coerce.number().int())
    .catch([])
    .describe(
      "Индексы сниппетов, отсортированные от самого релевантного к наименее; неподходящие сниппеты можно опустить.",
    ),
});

export type RerankingPayload = z.infer<typeof rerankingSchema>;

/**
 * Дебаты для судьи стиля управления.
 *
 * Критик и защитник по очереди выдвигают гипотезу стиля с цитатой; арбитр
 * фиксирует распределение стилей.
 */
export const debateArgumentSchema = z.object({
  style: z.enum(MANAGEMENT_STYLES),
  argument: z
    .string()
    .describe("Одно предложение почему именно этот стиль подходит."),
  quote: z.string().describe("Дословная цитата руководителя, подтверждающая."),
});

export type DebateArgumentPayload = z.infer<typeof debateArgumentSchema>;

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}
