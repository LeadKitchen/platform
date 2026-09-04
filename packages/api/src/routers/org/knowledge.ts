import { createEmbeddingProvider, searchQdrant } from "@acme/ai";
import {
  and,
  desc,
  eq,
  GameKnowledgeChunk,
  GameKnowledgeDocument,
  GameKnowledgePendingUpload,
  inArray,
  ne,
  sql,
} from "@acme/db";
import { ingestKnowledgeDocumentTask } from "@acme/jobs";
import {
  createPresignedUrl,
  deleteObjectFromS3,
  generateS3Key,
  MAX_UPLOAD_SIZE_BYTES,
} from "@acme/storage";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { requireFacilitatorOrgId } from "../../game/organizations";
import { protectedProcedure } from "../../orpc";

const audienceSchema = z.enum(["character", "judge", "both"]);
const sourceTypeSchema = z.enum(["pdf", "docx", "txt"]);

/**
 * Admin-uploaded knowledge base for the org's role-play "virtual employee".
 *
 * Every mutation here is org-scoped through `requireFacilitatorOrgId`, same
 * as `scorecards.ts` — a facilitator only ever touches their own team's
 * documents. Nothing published here is retrievable by `org-rag`
 * (`packages/ai/src/strategies/knowledge/org-rag.ts`) until `publish` moves
 * a document from `needs_review` to `ready`: the LLM-suggested audience
 * labels are a draft, and only a human confirming them puts the document in
 * front of the character.
 */

async function assertOwnedDocument(
  context: Parameters<typeof requireFacilitatorOrgId>[0],
  orgId: string,
  documentId: string,
) {
  const [row] = await context
    .select()
    .from(GameKnowledgeDocument)
    .where(
      and(
        eq(GameKnowledgeDocument.id, documentId),
        eq(GameKnowledgeDocument.orgId, orgId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Документ не найден" });
  }
  return row;
}

async function markDocumentEnqueueFailed(
  context: Parameters<typeof assertOwnedDocument>[0],
  documentId: string,
  version: number,
) {
  await context
    .update(GameKnowledgeDocument)
    .set({
      status: "failed",
      statusMessage: "Не удалось запустить обработку документа",
    })
    .where(
      and(
        eq(GameKnowledgeDocument.id, documentId),
        eq(GameKnowledgeDocument.version, version),
        eq(GameKnowledgeDocument.status, "processing"),
      ),
    );
}

export const list = protectedProcedure.handler(async ({ context }) => {
  const orgId = await requireFacilitatorOrgId(
    context.db,
    context.session.user.id,
  );
  return context.db
    .select()
    .from(GameKnowledgeDocument)
    .where(eq(GameKnowledgeDocument.orgId, orgId))
    .orderBy(desc(GameKnowledgeDocument.createdAt));
});

export const get = protectedProcedure
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );
    const document = await assertOwnedDocument(context.db, orgId, input.id);
    const chunks = await context.db
      .select()
      .from(GameKnowledgeChunk)
      .where(eq(GameKnowledgeChunk.documentId, input.id))
      .orderBy(GameKnowledgeChunk.chunkIndex);
    return { document, chunks };
  });

/** Step 1 of upload: mint a presigned PUT URL and its one-time confirmation authorization. */
export const requestUpload = protectedProcedure
  .input(
    z.object({
      sourceType: sourceTypeSchema,
      size: z.number().int().positive().max(MAX_UPLOAD_SIZE_BYTES),
    }),
  )
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );
    const key = generateS3Key(`knowledge.${input.sourceType}`);
    const uploadUrl = await createPresignedUrl(key, input.size);
    await context.db.insert(GameKnowledgePendingUpload).values({
      key,
      orgId,
      userId: context.session.user.id,
      sourceType: input.sourceType,
      size: input.size,
    });
    return { key, uploadUrl };
  });

/** Step 2: the browser has PUT the file to `key` — create the row and kick off ingestion. */
export const confirmUpload = protectedProcedure
  .input(
    z.object({
      key: z.string().min(1),
      title: z.string().trim().min(1).max(200),
      sourceType: sourceTypeSchema,
      audience: audienceSchema.default("character"),
    }),
  )
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );
    const document = await context.db.transaction(async (tx) => {
      const [pendingUpload] = await tx
        .delete(GameKnowledgePendingUpload)
        .where(
          and(
            eq(GameKnowledgePendingUpload.key, input.key),
            eq(GameKnowledgePendingUpload.orgId, orgId),
            eq(GameKnowledgePendingUpload.userId, context.session.user.id),
            eq(GameKnowledgePendingUpload.sourceType, input.sourceType),
          ),
        )
        .returning();
      if (!pendingUpload) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Загрузка не найдена, уже подтверждена или недоступна",
        });
      }

      const [createdDocument] = await tx
        .insert(GameKnowledgeDocument)
        .values({
          orgId,
          title: input.title,
          sourceType: input.sourceType,
          s3Key: input.key,
          audience: input.audience,
          uploadedBy: context.session.user.id,
        })
        .returning();
      return createdDocument;
    });
    if (!document) throw new Error("Не удалось создать документ");

    try {
      await ingestKnowledgeDocumentTask.runNoWait({
        documentId: document.id,
        version: document.version,
      });
    } catch (error) {
      await markDocumentEnqueueFailed(
        context.db,
        document.id,
        document.version,
      );
      throw error;
    }

    return document;
  });

/** Re-run ingestion for a document stuck in `failed` (e.g. after a transient embedding-endpoint outage). */
export const retry = protectedProcedure
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );
    const document = await assertOwnedDocument(context.db, orgId, input.id);
    if (document.status !== "failed") {
      throw new ORPCError("BAD_REQUEST", {
        message: "Повторная обработка доступна только после ошибки",
      });
    }
    const [updatedDocument] = await context.db
      .update(GameKnowledgeDocument)
      .set({
        status: "processing",
        statusMessage: null,
        version: sql`${GameKnowledgeDocument.version} + 1`,
      })
      .where(
        and(
          eq(GameKnowledgeDocument.id, input.id),
          eq(GameKnowledgeDocument.version, document.version),
          eq(GameKnowledgeDocument.status, "failed"),
        ),
      )
      .returning();
    if (!updatedDocument) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Статус документа уже изменился",
      });
    }
    try {
      await ingestKnowledgeDocumentTask.runNoWait({
        documentId: input.id,
        version: updatedDocument.version,
      });
    } catch (error) {
      await markDocumentEnqueueFailed(
        context.db,
        input.id,
        updatedDocument.version,
      );
      throw error;
    }
    return { id: input.id };
  });

export const updateChunkAudience = protectedProcedure
  .input(
    z.object({
      documentId: z.uuid(),
      chunkId: z.uuid(),
      audience: audienceSchema,
    }),
  )
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );
    await assertOwnedDocument(context.db, orgId, input.documentId);
    await context.db
      .update(GameKnowledgeChunk)
      .set({ audience: input.audience })
      .where(
        and(
          eq(GameKnowledgeChunk.id, input.chunkId),
          eq(GameKnowledgeChunk.documentId, input.documentId),
        ),
      );
    return { id: input.chunkId };
  });

/** Admin confirms the audience labels — this is the only path that makes a document visible to `org-rag`. */
export const publish = protectedProcedure
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );
    const document = await assertOwnedDocument(context.db, orgId, input.id);
    if (document.status !== "needs_review") {
      throw new ORPCError("BAD_REQUEST", {
        message: "Документ должен пройти обработку перед публикацией",
      });
    }
    await context.db
      .update(GameKnowledgeDocument)
      .set({ status: "ready" })
      .where(eq(GameKnowledgeDocument.id, input.id));
    return { id: input.id };
  });

export const remove = protectedProcedure
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );
    const document = await assertOwnedDocument(context.db, orgId, input.id);
    await context.db
      .delete(GameKnowledgeDocument)
      .where(eq(GameKnowledgeDocument.id, input.id));
    await deleteObjectFromS3(document.s3Key).catch(() => {
      // Best-effort: an orphaned S3 object costs storage, not correctness —
      // never let it block removing the document from the game.
    });
    return { id: input.id };
  });

/** QA panel: run the same retrieval a live dialog would, against *any* status, so an admin can check labels before publishing. */
export const previewRetrieval = protectedProcedure
  .input(z.object({ query: z.string().trim().min(1).max(2000) }))
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );
    const [queryVector] = await createEmbeddingProvider().embed([input.query]);
    if (!queryVector) return { hits: [] };

    // Unlike the in-dialog strategies, admin QA is allowed to see `judge`
    // chunks (a facilitator reviewing labels), so pass the full audience
    // set rather than relying on searchQdrant's character/both default.
    const qdrantHits = await searchQdrant(orgId, queryVector, 10, [
      "character",
      "judge",
      "both",
    ]);
    if (qdrantHits.length === 0) return { hits: [] };

    const rows = await context.db
      .select({
        id: GameKnowledgeChunk.id,
        text: GameKnowledgeChunk.text,
        audience: GameKnowledgeChunk.audience,
        documentId: GameKnowledgeChunk.documentId,
        documentTitle: GameKnowledgeDocument.title,
        documentStatus: GameKnowledgeDocument.status,
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
            qdrantHits.map((hit) => hit.id),
          ),
          ne(GameKnowledgeDocument.status, "failed"),
        ),
      );
    const rowById = new Map(rows.map((row) => [row.id, row]));

    const hits = qdrantHits
      .flatMap((hit) => {
        const row = rowById.get(hit.id);
        return row ? [{ ...row, score: hit.score }] : [];
      })
      .sort((a, b) => b.score - a.score);

    return { hits };
  });

export const orgKnowledgeRouter = {
  list,
  get,
  requestUpload,
  confirmUpload,
  retry,
  updateChunkAudience,
  publish,
  remove,
  previewRetrieval,
};
