import { createEmbeddingProvider } from "../../knowledge/embeddings";
import { searchQdrant } from "../../knowledge/qdrant";
import type { KnowledgeStrategy } from "../../types";

/**
 * Retrieval over documents an organization's admin uploaded through the
 * knowledge-base UI, instead of the built-in hand-written corpus.
 *
 * The DB import is dynamic and deliberately deferred to request time: this
 * file is imported eagerly by `registries.ts`, and `@acme/db` opens a
 * Postgres connection as a side effect of import. Nothing that only runs the
 * built-in strategies (the offline eval harness, unit tests) should have to
 * provide `POSTGRES_URL` just because this arm exists in the registry.
 *
 * Safety rule carried over from `packages/ai/src/knowledge/corpus.ts`:
 * `audience: "judge"` documents must never reach the character prompt. Here
 * that is enforced inside the Qdrant query itself (`searchQdrant`'s default
 * audience filter), not by filtering the result afterwards — a bug in this
 * file cannot leak the methodology by forgetting a downstream filter. The
 * Postgres lookup that follows only resolves ids Qdrant already cleared.
 */
export const orgRagKnowledge: KnowledgeStrategy = {
  id: "org-rag",
  description:
    "Поиск по документам, загруженным администратором организации (Qdrant).",

  async retrieve(request, deps) {
    const startedAt = Date.now();
    const topK = typeof deps.params.topK === "number" ? deps.params.topK : 6;
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

    const embeddingProvider = createEmbeddingProvider();
    let queryVector: number[] | undefined;
    try {
      [queryVector] = await embeddingProvider.embed([query]);
    } catch {
      // An embedding-endpoint outage should cost this arm its recall, not
      // the dialog — same degrade-gracefully contract as hybrid-rag.
      return {
        snippets: [],
        latencyMs: Date.now() - startedAt,
        meta: { reason: "embedding-failed", topK },
      };
    }
    if (!queryVector) {
      return {
        snippets: [],
        latencyMs: Date.now() - startedAt,
        meta: { reason: "empty-query", topK },
      };
    }

    const hits = await searchQdrant(orgId, queryVector, topK);
    if (hits.length === 0) {
      return {
        snippets: [],
        latencyMs: Date.now() - startedAt,
        meta: { topK, orgId, hits: 0 },
      };
    }

    const {
      and,
      db,
      eq,
      GameKnowledgeChunk,
      GameKnowledgeDocument,
      inArray,
    } = await import("@acme/db");

    // Qdrant returns ids/scores only — the chunk text lives in Postgres.
    // Filtered by status here (not in Qdrant, which doesn't know about
    // document lifecycle) so a chunk from a still-unpublished document
    // never surfaces even if it was already indexed.
    const rows = await db
      .select({
        id: GameKnowledgeChunk.id,
        text: GameKnowledgeChunk.text,
        documentId: GameKnowledgeChunk.documentId,
      })
      .from(GameKnowledgeChunk)
      .innerJoin(
        GameKnowledgeDocument,
        eq(GameKnowledgeDocument.id, GameKnowledgeChunk.documentId),
      )
      .where(
        and(
          eq(GameKnowledgeChunk.orgId, orgId),
          inArray(
            GameKnowledgeChunk.id,
            hits.map((hit) => hit.id),
          ),
          // Chunks only go live once an admin confirms the audience labels
          // suggested during ingestion — see `needs_review` in the schema.
          eq(GameKnowledgeDocument.status, "ready"),
        ),
      );
    const rowById = new Map(rows.map((row) => [row.id, row]));

    const snippets = hits.flatMap((hit) => {
      const row = rowById.get(hit.id);
      if (!row) return [];
      return [
        {
          id: row.id,
          text: row.text,
          score: hit.score,
          source: "org-document",
        },
      ];
    });

    return {
      snippets,
      latencyMs: Date.now() - startedAt,
      meta: { topK, orgId, hits: snippets.length },
    };
  },
};
