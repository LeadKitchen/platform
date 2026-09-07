ALTER TABLE "game_knowledge_documents" ADD COLUMN "original_filename" text;--> statement-breakpoint
ALTER TABLE "game_knowledge_documents" ADD COLUMN "file_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "game_knowledge_documents" ADD COLUMN "word_count" integer;--> statement-breakpoint
ALTER TABLE "game_knowledge_documents" ADD COLUMN "char_count" integer;--> statement-breakpoint
ALTER TABLE "game_knowledge_documents" ADD COLUMN "chunk_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

-- Backfill chunk_count for documents ingested before this column existed —
-- their chunks already exist, only the denormalized count was never stored.
-- word_count/char_count are left null: recovering them would require
-- re-parsing the source file, which re-ingestion already does.
UPDATE "game_knowledge_documents" AS d
SET "chunk_count" = c.count
FROM (
  SELECT "document_id", count(*) AS count
  FROM "game_knowledge_chunks"
  GROUP BY "document_id"
) AS c
WHERE c."document_id" = d.id;