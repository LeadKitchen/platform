import type { Catalog } from "@acme/game";

import {
  buildCorpus,
  type KnowledgeDoc,
  searchCorpus,
} from "../../knowledge/corpus";
import type { KnowledgeStrategy } from "../../types";

const cache = new WeakMap<Catalog, KnowledgeDoc[]>();

function corpusFor(catalog: Catalog): KnowledgeDoc[] {
  const cached = cache.get(catalog);
  if (cached) return cached;
  const corpus = buildCorpus(catalog);
  cache.set(catalog, corpus);
  return corpus;
}

/**
 * Retrieval arm: only the chunks relevant to the current utterance reach the
 * prompt.
 *
 * The index is lexical (TF-IDF) and in-process, which keeps the arm free and
 * deterministic. Replacing it with embeddings or a vector database is a change
 * to this file only — the pipeline, the API and the analytics see the same
 * `KnowledgeStrategy` either way.
 */
export const ragKnowledge: KnowledgeStrategy = {
  id: "rag-lexical",
  description:
    "Поиск по базе знаний (профили, карточки задач, методология) — в промпт попадают только релевантные фрагменты.",

  async retrieve(request, deps) {
    const startedAt = Date.now();
    const topK = typeof deps.params.topK === "number" ? deps.params.topK : 6;
    const corpus = corpusFor(deps.catalog);

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

    const hits = searchCorpus(corpus, query, topK);

    // The character must always know who they are, even when the query is
    // about something else — pin the profile regardless of its rank.
    const pinnedId = `profile:${employee.id}`;
    const pinned = corpus.find((doc) => doc.id === pinnedId);
    const snippets = hits.map((hit) => ({
      id: hit.doc.id,
      text: hit.doc.text,
      score: hit.score,
      source: hit.doc.source,
    }));

    if (pinned && !snippets.some((snippet) => snippet.id === pinnedId)) {
      snippets.unshift({
        id: pinned.id,
        text: pinned.text,
        score: 1,
        source: pinned.source,
      });
    }

    return {
      snippets,
      latencyMs: Date.now() - startedAt,
      meta: { topK, corpusSize: corpus.length, query },
    };
  },
};
