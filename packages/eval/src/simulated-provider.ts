import {
  createMockProvider,
  type LlmProvider,
  type LlmRequest,
} from "@acme/ai";
import {
  type CriterionId,
  classifyDialogStyle,
  type DialogTurn,
  detectCriteria,
  detectToxicity,
  isEngagingUtterance,
} from "@acme/game";

/**
 * Offline stand-in for the model.
 *
 * It is a real function of its input, not a fixed script: the simulated
 * character reads the context the knowledge stage actually gave it, and the
 * simulated judge reads the transcript it was actually shown. That keeps
 * `--provider simulated` runs meaningful as a smoke test of the whole
 * pipeline — but it is **not** a substitute for a real comparison: the
 * simulated judge is the same heuristic the `rules` strategy uses, so
 * LLM-based scoring arms cannot show their advantage here. Run with
 * `--provider anthropic` before drawing conclusions.
 */

function parseTranscript(content: string): DialogTurn[] {
  return content.split("\n").flatMap<DialogTurn>((line) => {
    const manager = /^РУКОВОДИТЕЛЬ:\s*(.*)$/.exec(line);
    if (manager?.[1]) return [{ role: "manager", text: manager[1] }];

    const employee = /^СОТРУДНИК:\s*(.*)$/.exec(line);
    if (employee?.[1]) return [{ role: "employee", text: employee[1] }];

    return [];
  });
}

function parseRequestedCriteria(content: string): CriterionId[] {
  return content.split("\n").flatMap((line) => {
    const match = /^- ([a-z_]+):/.exec(line.trim());
    return match?.[1] ? [match[1] as CriterionId] : [];
  });
}

function simulatePersona(request: LlmRequest<unknown>) {
  const system = request.system.toLowerCase();
  const lastManagerTurn =
    [...request.messages].reverse().find((message) => message.role === "user")
      ?.content ?? "";

  const isNovel = system.includes("новая");
  const isOverloaded =
    system.includes("один в смене") ||
    system.includes("overload") ||
    system.includes("нагрузка: high");
  const shouldAskClarifying = system.includes("переспроси");
  const shouldSignalOverload = system.includes("сколько всего на тебе висит");
  const rude = detectToxicity(lastManagerTurn);

  const requests: string[] = [];
  const sentences: string[] = ["Поняла, беру."];

  if (isNovel) {
    sentences.push("Правда, такое я ещё не делала — уточню по ходу.");
    if (shouldAskClarifying) {
      sentences.push("Как именно оформлять, есть эскиз?");
      requests.push("эскиз оформления");
    }
  }

  if (isOverloaded) {
    if (shouldSignalOverload) {
      sentences.push("Только на мне сейчас ещё несколько заказов разом.");
    }
    requests.push("порядок выполнения заказов");
  }

  const confirmsCheckpoints = /покаж|провер/i.test(lastManagerTurn);
  if (confirmsCheckpoints) sentences.push("Перед сборкой покажу.");

  return {
    reply: sentences.join(" "),
    understood: isNovel ? "Задача новая, деталей не хватает" : null,
    readiness: isNovel ? "unsure" : "confident",
    requests,
    confirmsCheckpoints,
    emotionDelta: rude ? -2 : isNovel ? 0 : 1,
  };
}

export function createSimulatedProvider(): LlmProvider {
  return createMockProvider(
    (request) => {
      if (request.purpose === "persona.reply") {
        return simulatePersona(request);
      }

      if (request.purpose === "engagement.check") {
        // Офлайн-двойник гейта переиспользует ту же функцию, что и
        // heuristic-стратегия: иначе арм с LLM-гейтом «выигрывал» бы на стенде
        // просто потому, что его двойник добрее, а не потому, что он лучше.
        const prompt = request.messages.at(-1)?.content ?? "";
        const name = /^Сотрудник:\s*([^,]+)/m.exec(prompt)?.[1]?.trim() ?? "";
        const utterance =
          prompt.split("Новая реплика руководителя:").at(-1) ?? "";
        const engaged = isEngagingUtterance(utterance, { name });

        return {
          engaged,
          reason: engaged ? "обращение распознано" : "реплика не адресована",
        };
      }

      const content = request.messages
        .map((message) => message.content)
        .join("\n");
      const turns = parseTranscript(content);

      if (request.purpose === "evaluation.style") {
        return { distribution: classifyDialogStyle(turns), evidence: [] };
      }

      const detected = detectCriteria(turns);
      const toxicTurns = turns.filter(
        (turn) => turn.role === "manager" && detectToxicity(turn.text),
      ).length;

      return {
        criteria: parseRequestedCriteria(content).map((id) => ({
          id,
          met: detected.has(id),
          comment: detected.has(id)
            ? "видно из речи руководителя"
            : "в диалоге не прозвучало",
        })),
        toxicTurns,
      };
    },
    { id: "simulated", model: "mock-model", latencyMs: 1 },
  );
}
