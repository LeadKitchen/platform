CREATE TABLE "game_facilitators" (
	"user_id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"granted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_org_members" (
	"user_id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "game_facilitators" ADD CONSTRAINT "game_facilitators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_facilitators" ADD CONSTRAINT "game_facilitators_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_facilitators" ADD CONSTRAINT "game_facilitators_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_org_members" ADD CONSTRAINT "game_org_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_org_members" ADD CONSTRAINT "game_org_members_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_org_id_game_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."game_organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_sessions_org_idx" ON "game_sessions" USING btree ("org_id");