import { rerankSnippets } from "../../knowledge/rerank";
import type { KnowledgeStrategy } from "../../types";
import { hybridRagKnowledge } from "./hybrid-rag";

/**
 * LLM reranking поверх high-recall кандидатов.
 *
 * Первый этап (BM25 + dense + RRF) быстро достаёт широкий набор; второй
 * (`../../knowledge/rerank.ts`, shared with `org-fusion-rag`) совместно
 * читает запрос и каждый кандидат и оставляет только действительно
 * полезные фрагменты.
 */
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

    const reranked = await rerankSnippets({
      provider: deps.provider,
      effort: deps.effort,
      signal: deps.signal,
      query: request.query,
      candidates: initial.snippets,
      topK,
      pinId: `profile:${request.dialog.employee.id}`,
      usage: initial.usage,
    });

    return {
      snippets: reranked.snippets,
      usage: reranked.usage,
      latencyMs: Date.now() - startedAt,
      meta: {
        ...initial.meta,
        candidateK,
        reranked: reranked.reranked,
        rerankOrder: reranked.rerankOrder,
        rerankModel: reranked.rerankModel,
        rerankReason: reranked.rerankReason,
        rerankFailed: reranked.rerankFailed,
      },
    };
  },
};
