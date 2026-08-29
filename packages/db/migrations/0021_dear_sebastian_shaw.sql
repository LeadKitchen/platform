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
ALTER TABLE "game_sessions" ADD COLUMN "coaching_path_assignment_id" uuid;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "coaching_path_step_id" text;--> statement-breakpoint
ALTER TABLE "game_coaching_paths" ADD CONSTRAINT "game_coaching_paths_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_coaching_paths" ADD CONSTRAINT "game_coaching_paths_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_coaching_path_assignments" ADD CONSTRAINT "game_coaching_path_assignments_path_id_game_coaching_paths_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."game_coaching_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_coaching_path_assignments" ADD CONSTRAINT "game_coaching_path_assignments_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_coaching_path_assignments" ADD CONSTRAINT "game_coaching_path_assignments_participant_id_users_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_coaching_path_assignments" ADD CONSTRAINT "game_coaching_path_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_coaching_paths_org_idx" ON "game_coaching_paths" USING btree ("org_id","updated_at");--> statement-breakpoint
CREATE INDEX "game_coaching_path_assignments_org_idx" ON "game_coaching_path_assignments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "game_coaching_path_assignments_participant_idx" ON "game_coaching_path_assignments" USING btree ("participant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "game_coaching_path_assignments_active_idx" ON "game_coaching_path_assignments" USING btree ("path_id","participant_id") WHERE "game_coaching_path_assignments"."status" in ('assigned', 'in_progress');--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_coaching_path_assignment_id_game_coaching_path_assignments_id_fk" FOREIGN KEY ("coaching_path_assignment_id") REFERENCES "public"."game_coaching_path_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_sessions_coaching_path_assignment_idx" ON "game_sessions" USING btree ("coaching_path_assignment_id");