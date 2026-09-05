import { COMPETENCE_LABELS, describePersonality } from "@acme/game";

import type { KnowledgeStrategy } from "../../types";

/**
 * "Everything in the prompt" — the control arm.
 *
 * No retrieval at all: the character's whole profile and the order card go
 * into the context every turn. Cheap to reason about, but the prompt grows
 * with the catalog, which is exactly the trade-off the RAG arms are meant to
 * beat in the harness.
 */
export const baselineKnowledge: KnowledgeStrategy = {
  id: "prompt-baseline",
  description:
    "Без поиска: полный профиль сотрудника и карточка заказа передаются в промпт целиком.",

  async retrieve(request) {
    const startedAt = Date.now();
    const { employee, task, order, shift } = request.dialog;

    const snippets = [
      {
        id: `profile:${employee.id}`,
        source: "profile",
        score: 1,
        text: [
          `${employee.name} — ${employee.role}.`,
          ...describePersonality(employee),
        ].join(" "),
      },
      {
        id: `competence:${employee.id}:${task.type}`,
        source: "competence",
        score: 1,
        text: `Компетенция по типу задач «${task.type}»: ${COMPETENCE_LABELS[request.expectation.competence]}.`,
      },
      {
        id: `task:${task.id}`,
        source: "task",
        score: 1,
        text: [
          `Заказ: ${task.title}, ${order.portions} шт., дедлайн через ${order.deadlineMinutes} мин.`,
          `Сложность ${task.complexity}/5, срочность ${task.timeCriticality}/5.`,
          task.requiresCheckpoints
            ? "По регламенту кухни промежуточный результат положено показывать."
            : "Промежуточный показ по регламенту не обязателен.",
          `Риски: ${task.failureModes.join(", ")}.`,
          order.notes ? `Пожелания гостя: ${order.notes}.` : "",
        ]
          .filter(Boolean)
          .join(" "),
      },
      {
        id: "shift",
        source: "shift",
        score: 1,
        text: `Раунд ${shift.round}. Активных заказов: ${shift.activeOrders}. Нагрузка: ${shift.load}.${shift.soloOnShift ? " Ты один в смене." : ""}`,
      },
    ];

    return { snippets, latencyMs: Date.now() - startedAt };
  },
};
