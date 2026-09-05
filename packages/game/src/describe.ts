import type { Employee, EmployeePersonality, Task } from "./types";

/**
 * Natural-language rendering of a character's profile.
 *
 * Deliberately free of methodology vocabulary ("директивный", "делегирование",
 * уровни готовности): this text goes into the role-play prompt, and a
 * character that can name the management styles will sooner or later hand the
 * participant the answer the game is supposed to test.
 */

const TONE: Record<EmployeePersonality["tone"], string> = {
  confident: "Говоришь уверенно, по делу.",
  anxious: "Говоришь осторожно, часто сомневаешься вслух.",
  independent: "Говоришь как человек, который привык всё решать сам.",
};

const TO_DIRECTIVE: Record<EmployeePersonality["reactionToDirective"], string> =
  {
    accepts: "Тебе спокойнее, когда сказали чётко, что и как делать.",
    neutral: "Ты нормально относишься к подробным указаниям.",
    resents:
      "Тебя раздражает, когда за тебя расписывают каждый шаг в том, что ты и так умеешь.",
  };

const TO_SUPPORT: Record<EmployeePersonality["reactionToSupport"], string> = {
  needs: "Тебе важно, чтобы рядом были готовы помочь и подсказать.",
  neutral: "Ты спокойно относишься к предложениям помощи.",
  dislikes: "Излишняя опека тебя скорее тормозит, чем помогает.",
};

export function describePersonality(employee: Employee): string[] {
  const { personality } = employee;
  return [
    TONE[personality.tone],
    TO_DIRECTIVE[personality.reactionToDirective],
    TO_SUPPORT[personality.reactionToSupport],
    `За тобой водится: ${personality.typicalErrors.join(", ")}.`,
    `Тебя заряжает: ${personality.motivators.join(", ")}.`,
    `Тебя гасит: ${personality.demotivators.join(", ")}.`,
    personality.biography
      ? `Твой рабочий контекст: ${personality.biography}`
      : null,
    personality.communicationStyle
      ? `Твоя манера общения: ${personality.communicationStyle}`
      : null,
    personality.stressBehavior
      ? `Под нагрузкой ты ведёшь себя так: ${personality.stressBehavior}`
      : null,
    personality.speechPatterns?.length
      ? `Характерные речевые привычки: ${personality.speechPatterns.join("; ")}.`
      : null,
    personality.boundaries?.length
      ? `Личные границы в рабочем общении: ${personality.boundaries.join("; ")}.`
      : null,
  ].filter((line): line is string => Boolean(line));
}

export function describeTask(task: Task): string {
  return [
    `Задача «${task.title}» (тип ${task.type}).`,
    `Сложность ${task.complexity} из 5, срочность ${task.timeCriticality} из 5.`,
    task.requiresCheckpoints
      ? "По регламенту кухни промежуточный результат положено показывать."
      : "Промежуточный показ по регламенту не обязателен.",
    `Что может пойти не так: ${task.failureModes.join(", ")}.`,
  ].join(" ");
}
