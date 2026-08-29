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
ALTER TABLE "game_sessions" ADD COLUMN "roleplay_scenario_id" text;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "roleplay_mode" varchar(32);--> statement-breakpoint
ALTER TABLE "game_roleplay_scenarios" ADD CONSTRAINT "game_roleplay_scenarios_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_roleplay_scenarios" ADD CONSTRAINT "game_roleplay_scenarios_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_roleplay_scenarios" ADD CONSTRAINT "game_roleplay_scenarios_base_employee_id_game_employees_id_fk" FOREIGN KEY ("base_employee_id") REFERENCES "public"."game_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_roleplay_scenarios" ADD CONSTRAINT "game_roleplay_scenarios_base_task_id_game_tasks_id_fk" FOREIGN KEY ("base_task_id") REFERENCES "public"."game_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_roleplay_scenarios_creator_idx" ON "game_roleplay_scenarios" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "game_roleplay_scenarios_org_idx" ON "game_roleplay_scenarios" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "game_sessions_roleplay_scenario_idx" ON "game_sessions" USING btree ("roleplay_scenario_id");