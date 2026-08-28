CREATE TABLE "game_organization_configure" (
	"org_id" text PRIMARY KEY NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scorecard" jsonb DEFAULT '{"name":"Общая рубрика","criterionIds":[]}'::jsonb NOT NULL,
	"automation" jsonb DEFAULT '{"enabled":false,"threshold":60}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_organizations" ADD COLUMN "description" varchar(256) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "game_organization_configure" ADD CONSTRAINT "game_organization_configure_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;