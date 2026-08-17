import {
  type DialogContext,
  type ManagementStyle,
  type StyleDistribution,
  scoreDialog,
} from "@acme/game";

import { addUsage, type LlmUsage } from "../../provider/types";
import {
  type DebateArgumentPayload,
  debateArgumentSchema,
  styleAnalysisSchema,
} from "../../schemas";
import type { EvaluationStrategy, StageDeps } from "../../types";
import { judgeCriteria, judgeStyle, renderTranscript } from "./llm-judge";

/**
 * Multi-agent debate for LLM-as-a-Judge.
 *
 * Один судья склонен закрепляться на первой правдоподобной интерпретации.
 * Здесь критик выбирает основную гипотезу, защитник обязан оспорить её и
 * представить сильнейшую альтернативу, а арбитр видит обе позиции и выдаёт
 * финальное распределение. «Агенты» используют один LlmProvider, но разные
 * изолированные роли и контексты — менять провайдера или модель не нужно.
 */

const CRITIC_SYSTEM = `Ты первый эксперт по ситуационному руководству — критик.
По репликам только руководителя выбери наиболее выраженный фактический стиль:
directive, coaching, supporting или delegating. Приведи дословную цитату.
Не оценивай, подходил ли стиль ситуации; классифицируй только наблюдаемое
поведение.`;

const DEFENDER_SYSTEM = `Ты второй независимый эксперт — защитник альтернативы.
Тебе дадут расшифровку и позицию критика. Не соглашайся автоматически:
найди сильнейшую альтернативную интерпретацию фактического стиля руководителя
и подкрепи её дословной цитатой. Если критик очевидно прав, всё равно выбери
второй по силе стиль и объясни границу между ними.`;

const ARBITER_SYSTEM = `Ты арбитр дебатов экспертов по ситуационному руководству.
Тебе даны расшифровка, гипотеза критика и сильнейшая альтернатива защитника.
Определи итоговое распределение фактически использованных стилей:
- directive — руководитель говорит что и как делать, задаёт шаги и контроль;
- coaching — объясняет и учит, поддерживая и проверяя;
- supporting — спрашивает мнение, помогает, но не диктует;
- delegating — передаёт ответственность и не вмешивается.

Оценивай только речь руководителя. Не выбирай позицию по уверенности автора —
сверяй каждое утверждение с расшифровкой. Сумма долей должна быть примерно 1,
а evidence должен содержать только дословные цитаты руководителя.`;

function renderArgument(
  label: string,
  argument: DebateArgumentPayload,
): string {
  return `${label}: стиль ${argument.style}. Аргумент: ${argument.argument} Цитата: «${argument.quote}».`;
}

function verifiedEvidence(
  dialog: DialogContext,
  evidence: { style: ManagementStyle; quote: string }[],
): { style: ManagementStyle; quote: string }[] {
  const managerSpeech = dialog.turns
    .filter((turn) => turn.role === "manager")
    .map((turn) => turn.text);
  return evidence.filter(
    (item) =>
      item.quote.trim().length > 0 &&
      managerSpeech.some((speech) => speech.includes(item.quote.trim())),
  );
}

async function debateStyle(
  dialog: DialogContext,
  deps: StageDeps,
): Promise<{
  distribution: StyleDistribution;
  evidence: { style: ManagementStyle; quote: string }[];
  usage: LlmUsage;
  model: string;
  fallback: boolean;
  debate?: {
    critic: DebateArgumentPayload;
    defender: DebateArgumentPayload;
  };
}> {
  const transcript = renderTranscript(dialog);
  let spent = addUsage();

  try {
    const critic = await deps.provider.generate({
      purpose: "evaluation.debate.critic",
      schemaName: "debate_argument",
      schema: debateArgumentSchema,
      effort: deps.effort,
      signal: deps.signal,
      system: CRITIC_SYSTEM,
      messages: [{ role: "user", content: transcript }],
    });
    spent = addUsage(spent, critic.usage);

    const defender = await deps.provider.generate({
      purpose: "evaluation.debate.defender",
      schemaName: "debate_argument",
      schema: debateArgumentSchema,
      effort: deps.effort,
      signal: deps.signal,
      system: DEFENDER_SYSTEM,
      messages: [
        {
          role: "user",
          content: `${transcript}\n\n${renderArgument("ПОЗИЦИЯ КРИТИКА", critic.value)}`,
        },
      ],
    });
    spent = addUsage(spent, defender.usage);

    const arbiter = await deps.provider.generate({
      purpose: "evaluation.debate.arbiter",
      schemaName: "style_analysis",
      schema: styleAnalysisSchema,
      effort: deps.effort,
      signal: deps.signal,
      system: ARBITER_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            transcript,
            "",
            renderArgument("ПОЗИЦИЯ КРИТИКА", critic.value),
            renderArgument("АЛЬТЕРНАТИВА ЗАЩИТНИКА", defender.value),
          ].join("\n"),
        },
      ],
    });
    spent = addUsage(spent, arbiter.usage);

    return {
      distribution: arbiter.value.distribution,
      evidence: verifiedEvidence(dialog, arbiter.value.evidence),
      usage: spent,
      model: arbiter.model,
      fallback: false,
      debate: { critic: critic.value, defender: defender.value },
    };
  } catch (cause) {
    if (deps.signal?.aborted) throw cause;
    // Если любой участник дебатов недоступен или вернул невалидную схему,
    // используем проверенный single-judge. Уже потраченные токены всё равно
    // учитываются, иначе fallback искусственно выглядел бы дешевле.
    const fallback = await judgeStyle(dialog, deps);
    return {
      ...fallback,
      usage: addUsage(spent, fallback.usage),
      fallback: true,
    };
  }
}

export const debateJudgeEvaluation: EvaluationStrategy = {
  id: "debate-judge",
  description:
    "Multi-agent LLM judge: критик, защитник альтернативы и арбитр обсуждают стиль; критерии проверяет независимый judge.",

  async evaluate(request, deps) {
    const startedAt = Date.now();
    const { dialog, expectation } = request;

    // Критерии не зависят от дебатов о стиле и считаются параллельно: так три
    // последовательных debate-хода не добавляют ещё один round trip в конец.
    const criteriaPromise = judgeCriteria(dialog, expectation, deps);
    const [style, criteria] = await Promise.all([
      debateStyle(dialog, deps),
      criteriaPromise,
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
      meta: {
        evidence: style.evidence,
        model: style.model,
        debateFallback: style.fallback,
        debate: style.debate,
      },
    };
  },
};
