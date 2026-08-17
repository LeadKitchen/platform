import { addUsage } from "../../provider/types";
import { rerankingSchema } from "../../schemas";
import type { KnowledgeSnippet, KnowledgeStrategy } from "../../types";
import { hybridRagKnowledge } from "./hybrid-rag";

/**
 * LLM reranking поверх high-recall кандидатов.
 *
 * Первый этап (BM25 + dense + RRF) быстро достаёт широкий набор; второй
 * совместно читает запрос и каждый кандидат и оставляет только действительно
 * полезные фрагменты. Это cross-encoder-подобная схема без привязки к
 * отдельному reranker API, поэтому её можно честно запустить через тот же
 * провайдер и учесть стоимость в общей telemetry.
 */

const RERANK_SYSTEM = `Ты ранжируешь фрагменты внутренней базы знаний ресторана.
Выбери только те фрагменты, которые непосредственно помогают сотруднику
правдоподобно ответить на последнюю реплику руководителя.

Приоритеты:
1. Точный регламент или факт, о котором спрашивает руководитель.
2. Компетенция именно этого сотрудника по текущему типу задачи.
3. Карточка именно текущего заказа и профиль сотрудника.
4. Общие сведения — только если точных нет.

Не выбирай фрагмент только из-за совпадения отдельных слов. Возвращай индексы
из входного списка в порядке убывания полезности.`;

function pinProfile(
  snippets: KnowledgeSnippet[],
  candidates: KnowledgeSnippet[],
  employeeId: string,
): KnowledgeSnippet[] {
  const profileId = `profile:${employeeId}`;
  if (snippets.some((snippet) => snippet.id === profileId)) return snippets;
  const profile = candidates.find((snippet) => snippet.id === profileId);
  return profile ? [profile, ...snippets] : snippets;
}

export const rerankRagKnowledge: KnowledgeStrategy = {
  id: "rerank-rag",
  description:
    "Двухэтапный RAG: BM25+эмбеддинги формируют широкий пул, LLM cross-encoder-подобно переранжирует его до top-k.",

  async retrieve(request, deps) {
    const startedAt = Date.now();
    const topK = typeof deps.params.topK === "number" ? deps.params.topK : 6;
    const candidateMultiplier =
      typeof deps.params.candidateMultiplier === "number"
        ? Math.max(1, Math.round(deps.params.candidateMultiplier))
        : 3;
    const candidateK = topK * candidateMultiplier;

    const initial = await hybridRagKnowledge.retrieve(request, {
      ...deps,
      params: { ...deps.params, topK: candidateK },
    });

    if (initial.snippets.length <= topK) {
      return {
        ...initial,
        latencyMs: Date.now() - startedAt,
        meta: {
          ...initial.meta,
          candidateK,
          reranked: false,
          rerankReason: "кандидатов не больше topK",
        },
      };
    }

    const rendered = initial.snippets
      .map(
        (snippet, index) =>
          `[${index}] (${snippet.source}, ${snippet.id}) ${snippet.text}`,
      )
      .join("\n");

    try {
      const result = await deps.provider.generate({
        purpose: "knowledge.rerank",
        schemaName: "retrieval_ranking",
        schema: rerankingSchema,
        effort: "low",
        signal: deps.signal,
        system: RERANK_SYSTEM,
        messages: [
          {
            role: "user",
            content: `Запрос: ${request.query}\n\nКандидаты:\n${rendered}`,
          },
        ],
      });

      // Дедупликация и строгая проверка диапазона защищают от неидеального
      // structured output на OpenAI-compatible шлюзах.
      const seen = new Set<number>();
      const order = result.value.order.filter((index) => {
        if (index < 0 || index >= initial.snippets.length || seen.has(index)) {
          return false;
        }
        seen.add(index);
        return true;
      });

      // Если модель вернула пустой/сломанный ranking, сохраняем deterministic
      // high-recall порядок первого этапа вместо пустого контекста.
      const selected =
        order.length > 0
          ? order
              .slice(0, topK)
              .flatMap((index) => initial.snippets[index] ?? [])
          : initial.snippets.slice(0, topK);
      const snippets = pinProfile(
        selected,
        initial.snippets,
        request.dialog.employee.id,
      );

      return {
        snippets,
        usage: addUsage(initial.usage, result.usage),
        latencyMs: Date.now() - startedAt,
        meta: {
          ...initial.meta,
          candidateK,
          reranked: order.length > 0,
          rerankOrder: order.slice(0, topK),
          rerankModel: result.model,
        },
      };
    } catch (cause) {
      if (deps.signal?.aborted) throw cause;
      return {
        snippets: pinProfile(
          initial.snippets.slice(0, topK),
          initial.snippets,
          request.dialog.employee.id,
        ),
        usage: initial.usage,
        latencyMs: Date.now() - startedAt,
        meta: {
          ...initial.meta,
          candidateK,
          reranked: false,
          rerankFailed: true,
        },
      };
    }
  },
};
