import {
  chunkText,
  classifyChunkAudience,
  createEmbeddingProvider,
} from "@acme/ai";
import {
  and,
  eq,
  type GameKnowledgeAudience,
  GameKnowledgeChunk,
  GameKnowledgeDocument,
} from "@acme/db";
import { db } from "@acme/db/client";
import { downloadBufferFromS3 } from "@acme/storage";
import { schemaTask, task } from "@trigger.dev/sdk";
import mammoth from "mammoth";
import { extractText } from "unpdf";
import { z } from "zod";
import { parseWithDocling } from "../docling-client";

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
  // Headroom over DOCLING_TIMEOUT_MS (default 90s) — an OCR-heavy scanned
  // PDF through the Docling service is the slow path here, not the S3
  // download or the unpdf/mammoth fallback.
  maxDuration: 180,
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
      const docling = await parseWithDocling(
        buffer,
        `document.${document.sourceType}`,
      );
      if (docling.ok) {
        text = docling.text;
      } else {
        // Docling not configured, unreachable, or the extraction it
        // returned was too sparse to trust (see docling-client.ts) — a
        // parser problem costs table structure, not the whole ingestion.
        console.warn(
          `Docling parse skipped for document ${input.documentId} (${docling.reason}), falling back to ${document.sourceType === "pdf" ? "unpdf" : "mammoth"}`,
        );
        text = await extractWithFallback(document.sourceType, buffer);
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

    const persisted = await db.transaction(async (tx) => {
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
      if (!claimedDocument) return false;

      await tx
        .delete(GameKnowledgeChunk)
        .where(
          and(
            eq(GameKnowledgeChunk.documentId, input.documentId),
            eq(GameKnowledgeChunk.orgId, input.orgId),
          ),
        );

      if (input.chunks.length > 0) {
        await tx.insert(GameKnowledgeChunk).values(
          input.chunks.map((chunk, position) => ({
            documentId: input.documentId,
            orgId: input.orgId,
            chunkIndex: chunk.index,
            text: chunk.text,
            audience: chunk.audience,
            embedding: vectors[position],
          })),
        );
      }

      return true;
    });

    return {
      chunkCount: persisted ? input.chunks.length : 0,
      stale: !persisted,
    };
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
  maxDuration: 600,
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

    return embedAndPersistTask
      .triggerAndWait({
        documentId: payload.documentId,
        version: payload.version,
        orgId: extracted.orgId,
        expectedVersion: extracted.expectedVersion,
        chunks: classified.chunks,
      })
      .unwrap();
  },
});
