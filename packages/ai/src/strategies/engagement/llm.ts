import { ENGAGEMENT_JUDGE_SYSTEM } from "../../prompts";
import { engagementCheckSchema } from "../../schemas";
import type { EngagementStrategy } from "../../types";

/**
 * Модель решает, обратились ли к сотруднику.
 *
 * Ловит то, что маркеры пропускают: косвенную адресацию, обращение через
 * должность, продолжение разговора после паузы. Цена — вызов модели на каждую
 * реплику, включая те, которые в heuristic-варианте были бесплатными; поэтому
 * это отдельная стратегия, а не замена по умолчанию — выигрыш должен быть
 * виден на стенде, а не предполагаться.
 */
export const llmEngagement: EngagementStrategy = {
  id: "llm",
  description:
    "Гейт вовлечения определяет модель по реплике и контексту диалога (дороже, но ловит косвенные обращения).",

  async check(request, deps) {
    const startedAt = Date.now();
    const { employee, turns } = request.dialog;

    const recent = turns
      .slice(-6)
      .map(
        (turn) =>
          `${turn.role === "manager" ? "РУКОВОДИТЕЛЬ" : "СОТРУДНИК"}: ${turn.text}`,
      )
      .join("\n");

    try {
      const result = await deps.provider.generate({
        purpose: "engagement.check",
        schemaName: "engagement_check",
        schema: engagementCheckSchema,
        effort: "low",
        signal: deps.signal,
        system: ENGAGEMENT_JUDGE_SYSTEM,
        messages: [
          {
            role: "user",
            content: `Сотрудник: ${employee.name}, ${employee.role}.\n\nПредыдущие реплики:\n${recent || "(диалога ещё не было)"}\n\nНовая реплика руководителя:\n${request.utterance}`,
          },
        ],
      });

      return {
        engaged: result.value.engaged,
        reason: result.value.reason,
        usage: result.usage,
        latencyMs: Date.now() - startedAt,
      };
    } catch (cause) {
      if (deps.signal?.aborted) throw cause;
      // Гейт не должен ронять диалог: при сбое модели считаем, что к
      // сотруднику обратились — лучше лишняя реплика, чем застрявшая игра.
      return {
        engaged: true,
        reason: "модель недоступна, гейт пропустил реплику",
        latencyMs: Date.now() - startedAt,
      };
    }
  },
};
