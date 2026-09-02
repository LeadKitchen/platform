CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "game_knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"org_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"audience" varchar(16) NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_knowledge_chunks_audience_check" CHECK ("game_knowledge_chunks"."audience" in ('character', 'judge', 'both'))
);
--> statement-breakpoint
CREATE TABLE "game_knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"title" varchar(200) NOT NULL,
	"source_type" varchar(16) NOT NULL,
	"s3_key" text NOT NULL,
	"status" varchar(16) DEFAULT 'processing' NOT NULL,
	"status_message" text,
	"audience" varchar(16) DEFAULT 'character' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_knowledge_documents_id_org_id_unique" UNIQUE("id","org_id"),
	CONSTRAINT "game_knowledge_documents_audience_check" CHECK ("game_knowledge_documents"."audience" in ('character', 'judge', 'both'))
);
--> statement-breakpoint
CREATE TABLE "game_knowledge_pending_uploads" (
	"key" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"source_type" varchar(16) NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_knowledge_pending_uploads_source_type_check" CHECK ("game_knowledge_pending_uploads"."source_type" in ('pdf', 'docx', 'txt'))
);
--> statement-breakpoint
ALTER TABLE "game_knowledge_chunks" ADD CONSTRAINT "game_knowledge_chunks_document_org_fk" FOREIGN KEY ("document_id","org_id") REFERENCES "public"."game_knowledge_documents"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_knowledge_chunks" ADD CONSTRAINT "game_knowledge_chunks_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_knowledge_documents" ADD CONSTRAINT "game_knowledge_documents_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_knowledge_documents" ADD CONSTRAINT "game_knowledge_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_knowledge_pending_uploads" ADD CONSTRAINT "game_knowledge_pending_uploads_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_knowledge_pending_uploads" ADD CONSTRAINT "game_knowledge_pending_uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_knowledge_chunks_document_idx" ON "game_knowledge_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "game_knowledge_chunks_org_audience_idx" ON "game_knowledge_chunks" USING btree ("org_id","audience");--> statement-breakpoint
CREATE INDEX "game_knowledge_documents_org_idx" ON "game_knowledge_documents" USING btree ("org_id","created_at");
