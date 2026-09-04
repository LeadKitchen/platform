CREATE TABLE "game_knowledge_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"chunk_id" uuid NOT NULL,
	"org_id" text NOT NULL,
	"subject" text NOT NULL,
	"predicate" text NOT NULL,
	"object" text NOT NULL,
	"confidence" real NOT NULL,
	"audience" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_knowledge_facts_audience_check" CHECK ("game_knowledge_facts"."audience" in ('character', 'judge', 'both')),
	CONSTRAINT "game_knowledge_facts_confidence_check" CHECK ("game_knowledge_facts"."confidence" >= 0 and "game_knowledge_facts"."confidence" <= 1)
);
--> statement-breakpoint
ALTER TABLE "game_knowledge_chunks" ADD CONSTRAINT "game_knowledge_chunks_id_document_id_unique" UNIQUE("id","document_id");--> statement-breakpoint
ALTER TABLE "game_knowledge_facts" ADD CONSTRAINT "game_knowledge_facts_chunk_document_fk" FOREIGN KEY ("chunk_id","document_id") REFERENCES "public"."game_knowledge_chunks"("id","document_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_knowledge_facts" ADD CONSTRAINT "game_knowledge_facts_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_knowledge_facts" ADD CONSTRAINT "game_knowledge_facts_document_org_fk" FOREIGN KEY ("document_id","org_id") REFERENCES "public"."game_knowledge_documents"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_knowledge_facts_org_audience_idx" ON "game_knowledge_facts" USING btree ("org_id","audience");--> statement-breakpoint
CREATE INDEX "game_knowledge_facts_chunk_idx" ON "game_knowledge_facts" USING btree ("chunk_id");
