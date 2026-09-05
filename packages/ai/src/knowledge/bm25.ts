import type { KnowledgeDoc } from "./corpus";
import { tokenize } from "./corpus";

/**
 * BM25 over the knowledge base.
 *
 * Replaces the previous cosine-ish TF-IDF: BM25 saturates term frequency and
 * normalises by document length, which matters here because the corpus mixes
 * one-line competence facts with multi-sentence task cards — without length
 * normalisation the long cards win every query on sheer word count.
 */

const K1 = 1.5;
const B = 0.75;

export interface Bm25Index {
  docs: KnowledgeDoc[];
  tokens: string[][];
  averageLength: number;
  documentFrequency: Map<string, number>;
}

export function buildBm25Index(docs: KnowledgeDoc[]): Bm25Index {
  const tokens = docs.map((doc) => tokenize(doc.text));
  const documentFrequency = new Map<string, number>();

  for (const docTokens of tokens) {
    for (const term of new Set(docTokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const totalLength = tokens.reduce((sum, list) => sum + list.length, 0);

  return {
    docs,
    tokens,
    averageLength: tokens.length === 0 ? 1 : totalLength / tokens.length,
    documentFrequency,
  };
}

export interface Bm25Hit {
  doc: KnowledgeDoc;
  score: number;
}

export function searchBm25(
  index: Bm25Index,
  query: string,
  topK: number,
): Bm25Hit[] {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  const total = index.docs.length;
  const scored: Bm25Hit[] = [];

  for (const [position, doc] of index.docs.entries()) {
    const docTokens = index.tokens[position] ?? [];
    const length = docTokens.length;
    let score = 0;

    for (const term of new Set(queryTerms)) {
      const frequency = docTokens.filter((token) => token === term).length;
      if (frequency === 0) continue;

      const df = index.documentFrequency.get(term) ?? 0;
      // Robertson/Sparck-Jones IDF with the +0.5 smoothing that keeps a term
      // present in most documents from going negative.
      const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));
      const denominator =
        frequency + K1 * (1 - B + (B * length) / index.averageLength);
      score += idf * ((frequency * (K1 + 1)) / denominator);
    }

    if (score > 0) scored.push({ doc, score });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

/**
 * Reciprocal Rank Fusion.
 *
 * Combines rankings without needing their scores to be comparable — BM25
 * returns unbounded relevance, cosine similarity returns 0–1, and normalising
 * one onto the other is exactly the fragile step RRF removes. `k` damps the
 * influence of top ranks so a single list cannot dominate the fusion.
 */
export function fuseRankings(
  rankings: { id: string; rank: number }[][],
  k = 60,
): Map<string, number> {
  const fused = new Map<string, number>();

  for (const ranking of rankings) {
    for (const { id, rank } of ranking) {
      fused.set(id, (fused.get(id) ?? 0) + 1 / (k + rank));
    }
  }

  return fused;
}
