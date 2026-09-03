import type { LlmEffort, LlmProvider, LlmUsage } from "../provider/types";
import { addUsage } from "../provider/types";
import { rerankingSchema } from "../schemas";
import type { KnowledgeSnippet } from "../types";

/**
 * LLM reranking over a high-recall candidate pool — the second stage of
 * every two-stage RAG strategy in this codebase
 * (`strategies/knowledge/rerank-rag.ts`,
 * `strategies/knowledge/org-fusion-rag.ts`). Cross-encoder-like without a
 * dedicated reranker API: it runs through the same provider, so its
 * latency/cost show up in the same telemetry as everything else.
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

function pinSnippet(
  snippets: KnowledgeSnippet[],
  candidates: KnowledgeSnippet[],
  pinId: string | undefined,
): KnowledgeSnippet[] {
  if (!pinId || snippets.some((snippet) => snippet.id === pinId)) {
    return snippets;
  }
  const pinned = candidates.find((snippet) => snippet.id === pinId);
  return pinned ? [pinned, ...snippets] : snippets;
}

export interface RerankSnippetsOptions {
  provider: LlmProvider;
  effort?: LlmEffort;
  signal?: AbortSignal;
  query: string;
  candidates: KnowledgeSnippet[];
  topK: number;
  /** A snippet id (e.g. `profile:${employeeId}`) always kept in the result if present among `candidates`. */
  pinId?: string;
  /** Usage already accumulated upstream (e.g. by the first-stage retrieval) — added to, not replaced. */
  usage?: LlmUsage;
}

export interface RerankSnippetsResult {
  snippets: KnowledgeSnippet[];
  usage?: LlmUsage;
  reranked: boolean;
  rerankOrder?: number[];
  rerankModel?: string;
  rerankFailed?: boolean;
  rerankReason?: string;
}

export async function rerankSnippets(
  options: RerankSnippetsOptions,
): Promise<RerankSnippetsResult> {
  const {
    provider,
    effort = "low",
    signal,
    query,
    candidates,
    topK,
    pinId,
    usage,
  } = options;

  if (candidates.length <= topK) {
    return {
      snippets: pinSnippet(candidates, candidates, pinId),
      usage,
      reranked: false,
      rerankReason: "кандидатов не больше topK",
    };
  }

  const rendered = candidates
    .map(
      (snippet, index) =>
        `[${index}] (${snippet.source}, ${snippet.id}) ${snippet.text}`,
    )
    .join("\n");

  try {
    const result = await provider.generate({
      purpose: "knowledge.rerank",
      schemaName: "retrieval_ranking",
      schema: rerankingSchema,
      effort,
      signal,
      system: RERANK_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Запрос: ${query}\n\nКандидаты:\n${rendered}`,
        },
      ],
    });

    // Дедупликация и строгая проверка диапазона защищают от неидеального
    // structured output на OpenAI-compatible шлюзах.
    const seen = new Set<number>();
    const order = result.value.order.filter((index) => {
      if (index < 0 || index >= candidates.length || seen.has(index)) {
        return false;
      }
      seen.add(index);
      return true;
    });

    // Если модель вернула пустой/сломанный ranking, сохраняем
    // deterministic high-recall порядок первого этапа вместо пустого
    // контекста.
    const selected =
      order.length > 0
        ? order.slice(0, topK).flatMap((index) => candidates[index] ?? [])
        : candidates.slice(0, topK);

    return {
      snippets: pinSnippet(selected, candidates, pinId),
      usage: addUsage(usage, result.usage),
      reranked: order.length > 0,
      rerankOrder: order.slice(0, topK),
      rerankModel: result.model,
    };
  } catch (cause) {
    if (signal?.aborted) throw cause;
    return {
      snippets: pinSnippet(candidates.slice(0, topK), candidates, pinId),
      usage,
      reranked: false,
      rerankFailed: true,
    };
  }
}
