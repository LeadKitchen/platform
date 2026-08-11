import type { Criterion, CriterionId } from "./types";

/**
 * The full criteria dictionary. Which of these are *required* for a given
 * dialog is decided by {@link resolveExpectation}; the weight below only
 * matters relative to the other required criteria of the same dialog.
 */
export const CRITERIA: Record<CriterionId, Criterion> = {
  clarify_task: {
    id: "clarify_task",
    title: "Чётко поставил задачу (что именно и сколько)",
    weight: 3,
  },
  set_deadline: {
    id: "set_deadline",
    title: "Обозначил срок",
    weight: 2,
  },
  explain_how: {
    id: "explain_how",
    title: "Объяснил, как выполнять (шаги, стандарт)",
    weight: 3,
  },
  set_checkpoints: {
    id: "set_checkpoints",
    title: "Назначил точки контроля",
    weight: 3,
  },
  check_understanding: {
    id: "check_understanding",
    title: "Проверил понимание задачи",
    weight: 2,
  },
  motivate: {
    id: "motivate",
    title: "Поддержал и замотивировал",
    weight: 2,
  },
  ask_opinion: {
    id: "ask_opinion",
    title: "Спросил мнение сотрудника",
    weight: 2,
  },
  offer_help: {
    id: "offer_help",
    title: "Предложил помощь или ресурсы",
    weight: 2,
  },
  delegate_authority: {
    id: "delegate_authority",
    title: "Передал ответственность за результат",
    weight: 3,
  },
  avoid_micromanagement: {
    id: "avoid_micromanagement",
    title: "Не скатился в микроменеджмент",
    weight: 2,
  },
  prioritize: {
    id: "prioritize",
    title: "Расставил приоритеты в очереди заказов",
    weight: 3,
  },
  reduce_scope: {
    id: "reduce_scope",
    title: "Снял часть нагрузки или упростил задачу",
    weight: 2,
  },
};

export function criterion(id: CriterionId): Criterion {
  return CRITERIA[id];
}
