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
ALTER TABLE "game_evaluations" ADD COLUMN "scorecard_id" uuid;--> statement-breakpoint
ALTER TABLE "game_evaluations" ADD COLUMN "scorecard_name" varchar(160);--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "scorecard_id" uuid;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "scorecard_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "game_scorecards" ADD CONSTRAINT "game_scorecards_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_scorecards" ADD CONSTRAINT "game_scorecards_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_scorecards_org_idx" ON "game_scorecards" USING btree ("org_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "game_scorecards_active_org_idx" ON "game_scorecards" USING btree ("org_id") WHERE "game_scorecards"."is_active" = true and "game_scorecards"."is_archived" = false;--> statement-breakpoint
CREATE INDEX "game_sessions_scorecard_idx" ON "game_sessions" USING btree ("scorecard_id");