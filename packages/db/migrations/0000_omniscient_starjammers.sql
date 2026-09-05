CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"issuer" text DEFAULT 'local:credential' NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "app_admins" (
	"user_id" text PRIMARY KEY NOT NULL,
	"granted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"username" text,
	"bio" text,
	"language" text DEFAULT 'en',
	"notification_preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_active_organizations" (
	"user_id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_benchmark_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" varchar(128) NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_coaching_paths" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"created_by" text,
	"name" varchar(160) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"steps" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_coaching_path_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path_id" uuid NOT NULL,
	"org_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"assigned_by" text,
	"path_snapshot" jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'assigned' NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"step_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_config_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"source" varchar(32) NOT NULL,
	"summary" varchar(600) NOT NULL,
	"before_snapshot" jsonb NOT NULL,
	"after_snapshot" jsonb NOT NULL,
	"reverted_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_dialogs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"employee_id" text NOT NULL,
	"task_id" text NOT NULL,
	"round" integer NOT NULL,
	"variant_id" text NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"engaged" boolean DEFAULT false NOT NULL,
	"emotion" integer DEFAULT 0 NOT NULL,
	"active_orders" integer DEFAULT 1 NOT NULL,
	"solo_on_shift" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "game_employees" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"role" varchar(128) NOT NULL,
	"level" varchar(8) NOT NULL,
	"gender" varchar(8) NOT NULL,
	"competences" jsonb NOT NULL,
	"personality" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "game_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dialog_id" uuid NOT NULL,
	"variant_id" text NOT NULL,
	"scorecard_id" uuid,
	"scorecard_name" varchar(160),
	"score_percent" integer NOT NULL,
	"expected_style" varchar(32) NOT NULL,
	"actual_style" varchar(32) NOT NULL,
	"style_distribution" jsonb NOT NULL,
	"criteria" jsonb NOT NULL,
	"outcome" jsonb NOT NULL,
	"breakdown" jsonb NOT NULL,
	"summary" text NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dialog_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"type" varchar(48) NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_facilitators" (
	"user_id" text NOT NULL,
	"org_id" text NOT NULL,
	"granted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_facilitators_user_id_org_id_pk" PRIMARY KEY("user_id","org_id")
);
--> statement-breakpoint
CREATE TABLE "game_knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"org_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"audience" varchar(16) NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_knowledge_chunks_id_document_id_unique" UNIQUE("id","document_id"),
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
CREATE TABLE "game_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"task_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"portions" integer DEFAULT 1 NOT NULL,
	"deadline_minutes" integer DEFAULT 60 NOT NULL,
	"notes" text,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_org_members" (
	"user_id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_org_members_user_id_org_id_pk" PRIMARY KEY("user_id","org_id")
);
--> statement-breakpoint
CREATE TABLE "game_organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" varchar(256) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_organization_configure" (
	"org_id" text PRIMARY KEY NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scorecard" jsonb DEFAULT '{"name":"Общая рубрика","criterionIds":[]}'::jsonb NOT NULL,
	"automation" jsonb DEFAULT '{"enabled":false,"threshold":60}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_product_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"session_id" uuid,
	"dialog_id" uuid,
	"name" varchar(64) NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_review_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(32) DEFAULT 'legacy-review' NOT NULL,
	"title" varchar(200) NOT NULL,
	"summary" varchar(400) DEFAULT '' NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_roleplay_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" text NOT NULL,
	"org_id" text,
	"base_employee_id" text NOT NULL,
	"base_task_id" text NOT NULL,
	"title" varchar(180) NOT NULL,
	"employee_name" varchar(128) NOT NULL,
	"employee_role" varchar(128) NOT NULL,
	"employee_level" varchar(8) NOT NULL,
	"category" varchar(48) NOT NULL,
	"description" text NOT NULL,
	"training_objectives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"objections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"private_beliefs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_scorecards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"created_by" text,
	"name" varchar(160) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"categories" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(256) NOT NULL,
	"round" integer NOT NULL,
	"variant_id" text,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_by" text,
	"training_assignment_id" uuid,
	"coaching_path_assignment_id" uuid,
	"coaching_path_step_id" text,
	"roleplay_scenario_id" text,
	"roleplay_scenario_snapshot" jsonb,
	"roleplay_mode" varchar(32),
	"scorecard_id" uuid,
	"scorecard_snapshot" jsonb,
	"org_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "game_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"default_variant_id" text,
	"default_round" integer DEFAULT 2 NOT NULL,
	"default_deadline_minutes" integer DEFAULT 60 NOT NULL,
	"allow_round_three" boolean DEFAULT true NOT NULL,
	"max_active_sessions" integer DEFAULT 20 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_skill_policy" (
	"key" text PRIMARY KEY NOT NULL,
	"value" double precision NOT NULL,
	"count" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"title" varchar(256) NOT NULL,
	"type" varchar(64) NOT NULL,
	"complexity" integer NOT NULL,
	"time_criticality" integer NOT NULL,
	"requires_checkpoints" boolean DEFAULT false NOT NULL,
	"failure_modes" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_training_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"assigned_by" text,
	"criterion_id" varchar(64) NOT NULL,
	"criterion_title" varchar(256) NOT NULL,
	"status" varchar(32) DEFAULT 'assigned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "game_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"engagement" varchar(64) DEFAULT 'heuristic' NOT NULL,
	"knowledge" varchar(64) NOT NULL,
	"persona" varchar(64) NOT NULL,
	"evaluation" varchar(64) NOT NULL,
	"model" varchar(64),
	"effort" varchar(16),
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(256) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_admins" ADD CONSTRAINT "app_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_admins" ADD CONSTRAINT "app_admins_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_active_organizations" ADD CONSTRAINT "game_active_organizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_active_organizations" ADD CONSTRAINT "game_active_organizations_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_coaching_paths" ADD CONSTRAINT "game_coaching_paths_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_coaching_paths" ADD CONSTRAINT "game_coaching_paths_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_coaching_path_assignments" ADD CONSTRAINT "game_coaching_path_assignments_path_id_game_coaching_paths_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."game_coaching_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_coaching_path_assignments" ADD CONSTRAINT "game_coaching_path_assignments_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_coaching_path_assignments" ADD CONSTRAINT "game_coaching_path_assignments_participant_id_users_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_coaching_path_assignments" ADD CONSTRAINT "game_coaching_path_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_config_versions" ADD CONSTRAINT "game_config_versions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_dialogs" ADD CONSTRAINT "game_dialogs_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_dialogs" ADD CONSTRAINT "game_dialogs_order_id_game_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."game_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_dialogs" ADD CONSTRAINT "game_dialogs_employee_id_game_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."game_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_dialogs" ADD CONSTRAINT "game_dialogs_task_id_game_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."game_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_evaluations" ADD CONSTRAINT "game_evaluations_dialog_id_game_dialogs_id_fk" FOREIGN KEY ("dialog_id") REFERENCES "public"."game_dialogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_evaluations" ADD CONSTRAINT "game_evaluations_scorecard_id_game_scorecards_id_fk" FOREIGN KEY ("scorecard_id") REFERENCES "public"."game_scorecards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_dialog_id_game_dialogs_id_fk" FOREIGN KEY ("dialog_id") REFERENCES "public"."game_dialogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_facilitators" ADD CONSTRAINT "game_facilitators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_facilitators" ADD CONSTRAINT "game_facilitators_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_facilitators" ADD CONSTRAINT "game_facilitators_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_knowledge_chunks" ADD CONSTRAINT "game_knowledge_chunks_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_knowledge_chunks" ADD CONSTRAINT "game_knowledge_chunks_document_org_fk" FOREIGN KEY ("document_id","org_id") REFERENCES "public"."game_knowledge_documents"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_knowledge_documents" ADD CONSTRAINT "game_knowledge_documents_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_knowledge_documents" ADD CONSTRAINT "game_knowledge_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_knowledge_facts" ADD CONSTRAINT "game_knowledge_facts_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_knowledge_facts" ADD CONSTRAINT "game_knowledge_facts_document_org_fk" FOREIGN KEY ("document_id","org_id") REFERENCES "public"."game_knowledge_documents"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_knowledge_facts" ADD CONSTRAINT "game_knowledge_facts_chunk_document_fk" FOREIGN KEY ("chunk_id","document_id") REFERENCES "public"."game_knowledge_chunks"("id","document_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_knowledge_pending_uploads" ADD CONSTRAINT "game_knowledge_pending_uploads_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_knowledge_pending_uploads" ADD CONSTRAINT "game_knowledge_pending_uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_orders" ADD CONSTRAINT "game_orders_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_orders" ADD CONSTRAINT "game_orders_task_id_game_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."game_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_orders" ADD CONSTRAINT "game_orders_employee_id_game_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."game_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_org_members" ADD CONSTRAINT "game_org_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_org_members" ADD CONSTRAINT "game_org_members_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_organization_configure" ADD CONSTRAINT "game_organization_configure_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_product_events" ADD CONSTRAINT "game_product_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_product_events" ADD CONSTRAINT "game_product_events_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_roleplay_scenarios" ADD CONSTRAINT "game_roleplay_scenarios_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_roleplay_scenarios" ADD CONSTRAINT "game_roleplay_scenarios_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_roleplay_scenarios" ADD CONSTRAINT "game_roleplay_scenarios_base_employee_id_game_employees_id_fk" FOREIGN KEY ("base_employee_id") REFERENCES "public"."game_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_roleplay_scenarios" ADD CONSTRAINT "game_roleplay_scenarios_base_task_id_game_tasks_id_fk" FOREIGN KEY ("base_task_id") REFERENCES "public"."game_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_scorecards" ADD CONSTRAINT "game_scorecards_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_scorecards" ADD CONSTRAINT "game_scorecards_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_variant_id_game_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."game_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_training_assignment_id_game_training_assignments_id_fk" FOREIGN KEY ("training_assignment_id") REFERENCES "public"."game_training_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_coaching_path_assignment_id_game_coaching_path_assignments_id_fk" FOREIGN KEY ("coaching_path_assignment_id") REFERENCES "public"."game_coaching_path_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_scorecard_id_game_scorecards_id_fk" FOREIGN KEY ("scorecard_id") REFERENCES "public"."game_scorecards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_settings" ADD CONSTRAINT "game_settings_default_variant_id_game_variants_id_fk" FOREIGN KEY ("default_variant_id") REFERENCES "public"."game_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_training_assignments" ADD CONSTRAINT "game_training_assignments_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_training_assignments" ADD CONSTRAINT "game_training_assignments_participant_id_users_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_training_assignments" ADD CONSTRAINT "game_training_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_active_organizations_org_idx" ON "game_active_organizations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "game_benchmark_runs_created_idx" ON "game_benchmark_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "game_coaching_paths_org_idx" ON "game_coaching_paths" USING btree ("org_id","updated_at");--> statement-breakpoint
CREATE INDEX "game_coaching_path_assignments_org_idx" ON "game_coaching_path_assignments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "game_coaching_path_assignments_participant_idx" ON "game_coaching_path_assignments" USING btree ("participant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "game_coaching_path_assignments_active_idx" ON "game_coaching_path_assignments" USING btree ("path_id","participant_id") WHERE "game_coaching_path_assignments"."status" in ('assigned', 'in_progress');--> statement-breakpoint
CREATE INDEX "game_config_versions_created_idx" ON "game_config_versions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "game_dialogs_session_idx" ON "game_dialogs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "game_dialogs_variant_idx" ON "game_dialogs" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_evaluations_dialog_idx" ON "game_evaluations" USING btree ("dialog_id");--> statement-breakpoint
CREATE INDEX "game_evaluations_variant_idx" ON "game_evaluations" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_events_dialog_seq_idx" ON "game_events" USING btree ("dialog_id","seq");--> statement-breakpoint
CREATE INDEX "game_knowledge_chunks_document_idx" ON "game_knowledge_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "game_knowledge_chunks_org_audience_idx" ON "game_knowledge_chunks" USING btree ("org_id","audience");--> statement-breakpoint
CREATE INDEX "game_knowledge_documents_org_idx" ON "game_knowledge_documents" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "game_knowledge_facts_org_audience_idx" ON "game_knowledge_facts" USING btree ("org_id","audience");--> statement-breakpoint
CREATE INDEX "game_knowledge_facts_chunk_idx" ON "game_knowledge_facts" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "game_orders_session_idx" ON "game_orders" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "game_product_events_name_idx" ON "game_product_events" USING btree ("name");--> statement-breakpoint
CREATE INDEX "game_product_events_user_idx" ON "game_product_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "game_review_reports_created_idx" ON "game_review_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "game_review_reports_kind_idx" ON "game_review_reports" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "game_roleplay_scenarios_creator_idx" ON "game_roleplay_scenarios" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "game_roleplay_scenarios_org_idx" ON "game_roleplay_scenarios" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "game_scorecards_org_idx" ON "game_scorecards" USING btree ("org_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "game_scorecards_active_org_idx" ON "game_scorecards" USING btree ("org_id") WHERE "game_scorecards"."is_active" = true and "game_scorecards"."is_archived" = false;--> statement-breakpoint
CREATE INDEX "game_sessions_variant_idx" ON "game_sessions" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "game_sessions_org_idx" ON "game_sessions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "game_sessions_roleplay_scenario_idx" ON "game_sessions" USING btree ("roleplay_scenario_id");--> statement-breakpoint
CREATE INDEX "game_sessions_scorecard_idx" ON "game_sessions" USING btree ("scorecard_id");--> statement-breakpoint
CREATE INDEX "game_sessions_coaching_path_assignment_idx" ON "game_sessions" USING btree ("coaching_path_assignment_id");--> statement-breakpoint
CREATE INDEX "game_training_assignments_org_idx" ON "game_training_assignments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "game_training_assignments_participant_idx" ON "game_training_assignments" USING btree ("participant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "game_training_assignments_active_idx" ON "game_training_assignments" USING btree ("org_id","participant_id","criterion_id") WHERE "game_training_assignments"."status" in ('assigned', 'in_progress');