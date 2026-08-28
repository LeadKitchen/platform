CREATE TABLE "game_active_organizations" (
	"user_id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_facilitators" DROP CONSTRAINT "game_facilitators_pkey";--> statement-breakpoint
ALTER TABLE "game_org_members" DROP CONSTRAINT "game_org_members_pkey";--> statement-breakpoint
ALTER TABLE "game_facilitators" ADD CONSTRAINT "game_facilitators_user_id_org_id_pk" PRIMARY KEY("user_id","org_id");--> statement-breakpoint
ALTER TABLE "game_org_members" ADD CONSTRAINT "game_org_members_user_id_org_id_pk" PRIMARY KEY("user_id","org_id");--> statement-breakpoint
ALTER TABLE "game_active_organizations" ADD CONSTRAINT "game_active_organizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_active_organizations" ADD CONSTRAINT "game_active_organizations_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_active_organizations_org_idx" ON "game_active_organizations" USING btree ("org_id");--> statement-breakpoint
INSERT INTO "game_active_organizations" ("user_id", "org_id")
SELECT "user_id", "org_id"
FROM "game_org_members"
ON CONFLICT ("user_id") DO NOTHING;
