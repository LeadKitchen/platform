import type { KnowledgeSnippet } from "../types";
import { fuseRankings } from "./bm25";

export interface ChannelHit {
  id: string;
  score: number;
  text: string;
  source: string;
}

export interface FuseChannelsOptions {
  /** One ranked hit list per retrieval channel — order within each list is what RRF uses, not the raw scores. */
  channels: ChannelHit[][];
  pool: number;
}

/**
 * Reciprocal-rank-fuses N independently-ranked channels
 * (`strategies/knowledge/org-fusion-rag.ts`: lexical/vector/graph/facts)
 * into one ranked candidate pool, normalized to 0…1 against the top fused
 * score — same normalization `hybrid-rag` uses for its two channels,
 * generalized to however many are passed in.
 *
 * A pure function — no I/O — deliberately factored out of the strategy so
 * the fusion math is unit-testable without any of the stores
 * `org-fusion-rag` actually reads from (Postgres/Qdrant/Neo4j). The first
 * channel to mention a given id wins the text/source shown for it; this
 * only matters when two channels rank the *same* id, which in practice is
 * only the lexical and vector channels (both rank `GameKnowledgeChunk`
 * ids) — graph and facts contribute their own ids.
 */
export function fuseChannels(options: FuseChannelsOptions): KnowledgeSnippet[] {
  const { channels, pool } = options;
  if (!Number.isFinite(pool) || !Number.isInteger(pool) || pool < 0) {
    throw new RangeError("pool must be a finite non-negative integer");
  }

  const rankings = channels
    .map((hits) => hits.map((hit, rank) => ({ id: hit.id, rank })))
    .filter((ranking) => ranking.length > 0);
  const fused = fuseRankings(rankings);

  const byId = new Map<string, ChannelHit>();
  for (const hits of channels) {
    for (const hit of hits) {
      if (!byId.has(hit.id)) byId.set(hit.id, hit);
    }
  }

  const rankedIds = [...fused.entries()].sort((a, b) => b[1] - a[1]);
  const bestScore = rankedIds[0]?.[1] ?? 1;

  return rankedIds.slice(0, pool).flatMap(([id, score]) => {
    const hit = byId.get(id);
    if (!hit) return [];
    return [
      {
        id: hit.id,
        text: hit.text,
        source: hit.source,
        score: bestScore === 0 ? 0 : score / bestScore,
      },
    ];
  });
}
