import {
  chunkText,
  classifyChunkAudience,
  createEmbeddingProvider,
  extractFacts,
  extractGraph,
  upsertChunks,
  upsertEntities,
} from "@acme/ai";
import {
  and,
  eq,
  type GameKnowledgeAudience,
  GameKnowledgeChunk,
  GameKnowledgeDocument,
  GameKnowledgeFact,
} from "@acme/db";
import { db } from "@acme/db/client";
import { downloadBufferFromS3 } from "@acme/storage";
import { schemaTask, task } from "@trigger.dev/sdk";
import mammoth from "mammoth";
import { extractText } from "unpdf";
import { z } from "zod";
import { parseWithDocling } from "../docling-client";
import { parseWithMinerU } from "../mineru-client";

export interface IngestKnowledgeDocumentInput {
  documentId: string;
  version: number;
}

const ingestKnowledgeDocumentInputSchema = z.object({
  documentId: z.uuid(),
  version: z.number().int().positive(),
});

interface KnowledgeChunk {
  index: number;
  text: string;
  audience: GameKnowledgeAudience;
}

/** unpdf/mammoth extraction — used directly when Docling is unconfigured, and as its fallback otherwise. */
async function extractWithFallback(
  sourceType: "pdf" | "docx",
  buffer: Buffer,
): Promise<string> {
  if (sourceType === "pdf") {
    const result = await extractText(new Uint8Array(buffer), {
      mergePages: true,
    });
    return result.text;
  }
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/**
 * Turns an admin-uploaded file into searchable, org-scoped knowledge chunks
 * for the `org-rag` strategy (`packages/ai/src/strategies/knowledge/org-rag.ts`).
 *
 * Fills in what was previously the `process-document` demo stub with the
 * real pipeline: download → parse → chunk → LLM-suggest audience → embed →
 * persist. The document lands in `needs_review`, never `ready` — an admin
 * must confirm the audience labels before `org-rag` will read the chunks,
 * so a bad guess here costs a review click, not a leak into the role-play
 * prompt (see `packages/ai/src/knowledge/audience-classifier.ts`).
 *
 * Each step below runs as its own task (with its own retries/timeout) and
 * is chained with `triggerAndWait`, mirroring the previous DAG.
 *
 * @see https://trigger.dev/docs/triggering
 */
const extractContentTask = task({
  id: "ingest-extract-content",
  retry: { maxAttempts: 3 },
  // Headroom for the full parser cascade: Docling (DOCLING_TIMEOUT_MS,
  // default 90s) → MinerU on PDFs only (MINERU_TIMEOUT_MS, default 180s,
  // heavier CPU-bound OCR) → unpdf/mammoth. The S3 download and the final
  // fallback itself are comparatively instant.
  maxDuration: 350,
  run: async (input: IngestKnowledgeDocumentInput) => {
    const [document] = await db
      .select()
      .from(GameKnowledgeDocument)
      .where(
        and(
          eq(GameKnowledgeDocument.id, input.documentId),
          eq(GameKnowledgeDocument.version, input.version),
        ),
      )
      .limit(1);
    if (!document) {
      throw new Error(`Knowledge document ${input.documentId} not found`);
    }

    const buffer = await downloadBufferFromS3(document.s3Key);
    let text: string;
    if (document.sourceType === "pdf" || document.sourceType === "docx") {
      const filename = `document.${document.sourceType}`;
      const docling = await parseWithDocling(buffer, filename);
      if (docling.ok) {
        text = docling.text;
      } else {
        // Docling not configured, unreachable, or the extraction it
        // returned was too sparse to trust (see docling-client.ts) — a
        // parser problem costs table structure, not the whole ingestion.
        console.warn(
          `Docling parse skipped for document ${input.documentId} (${docling.reason})`,
        );
        // MinerU only handles PDFs (services/mineru-parser) — it exists
        // for the scans/layout-heavy pages Docling struggles with, not as
        // a general DOCX path, so DOCX goes straight to mammoth.
        const mineru =
          document.sourceType === "pdf"
            ? await parseWithMinerU(buffer, filename)
            : { ok: false as const, reason: "not-applicable-to-docx" };
        if (mineru.ok) {
          text = mineru.text;
        } else {
          console.warn(
            `MinerU parse skipped for document ${input.documentId} (${mineru.reason}), falling back to ${document.sourceType === "pdf" ? "unpdf" : "mammoth"}`,
          );
          text = await extractWithFallback(document.sourceType, buffer);
        }
      }
    } else {
      text = buffer.toString("utf-8");
    }

    text = text.trim();
    if (text.length === 0) {
      throw new Error("Документ не содержит текста для индексации");
    }

    return {
      text,
      orgId: document.orgId,
      defaultAudience: document.audience,
      expectedVersion: document.version,
    };
  },
});

const chunkAndClassifyTask = task({
  id: "ingest-chunk-and-classify",
  retry: { maxAttempts: 3 },
  maxDuration: 180,
  run: async (input: {
    text: string;
    defaultAudience: GameKnowledgeAudience;
  }) => {
    const chunks = chunkText(input.text);

    let suggestions: Map<number, GameKnowledgeAudience>;
    try {
      const classified = await classifyChunkAudience(chunks);
      suggestions = new Map(
        classified.map((item) => [item.index, item.audience]),
      );
    } catch {
      // The classifier is a suggestion, not a gate — nothing goes live
      // before an admin reviews it either way, so fall back to the
      // document's declared default rather than fail the whole ingestion.
      suggestions = new Map();
    }

    const chunkList: KnowledgeChunk[] = chunks.map((item) => ({
      index: item.index,
      text: item.text,
      audience: suggestions.get(item.index) ?? input.defaultAudience,
    }));

    return { chunks: chunkList };
  },
});

/** A chunk once it has a real database id — what the enrichment fan-out below needs. */
interface PersistedChunk {
  id: string;
  index: number;
  text: string;
  audience: GameKnowledgeAudience;
  vector: number[];
}

const embedAndPersistTask = task({
  id: "ingest-embed-and-persist",
  retry: { maxAttempts: 3 },
  maxDuration: 180,
  run: async (input: {
    documentId: string;
    version: number;
    orgId: string;
    expectedVersion: number;
    chunks: KnowledgeChunk[];
  }) => {
    if (input.version !== input.expectedVersion) {
      throw new Error("Knowledge document version changed during ingestion");
    }

    const embeddingProvider = createEmbeddingProvider();
    const vectors = await embeddingProvider.embed(
      input.chunks.map((chunk) => chunk.text),
    );
    if (vectors.length !== input.chunks.length) {
      throw new Error("Embedding provider returned an unexpected vector count");
    }
    // Keyed by chunkIndex (unique per document) rather than paired by
    // array position with the RETURNING rows below — INSERT...RETURNING
    // row order isn't a guarantee worth relying on for correctness.
    const chunkByIndex = new Map(
      input.chunks.map((chunk, position) => [
        chunk.index,
        {
          text: chunk.text,
          audience: chunk.audience,
          vector: vectors[position] ?? [],
        },
      ]),
    );

    const insertedRows = await db.transaction(async (tx) => {
      const [claimedDocument] = await tx
        .update(GameKnowledgeDocument)
        .set({ status: "needs_review", statusMessage: null })
        .where(
          and(
            eq(GameKnowledgeDocument.id, input.documentId),
            eq(GameKnowledgeDocument.version, input.expectedVersion),
            eq(GameKnowledgeDocument.status, "processing"),
          ),
        )
        .returning({ id: GameKnowledgeDocument.id });
      if (!claimedDocument) return undefined;

      await tx
        .delete(GameKnowledgeChunk)
        .where(
          and(
            eq(GameKnowledgeChunk.documentId, input.documentId),
            eq(GameKnowledgeChunk.orgId, input.orgId),
          ),
        );

      if (input.chunks.length === 0) return [];

      return tx
        .insert(GameKnowledgeChunk)
        .values(
          input.chunks.map((chunk, position) => ({
            documentId: input.documentId,
            orgId: input.orgId,
            chunkIndex: chunk.index,
            text: chunk.text,
            audience: chunk.audience,
            embedding: vectors[position],
          })),
        )
        .returning({
          id: GameKnowledgeChunk.id,
          chunkIndex: GameKnowledgeChunk.chunkIndex,
        });
    });

    const stale = insertedRows === undefined;
    const insertedChunks: PersistedChunk[] = (insertedRows ?? []).flatMap(
      (row) => {
        const source = chunkByIndex.get(row.chunkIndex);
        return source
          ? [
              {
                id: row.id,
                index: row.chunkIndex,
                text: source.text,
                audience: source.audience,
                vector: source.vector,
              },
            ]
          : [];
      },
    );

    return {
      chunkCount: insertedChunks.length,
      stale,
      insertedChunks,
    };
  },
});

const embedAndIndexQdrantTask = task({
  id: "ingest-index-qdrant",
  retry: { maxAttempts: 3 },
  maxDuration: 120,
  run: async (input: {
    orgId: string;
    documentId: string;
    chunks: Pick<PersistedChunk, "id" | "audience" | "vector">[];
  }) => {
    await upsertChunks(
      input.chunks.map((chunk) => ({
        id: chunk.id,
        vector: chunk.vector,
        orgId: input.orgId,
        documentId: input.documentId,
        audience: chunk.audience,
      })),
    );
    return { indexed: input.chunks.length };
  },
});

const extractGraphTask = task({
  id: "ingest-extract-graph",
  retry: { maxAttempts: 3 },
  // LLM entity/relation extraction runs one batched call per ~15 chunks
  // (packages/ai/src/knowledge/entity-extractor.ts) — slower than a single
  // embedding call, hence the wider budget.
  maxDuration: 300,
  run: async (input: {
    orgId: string;
    documentId: string;
    chunks: { index: number; text: string }[];
  }) => {
    const perChunk = await extractGraph(input.chunks);

    // One graph per document, not per chunk: a relation extracted from one
    // chunk routinely points at an entity introduced in another.
    const entities = new Map<
      string,
      { id: string; type: string; label: string }
    >();
    const relations: {
      from: string;
      to: string;
      type: string;
      label: string;
    }[] = [];
    for (const chunk of perChunk) {
      for (const entity of chunk.entities) entities.set(entity.id, entity);
      relations.push(...chunk.relations);
    }

    await upsertEntities(
      input.orgId,
      input.documentId,
      [...entities.values()],
      relations,
    );
    return { entityCount: entities.size, relationCount: relations.length };
  },
});

const extractFactsTask = task({
  id: "ingest-extract-facts",
  retry: { maxAttempts: 3 },
  maxDuration: 300,
  run: async (input: {
    orgId: string;
    documentId: string;
    chunks: Pick<PersistedChunk, "id" | "index" | "text" | "audience">[];
  }) => {
    const perChunk = await extractFacts(
      input.chunks.map((chunk) => ({ index: chunk.index, text: chunk.text })),
    );
    const chunkByIndex = new Map(
      input.chunks.map((chunk) => [chunk.index, chunk]),
    );

    const rows = perChunk.flatMap((chunk) => {
      const source = chunkByIndex.get(chunk.index);
      if (!source) return [];
      return chunk.facts.map((fact) => ({
        documentId: input.documentId,
        chunkId: source.id,
        orgId: input.orgId,
        subject: fact.subject,
        predicate: fact.predicate,
        object: fact.object,
        confidence: fact.confidence,
        // Inherited from the chunk it was extracted from — no second
        // classification pass, same as the graph/vector channels.
        audience: source.audience,
      }));
    });

    if (rows.length > 0) {
      await db.insert(GameKnowledgeFact).values(rows);
    }
    return { factCount: rows.length };
  },
});

// Runs only once the pipeline exhausts its retries — without this, a bad
// upload (corrupt PDF, empty file, embedding-endpoint outage) leaves the
// document stuck in `processing` forever with no admin-visible reason.
async function markDocumentFailed(
  input: IngestKnowledgeDocumentInput,
  error: unknown,
) {
  const message =
    error instanceof Error ? error.message : "Ошибка обработки документа";
  await db
    .update(GameKnowledgeDocument)
    .set({ status: "failed", statusMessage: message.slice(0, 2000) })
    .where(
      and(
        eq(GameKnowledgeDocument.id, input.documentId),
        eq(GameKnowledgeDocument.version, input.version),
        eq(GameKnowledgeDocument.status, "processing"),
      ),
    );
}

export const ingestKnowledgeDocumentTask = schemaTask({
  id: "ingest-knowledge-document",
  schema: ingestKnowledgeDocumentInputSchema,
  // Sub-tasks already retry their own step; retrying the orchestration
  // itself would just repeat whichever step already exhausted its retries.
  retry: { maxAttempts: 1 },
  // Headroom for the worst case across every step: the three-tier parser
  // cascade (up to 350s) plus chunk/classify and the Postgres/Qdrant/Neo4j/
  // facts fan-out afterward.
  maxDuration: 900,
  onFailure: async ({ payload, error }) => {
    await markDocumentFailed(payload, error);
  },
  run: async (payload) => {
    const extracted = await extractContentTask.triggerAndWait(payload).unwrap();

    const classified = await chunkAndClassifyTask
      .triggerAndWait({
        text: extracted.text,
        defaultAudience: extracted.defaultAudience,
      })
      .unwrap();

    const persisted = await embedAndPersistTask
      .triggerAndWait({
        documentId: payload.documentId,
        version: payload.version,
        orgId: extracted.orgId,
        expectedVersion: extracted.expectedVersion,
        chunks: classified.chunks,
      })
      .unwrap();

    // Qdrant/Neo4j/atomic-facts are org-fusion-rag's supplementary
    // retrieval channels, not gates on the document reaching
    // `needs_review` — fired without waiting so a slow LLM extraction pass
    // never holds up admin review. Each has its own retry policy; a
    // failure here costs that channel's recall for this document, never
    // the whole ingestion (same contract as the parser cascade above).
    if (!persisted.stale && persisted.insertedChunks.length > 0) {
      const { orgId } = extracted;
      const { documentId } = payload;
      const { insertedChunks } = persisted;

      // Qdrant stores every chunk regardless of audience and filters at
      // query time (searchQdrant), matching how org-rag reads
      // GameKnowledgeChunk itself — one row, filtered live.
      await embedAndIndexQdrantTask.trigger({
        orgId,
        documentId,
        chunks: insertedChunks.map((chunk) => ({
          id: chunk.id,
          audience: chunk.audience,
          vector: chunk.vector,
        })),
      });

      // Neo4j and game_knowledge_facts have no per-item audience filter on
      // the read side, so `judge`-labeled chunks never reach extraction in
      // the first place — nothing judge-derived is ever written, rather
      // than written-then-filtered. One consequence: correcting a chunk's
      // audience afterward via `updateChunkAudience` does not retroactively
      // change what's already in these two stores for that document —
      // re-running ingestion does.
      const visibleChunks = insertedChunks.filter(
        (chunk) => chunk.audience !== "judge",
      );
      if (visibleChunks.length > 0) {
        await extractGraphTask.trigger({
          orgId,
          documentId,
          chunks: visibleChunks.map((chunk) => ({
            index: chunk.index,
            text: chunk.text,
          })),
        });
        await extractFactsTask.trigger({
          orgId,
          documentId,
          chunks: visibleChunks.map((chunk) => ({
            id: chunk.id,
            index: chunk.index,
            text: chunk.text,
            audience: chunk.audience,
          })),
        });
      }
    }

    return {
      chunkCount: persisted.chunkCount,
      stale: persisted.stale,
    };
  },
});
