CREATE TABLE "app_admins" (
	"user_id" text PRIMARY KEY NOT NULL,
	"granted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
ALTER TABLE "app_admins" ADD CONSTRAINT "app_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_admins" ADD CONSTRAINT "app_admins_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_settings" ADD CONSTRAINT "game_settings_default_variant_id_game_variants_id_fk" FOREIGN KEY ("default_variant_id") REFERENCES "public"."game_variants"("id") ON DELETE set null ON UPDATE no action;