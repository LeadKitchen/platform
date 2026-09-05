import { isEngagingUtterance } from "@acme/game";

import type { EngagementStrategy } from "../../types";

/**
 * Marker-based gate: обращение по имени, вопрос или прямое поручение.
 *
 * Ноль задержки и ноль стоимости, поэтому это разумное значение по умолчанию:
 * пока руководитель думает вслух, игра не тратит ни токена. Плата за это —
 * буквальность: «ты справишься с тортом?» без имени распознаётся по вопросу, а
 * вот сложную косвенную адресацию маркеры пропустят.
 */
export const heuristicEngagement: EngagementStrategy = {
  id: "heuristic",
  description:
    "Гейт по маркерам речи: имя, вопрос или прямое поручение. Без обращения к модели.",

  async check(request) {
    const startedAt = Date.now();
    const engaged = isEngagingUtterance(
      request.utterance,
      request.dialog.employee,
    );

    return {
      engaged,
      reason: engaged
        ? "руководитель обратился к сотруднику"
        : "реплика не адресована сотруднику",
      latencyMs: Date.now() - startedAt,
    };
  },
};
