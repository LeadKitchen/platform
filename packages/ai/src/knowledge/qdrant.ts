import { env } from "@acme/config";
import type { GameKnowledgeAudience } from "@acme/db";
import type { QdrantClient as QdrantClientType } from "@qdrant/js-client-rest";

/**
 * Qdrant client for `org-fusion-rag`'s vector channel
 * (`packages/ai/src/strategies/knowledge/org-fusion-rag.ts`) — additive to
 * the pgvector column `embedAndPersistTask` already writes on every chunk;
 * `org-rag` and the built-in corpus strategies keep reading pgvector
 * unchanged.
 *
 * The client is created lazily on first use rather than at module import
 * (dynamic `import()`, mirroring `strategies/knowledge/org-rag.ts`'s
 * pattern for `@acme/db`), so nothing that only exercises built-in
 * strategies — offline eval, unit tests — needs a live Qdrant instance
 * just because this module exists in the registry. `env.QDRANT_URL` unset
 * means every export here is a no-op: this channel then contributes
 * nothing to the fusion, rather than failing the dialog.
 */

const COLLECTION_NAME = "org_knowledge_chunks";
// Matches KNOWLEDGE_EMBEDDING_DIMENSIONS in ./embeddings.ts.
const VECTOR_SIZE = 1536;

export interface QdrantChunkInput {
  id: string;
  vector: number[];
  orgId: string;
  documentId: string;
  audience: GameKnowledgeAudience;
}

export interface QdrantHit {
  id: string;
  score: number;
}

let clientPromise: Promise<QdrantClientType> | undefined;
let ensureCollectionPromise: Promise<void> | undefined;

async function getClient(): Promise<QdrantClientType | undefined> {
  if (!env.QDRANT_URL) return undefined;
  clientPromise ??= (async () => {
    const { QdrantClient } = await import("@qdrant/js-client-rest");
    return new QdrantClient({
      url: env.QDRANT_URL,
      apiKey: env.QDRANT_API_KEY,
    });
  })();
  const instance = await clientPromise;
  await ensureCollection(instance);
  return instance;
}

function ensureCollection(instance: QdrantClientType): Promise<void> {
  ensureCollectionPromise ??= (async () => {
    const { exists } = await instance.collectionExists(COLLECTION_NAME);
    if (exists) return;
    await instance.createCollection(COLLECTION_NAME, {
      vectors: { size: VECTOR_SIZE, distance: "Cosine" },
    });
    // Payload indexes for the two fields every query filters on — without
    // them Qdrant still filters correctly, just by a full payload scan.
    await instance.createPayloadIndex(COLLECTION_NAME, {
      field_name: "orgId",
      field_schema: "keyword",
    });
    await instance.createPayloadIndex(COLLECTION_NAME, {
      field_name: "audience",
      field_schema: "keyword",
    });
  })();
  return ensureCollectionPromise;
}

/**
 * Upserts embedded chunks. A failure here costs this channel's recall for
 * the document, never the whole ingestion — same graceful-degradation
 * contract as the rest of the pipeline (docs/ai-module.md).
 */
export async function upsertChunks(chunks: QdrantChunkInput[]): Promise<void> {
  if (chunks.length === 0) return;
  try {
    const instance = await getClient();
    if (!instance) return;

    await instance.upsert(COLLECTION_NAME, {
      wait: true,
      points: chunks.map((chunk) => ({
        id: chunk.id,
        vector: chunk.vector,
        payload: {
          orgId: chunk.orgId,
          documentId: chunk.documentId,
          audience: chunk.audience,
        },
      })),
    });
  } catch (error) {
    console.warn(
      `Qdrant upsert failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Queries the vector channel, scoped by org and by the same
 * audience-must-never-leak-`judge`-to-the-character filter every other
 * channel applies inside its own query, never as a post-hoc filter (see
 * docs/ai-module.md). Errors and an unconfigured client both degrade to an
 * empty result rather than failing the dialog.
 */
export async function searchQdrant(
  orgId: string,
  queryVector: number[],
  topK: number,
): Promise<QdrantHit[]> {
  try {
    const instance = await getClient();
    if (!instance) return [];

    const { points } = await instance.query(COLLECTION_NAME, {
      query: queryVector,
      limit: topK,
      filter: {
        must: [
          { key: "orgId", match: { value: orgId } },
          { key: "audience", match: { any: ["character", "both"] } },
        ],
      },
    });

    return points.map((hit) => ({ id: String(hit.id), score: hit.score }));
  } catch (error) {
    console.warn(
      `Qdrant search failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}
