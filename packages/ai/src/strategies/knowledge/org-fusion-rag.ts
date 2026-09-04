import { buildBm25Index, searchBm25 } from "../../knowledge/bm25";
import { type KnowledgeDoc, tokenize } from "../../knowledge/corpus";
import { createEmbeddingProvider } from "../../knowledge/embeddings";
import { type ChannelHit, fuseChannels } from "../../knowledge/fusion";
import {
  findSeedEntities,
  traverseOrgGraph,
} from "../../knowledge/neo4j-graph";
import { searchQdrant } from "../../knowledge/qdrant";
import { rerankSnippets } from "../../knowledge/rerank";
import type { KnowledgeStrategy } from "../../types";

/**
 * The "Retrieval Gateway" — four independent channels over an org's
 * uploaded documents, fused with RRF and LLM-reranked, alongside `org-rag`
 * (plain pgvector) as a comparable, cheaper arm rather than a replacement.
 *
 * - **lexical**: BM25 over the org's own chunks (`../../knowledge/bm25.ts`).
 * - **vector**: Qdrant (`../../knowledge/qdrant.ts`), additive to the
 *   pgvector column `org-rag` reads.
 * - **graph**: Neo4j (`../../knowledge/neo4j-graph.ts`), seeded from a
 *   lexical match on entity labels — org documents have no fixed id scheme
 *   the way the built-in catalog does.
 * - **facts**: `game_knowledge_facts` — LLM-extracted `(subject, predicate,
 *   object)` triples, matched by term overlap.
 *
 * Each channel degrades to empty on its own failure or when unconfigured
 * (Qdrant/Neo4j both need env vars; see their own modules) — same
 * graceful-degradation contract as `org-rag`'s embedding-outage handling.
 * The DB import is dynamic and deferred to request time for the same
 * reason `org-rag` defers it: nothing that only runs the built-in
 * strategies should need `POSTGRES_URL`.
 *
 * Safety invariant, applied per-channel rather than after the fact:
 * `audience: "judge"` content must never reach the character prompt.
 * Postgres channels (lexical, facts) filter it in their own SQL `where`;
 * Qdrant filters it in its own query; nothing judge-labeled is ever
 * written to Neo4j in the first place (see
 * `packages/jobs/src/trigger/ingest-knowledge-document.ts`).
 */

const DEFAULT_POOL_MULTIPLIER = 3;
const SEED_ENTITY_LIMIT = 5;
const MAX_FACT_ROWS = 500;
const MAX_CHUNK_ROWS = 2000;

export const orgFusionRagKnowledge: KnowledgeStrategy = {
  id: "org-fusion-rag",
  description:
    "Retrieval Gateway по документам организации: BM25 + Qdrant + Neo4j + атомарные факты, слияние через RRF, LLM-реранкер.",

  async retrieve(request, deps) {
    const startedAt = Date.now();
    const topK = typeof deps.params.topK === "number" ? deps.params.topK : 6;
    const poolMultiplier =
      typeof deps.params.candidateMultiplier === "number"
        ? Math.max(1, Math.round(deps.params.candidateMultiplier))
        : DEFAULT_POOL_MULTIPLIER;
    const pool = topK * poolMultiplier;
    const hops = typeof deps.params.hops === "number" ? deps.params.hops : 2;

    const orgId = request.dialog.orgId;
    if (!orgId) {
      return {
        snippets: [],
        latencyMs: Date.now() - startedAt,
        meta: { reason: "no-org", topK },
      };
    }

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

    const {
      and,
      db,
      eq,
      GameKnowledgeChunk,
      GameKnowledgeDocument,
      GameKnowledgeFact,
      inArray,
    } = await import("@acme/db");

    // Pulled once, reused for both the lexical channel (BM25 index) and as
    // the text lookup for vector-channel hits (Qdrant returns ids/scores
    // only — see ../../knowledge/qdrant.ts).
    const chunkRows = await db
      .select({ id: GameKnowledgeChunk.id, text: GameKnowledgeChunk.text })
      .from(GameKnowledgeChunk)
      .innerJoin(
        GameKnowledgeDocument,
        eq(GameKnowledgeDocument.id, GameKnowledgeChunk.documentId),
      )
      .where(
        and(
          eq(GameKnowledgeDocument.orgId, orgId),
          inArray(GameKnowledgeChunk.audience, ["character", "both"]),
          eq(GameKnowledgeDocument.status, "ready"),
        ),
      )
      .limit(MAX_CHUNK_ROWS);
    const chunkById = new Map(chunkRows.map((row) => [row.id, row.text]));

    const bm25Docs: KnowledgeDoc[] = chunkRows.map((row) => ({
      id: row.id,
      text: row.text,
      // KnowledgeDoc's `source` union is shaped for the built-in corpus;
      // org chunks don't fit it and the value isn't read by BM25 scoring
      // or by the snippet this strategy actually returns.
      source: "regulation",
      audience: "character",
      tags: [],
    }));
    const lexicalHits =
      bm25Docs.length > 0
        ? searchBm25(buildBm25Index(bm25Docs), query, pool)
        : [];

    const embeddingProvider = createEmbeddingProvider();
    let vectorHits: { id: string; score: number }[] = [];
    let vectorFailed = false;
    try {
      const [queryVector] = await embeddingProvider.embed([query]);
      if (queryVector) {
        vectorHits = await searchQdrant(orgId, queryVector, pool);
      }
    } catch {
      // An embedding-endpoint outage should cost this channel its recall,
      // not the dialog — same degrade-gracefully contract as hybrid-rag.
      vectorFailed = true;
    }

    const seedTerms = [
      employee.name,
      employee.role,
      task.title,
      task.type,
    ].filter((term): term is string => Boolean(term));
    const seeds = await findSeedEntities(orgId, seedTerms, SEED_ENTITY_LIMIT);
    const graphResult =
      seeds.length > 0
        ? await traverseOrgGraph(orgId, seeds, hops)
        : { facts: [], visited: [] };

    const factRows = await db
      .select({
        id: GameKnowledgeFact.id,
        subject: GameKnowledgeFact.subject,
        predicate: GameKnowledgeFact.predicate,
        object: GameKnowledgeFact.object,
      })
      .from(GameKnowledgeFact)
      .innerJoin(
        GameKnowledgeDocument,
        eq(GameKnowledgeDocument.id, GameKnowledgeFact.documentId),
      )
      .where(
        and(
          eq(GameKnowledgeDocument.orgId, orgId),
          inArray(GameKnowledgeFact.audience, ["character", "both"]),
          eq(GameKnowledgeDocument.status, "ready"),
        ),
      )
      .limit(MAX_FACT_ROWS);

    const queryTerms = new Set(tokenize(query));
    const factHits = factRows
      .map((row) => {
        const text = `${row.subject} — ${row.predicate}: ${row.object}`;
        const overlap = tokenize(text).filter((term) =>
          queryTerms.has(term),
        ).length;
        return { row, text, overlap };
      })
      .filter((hit) => hit.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, pool);

    // Only lexical and vector share an id space (both rank
    // GameKnowledgeChunk ids) — graph and facts contribute their own items
    // to the fused ranking without boosting anything, the same way a
    // pinned profile snippet does in hybrid-rag.
    const lexicalChannel: ChannelHit[] = lexicalHits.map((hit) => ({
      id: hit.doc.id,
      score: hit.score,
      text: hit.doc.text,
      source: "org-lexical",
    }));
    const vectorChannel: ChannelHit[] = vectorHits.flatMap((hit) => {
      const text = chunkById.get(hit.id);
      return text
        ? [{ id: hit.id, score: hit.score, text, source: "org-vector" }]
        : [];
    });
    const graphChannel: ChannelHit[] = graphResult.facts.map((fact) => ({
      id: fact.id,
      score: 1,
      text: fact.text,
      source: "org-graph",
    }));
    const factsChannel: ChannelHit[] = factHits.map((hit) => ({
      id: hit.row.id,
      score: 1,
      text: hit.text,
      source: "org-fact",
    }));

    const candidates = fuseChannels({
      channels: [lexicalChannel, vectorChannel, graphChannel, factsChannel],
      pool,
    });

    const reranked = await rerankSnippets({
      provider: deps.provider,
      effort: deps.effort,
      signal: deps.signal,
      query: request.query,
      candidates,
      topK,
    });

    return {
      snippets: reranked.snippets,
      usage: reranked.usage,
      latencyMs: Date.now() - startedAt,
      meta: {
        topK,
        pool,
        orgId,
        lexicalHits: lexicalHits.length,
        vectorHits: vectorHits.length,
        vectorFailed,
        graphSeeds: seeds.length,
        graphHits: graphResult.facts.length,
        factHits: factHits.length,
        reranked: reranked.reranked,
        rerankFailed: reranked.rerankFailed,
      },
    };
  },
};
