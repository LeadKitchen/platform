INSERT INTO "game_organizations" ("id", "name")
VALUES ('global-knowledge-base', 'Общая база знаний')
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

-- The composite document/org foreign keys do not cascade updates. Drop them
-- inside this migration transaction, move the complete knowledge hierarchy,
-- then restore the same constraints before the transaction commits.
ALTER TABLE "game_knowledge_facts" DROP CONSTRAINT "game_knowledge_facts_document_org_fk";--> statement-breakpoint
ALTER TABLE "game_knowledge_chunks" DROP CONSTRAINT "game_knowledge_chunks_document_org_fk";--> statement-breakpoint

UPDATE "game_knowledge_documents"
SET "org_id" = 'global-knowledge-base'
WHERE "org_id" <> 'global-knowledge-base';--> statement-breakpoint
UPDATE "game_knowledge_chunks"
SET "org_id" = 'global-knowledge-base'
WHERE "org_id" <> 'global-knowledge-base';--> statement-breakpoint
UPDATE "game_knowledge_facts"
SET "org_id" = 'global-knowledge-base'
WHERE "org_id" <> 'global-knowledge-base';--> statement-breakpoint
UPDATE "game_knowledge_pending_uploads"
SET "org_id" = 'global-knowledge-base'
WHERE "org_id" <> 'global-knowledge-base';--> statement-breakpoint

ALTER TABLE "game_knowledge_chunks" ADD CONSTRAINT "game_knowledge_chunks_document_org_fk"
FOREIGN KEY ("document_id", "org_id") REFERENCES "public"."game_knowledge_documents"("id", "org_id")
ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_knowledge_facts" ADD CONSTRAINT "game_knowledge_facts_document_org_fk"
FOREIGN KEY ("document_id", "org_id") REFERENCES "public"."game_knowledge_documents"("id", "org_id")
ON DELETE cascade ON UPDATE no action;
