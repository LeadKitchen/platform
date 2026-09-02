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
import mammoth from "mammoth";
import { extractText } from "unpdf";
import { z } from "zod";

import { hatchet } from "../client";

export interface IngestKnowledgeDocumentInput {
  documentId: string;
  version: number;
}

const ingestKnowledgeDocumentInputSchema = z.object({
  documentId: z.uuid(),
  version: z.number().int().positive(),
});

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
 * @see https://docs.hatchet.run/home/dag
 */
export const ingestKnowledgeDocumentWorkflow = hatchet.workflow({
  name: "ingest-knowledge-document",
});

const extractContent = ingestKnowledgeDocumentWorkflow.task({
  name: "extract-content",
  retries: 3,
  executionTimeout: "2m",
  fn: async (rawInput) => {
    const input = ingestKnowledgeDocumentInputSchema.parse(rawInput);
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
    if (document.sourceType === "pdf") {
      const result = await extractText(new Uint8Array(buffer), {
        mergePages: true,
      });
      text = result.text;
    } else if (document.sourceType === "docx") {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
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

const chunkAndClassify = ingestKnowledgeDocumentWorkflow.task({
  name: "chunk-and-classify",
  parents: [extractContent],
  retries: 3,
  executionTimeout: "3m",
  fn: async (_rawInput, ctx) => {
    const { text, defaultAudience } = await ctx.parentOutput(extractContent);
    const chunks = chunkText(text);

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

    return {
      chunks: chunks.map((item) => ({
        index: item.index,
        text: item.text,
        audience: suggestions.get(item.index) ?? defaultAudience,
      })),
    };
  },
});

ingestKnowledgeDocumentWorkflow.task({
  name: "embed-and-persist",
  parents: [extractContent, chunkAndClassify],
  retries: 3,
  executionTimeout: "3m",
  fn: async (rawInput, ctx) => {
    const input = ingestKnowledgeDocumentInputSchema.parse(rawInput);
    const { orgId, expectedVersion } = await ctx.parentOutput(extractContent);
    const { chunks } = await ctx.parentOutput(chunkAndClassify);

    if (input.version !== expectedVersion) {
      throw new Error("Knowledge document version changed during ingestion");
    }

    const embeddingProvider = createEmbeddingProvider();
    const vectors = await embeddingProvider.embed(
      chunks.map((chunk) => chunk.text),
    );
    if (vectors.length !== chunks.length) {
      throw new Error("Embedding provider returned an unexpected vector count");
    }

    const persisted = await db.transaction(async (tx) => {
      const [claimedDocument] = await tx
        .update(GameKnowledgeDocument)
        .set({ status: "needs_review", statusMessage: null })
        .where(
          and(
            eq(GameKnowledgeDocument.id, input.documentId),
            eq(GameKnowledgeDocument.version, expectedVersion),
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
            eq(GameKnowledgeChunk.orgId, orgId),
          ),
        );

      if (chunks.length > 0) {
        await tx.insert(GameKnowledgeChunk).values(
          chunks.map((chunk, position) => ({
            documentId: input.documentId,
            orgId,
            chunkIndex: chunk.index,
            text: chunk.text,
            audience: chunk.audience,
            embedding: vectors[position],
          })),
        );
      }

      return true;
    });

    return { chunkCount: persisted ? chunks.length : 0, stale: !persisted };
  },
});

// Runs only if a task above exhausted its retries — without this, a bad
// upload (corrupt PDF, empty file, embedding-endpoint outage) leaves the
// document stuck in `processing` forever with no admin-visible reason.
ingestKnowledgeDocumentWorkflow.onFailure({
  name: "mark-failed",
  executionTimeout: "30s",
  fn: async (rawInput, ctx) => {
    const input = ingestKnowledgeDocumentInputSchema.parse(rawInput);
    const errors = Object.values(ctx.errors());
    const message = errors.join("; ") || "Ошибка обработки документа";
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
    return { handled: true };
  },
});
