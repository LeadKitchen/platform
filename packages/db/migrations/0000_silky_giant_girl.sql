CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
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
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"username" text,
	"bio" text,
	"language" text DEFAULT 'en',
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
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(256) NOT NULL,
	"round" integer NOT NULL,
	"variant_id" text,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
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
ALTER TABLE "game_dialogs" ADD CONSTRAINT "game_dialogs_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_dialogs" ADD CONSTRAINT "game_dialogs_order_id_game_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."game_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_dialogs" ADD CONSTRAINT "game_dialogs_employee_id_game_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."game_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_dialogs" ADD CONSTRAINT "game_dialogs_task_id_game_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."game_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_evaluations" ADD CONSTRAINT "game_evaluations_dialog_id_game_dialogs_id_fk" FOREIGN KEY ("dialog_id") REFERENCES "public"."game_dialogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_dialog_id_game_dialogs_id_fk" FOREIGN KEY ("dialog_id") REFERENCES "public"."game_dialogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_orders" ADD CONSTRAINT "game_orders_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_orders" ADD CONSTRAINT "game_orders_task_id_game_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."game_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_orders" ADD CONSTRAINT "game_orders_employee_id_game_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."game_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_variant_id_game_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."game_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_dialogs_session_idx" ON "game_dialogs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "game_dialogs_variant_idx" ON "game_dialogs" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_evaluations_dialog_idx" ON "game_evaluations" USING btree ("dialog_id");--> statement-breakpoint
CREATE INDEX "game_evaluations_variant_idx" ON "game_evaluations" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_events_dialog_seq_idx" ON "game_events" USING btree ("dialog_id","seq");--> statement-breakpoint
CREATE INDEX "game_orders_session_idx" ON "game_orders" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "game_sessions_variant_idx" ON "game_sessions" USING btree ("variant_id");