import type { Catalog } from "@acme/game";

import {
  type Bm25Index,
  buildBm25Index,
  fuseRankings,
  searchBm25,
} from "../../knowledge/bm25";
import { buildCorpus, type KnowledgeDoc } from "../../knowledge/corpus";
import {
  createEmbeddingProvider,
  EmbeddingIndex,
} from "../../knowledge/embeddings";
import type { KnowledgeStrategy } from "../../types";

interface Indexes {
  docs: KnowledgeDoc[];
  bm25: Bm25Index;
  dense: EmbeddingIndex | null;
}

const cache = new WeakMap<Catalog, Indexes>();

function indexesFor(catalog: Catalog, useDense: boolean): Indexes {
  const cached = cache.get(catalog);
  if (cached) return cached;

  // Only documents the character is allowed to see are indexed at all — the
  // audience filter is enforced at build time so no ranking change can leak
  // the methodology into a role-play prompt.
  const docs = buildCorpus(catalog).filter((doc) => doc.audience !== "judge");

  const indexes: Indexes = {
    docs,
    bm25: buildBm25Index(docs),
    dense: useDense
      ? new EmbeddingIndex(
          createEmbeddingProvider(),
          docs.map((doc) => ({ id: doc.id, text: doc.text })),
        )
      : null,
  };

  cache.set(catalog, indexes);
  return indexes;
}

/**
 * Hybrid retrieval: BM25 + dense embeddings, fused with RRF.
 *
 * The two halves fail differently — BM25 misses paraphrase ("торт" vs
 * "десерт"), embeddings miss exact identifiers ("L4", "decorating") — and
 * fusing their *ranks* rather than their scores is what lets each cover the
 * other without a normalisation constant nobody can tune honestly.
 *
 * Whether this beats plain BM25 on a corpus of a few dozen short documents is
 * an open question, and precisely what the harness exists to answer: the
 * expected win only appears once the catalog is large enough that the right
 * fact stops being in the top-k by luck.
 */
export const hybridRagKnowledge: KnowledgeStrategy = {
  id: "hybrid-rag",
  description:
    "Гибридный поиск: BM25 + плотные эмбеддинги, слияние рангов через RRF.",

  async retrieve(request, deps) {
    const startedAt = Date.now();
    const topK = typeof deps.params.topK === "number" ? deps.params.topK : 6;
    const useDense = deps.params.dense !== false;

    const { employee, task, shift } = request.dialog;
    const query = [
      request.query,
      employee.name,
      employee.role,
      task.title,
      task.type,
      shift.soloOnShift ? "один в смене перегруз приоритеты" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const indexes = indexesFor(deps.catalog, useDense);
    const pool = topK * 3;

    const lexical = searchBm25(indexes.bm25, query, pool).map((hit, rank) => ({
      id: hit.doc.id,
      rank,
    }));

    let dense: { id: string; rank: number }[] = [];
    let denseFailed = false;
    if (indexes.dense) {
      try {
        dense = (await indexes.dense.search(query, pool)).map((hit, rank) => ({
          id: hit.id,
          rank,
        }));
      } catch {
        // Degrade to lexical rather than fail the dialog: an embedding
        // endpoint outage should cost recall, not the whole game session.
        denseFailed = true;
      }
    }

    const fused = fuseRankings(dense.length > 0 ? [lexical, dense] : [lexical]);
    const byId = new Map(indexes.docs.map((doc) => [doc.id, doc]));

    const ranked = [...fused.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .flatMap(([id, score]) => {
        const doc = byId.get(id);
        return doc ? [{ doc, score }] : [];
      });

    const best = ranked[0]?.score ?? 1;
    const snippets = ranked.map((hit) => ({
      id: hit.doc.id,
      text: hit.doc.text,
      score: best === 0 ? 0 : hit.score / best,
      source: hit.doc.source,
    }));

    // The character must always know who they are, whatever the ranking says.
    const pinnedId = `profile:${employee.id}`;
    if (!snippets.some((snippet) => snippet.id === pinnedId)) {
      const pinned = byId.get(pinnedId);
      if (pinned) {
        snippets.unshift({
          id: pinned.id,
          text: pinned.text,
          score: 1,
          source: pinned.source,
        });
      }
    }

    return {
      snippets,
      latencyMs: Date.now() - startedAt,
      meta: {
        topK,
        corpusSize: indexes.docs.length,
        lexicalHits: lexical.length,
        denseHits: dense.length,
        denseFailed,
      },
    };
  },
};
