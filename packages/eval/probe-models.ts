#!/usr/bin/env bun
/**
 * Probe candidate models against the contracts the pipeline actually uses.
 *
 * A model list from a provider says nothing about whether a model can hold a
 * Russian role-play and return a schema-valid object. This runs the two calls
 * that dominate a benchmark — the character's reply and the judge's criteria
 * verdict — and reports which candidates survive both.
 */
import {
  createAiSdkProvider,
  criteriaAssessmentSchema,
  GEMINI_BASE_URL,
  GROQ_BASE_URL,
  OPENROUTER_BASE_URL,
  personaReplySchema,
} from "@acme/ai";

/**
 * Which endpoint to probe. Every free pool needs the same empirical check —
 * a vendor's claimed feature support says nothing about whether a specific
 * model actually holds this task's schema and role.
 */
const PROVIDER = process.env.PROBE_PROVIDER ?? "openrouter";

const { KEY, BASE } = (() => {
  switch (PROVIDER) {
    case "groq":
      return { KEY: process.env.GROQ_API_KEY, BASE: GROQ_BASE_URL };
    case "gemini":
      return { KEY: process.env.GEMINI_API_KEY, BASE: GEMINI_BASE_URL };
    default:
      return { KEY: process.env.OPENROUTER_API_KEY, BASE: OPENROUTER_BASE_URL };
  }
})();

const CANDIDATES = process.argv.slice(2);

const PERSONA_SYSTEM = `Ты — Анна Соколова, повар десертов в ресторане. Ты на смене.
Отвечай коротко, от первого лица, по-русски, как живой человек на кухне.
Никогда не называй стили управления и не выходи из роли.`;

const JUDGE_SYSTEM = `Ты — эксперт по ситуационному руководству. Тебе дают расшифровку диалога и список критериев.
Для каждого критерия реши, выполнил ли его руководитель, и дай короткое обоснование одним предложением на русском.
Отдельно посчитай грубые реплики руководителя и приведи их дословные цитаты.`;

const TRANSCRIPT = `РУКОВОДИТЕЛЬ: Анна, нужно сделать торт с украшением к 19:00.
РУКОВОДИТЕЛЬ: Объясню по шагам: сначала бисквит, потом крем, потом декор по эскизу.
РУКОВОДИТЕЛЬ: Перед сборкой покажи мне — я проверю. Всё понятно?

Критерии для проверки:
- clarify_task: Чётко поставил задачу
- set_deadline: Обозначил срок
- explain_how: Объяснил, как выполнять
- set_checkpoints: Назначил точки контроля`;

interface Outcome {
  model: string;
  persona: string;
  judge: string;
  latencyMs: number;
  russian: boolean;
  inRole: boolean;
}

async function probe(model: string): Promise<Outcome> {
  const provider = createAiSdkProvider({
    vendor: "openai-compatible",
    model,
    apiKey: KEY,
    baseUrl: BASE,
    supportsStructuredOutputs: false,
    maxAttempts: 2,
    maxOutputTokens: 4000,
  });

  const outcome: Outcome = {
    model,
    persona: "—",
    judge: "—",
    latencyMs: 0,
    russian: false,
    inRole: false,
  };

  const startedAt = Date.now();

  try {
    const reply = await provider.generate({
      purpose: "persona.reply",
      schemaName: "persona_reply",
      schema: personaReplySchema,
      system: PERSONA_SYSTEM,
      messages: [
        {
          role: "user",
          content:
            "Анна, нужно сделать торт с украшением к 19:00. На твоё усмотрение.",
        },
      ],
    });

    const text = reply.value.reply;
    outcome.persona = `ok: ${text.slice(0, 60)}`;
    // Cyrillic share: a model that answers in English fails the role outright.
    outcome.russian =
      /[а-яё]/i.test(text) &&
      text.replace(/[^а-яё]/gi, "").length > text.length * 0.4;
    outcome.inRole =
      !/директивн|делегирующ|наставнич|поддерживающ|как ассистент|as an ai/i.test(
        text,
      );
  } catch (cause) {
    outcome.persona = `FAIL: ${String((cause as Error).message)
      .split("\n")[0]
      .slice(0, 70)}`;
  }

  try {
    const judged = await provider.generate({
      purpose: "evaluation.criteria",
      schemaName: "criteria_assessment",
      schema: criteriaAssessmentSchema,
      system: JUDGE_SYSTEM,
      messages: [{ role: "user", content: TRANSCRIPT }],
    });
    outcome.judge = `ok: ${judged.value.criteria.length} критериев`;
  } catch (cause) {
    outcome.judge = `FAIL: ${String((cause as Error).message)
      .split("\n")[0]
      .slice(0, 70)}`;
  }

  outcome.latencyMs = Date.now() - startedAt;
  return outcome;
}

function verdictOf(item: Outcome): string {
  if (!item.persona.startsWith("ok") || !item.judge.startsWith("ok")) {
    return "❌ не держит схему";
  }
  if (!item.russian) return "⚠️ не русский";
  return item.inRole ? "✅ годится" : "⚠️ ломает роль";
}

// Print each result as it lands. Probing a dozen endpoints always has a few
// that hang or time out, and a partial table is still worth having — buffering
// everything until the end loses the whole run when one candidate stalls.
const results: Outcome[] = [];
for (const model of CANDIDATES) {
  const item = await probe(model);
  results.push(item);
  console.log(
    `${verdictOf(item).padEnd(18)} ${item.model.padEnd(50)} ${item.latencyMs}мс`,
  );
  console.log(`    персона: ${item.persona}`);
  console.log(`    судья:   ${item.judge}`);
}

const passed = results.filter(
  (item) =>
    item.persona.startsWith("ok") &&
    item.judge.startsWith("ok") &&
    item.russian,
);

console.log(`\nГодных: ${passed.length} из ${results.length}`);
console.log(passed.map((item) => item.model).join(","));
