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
ALTER TABLE "game_sessions" ADD COLUMN "training_assignment_id" uuid;--> statement-breakpoint
ALTER TABLE "game_training_assignments" ADD CONSTRAINT "game_training_assignments_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_training_assignments" ADD CONSTRAINT "game_training_assignments_participant_id_users_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_training_assignments" ADD CONSTRAINT "game_training_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_training_assignments_org_idx" ON "game_training_assignments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "game_training_assignments_participant_idx" ON "game_training_assignments" USING btree ("participant_id","status");