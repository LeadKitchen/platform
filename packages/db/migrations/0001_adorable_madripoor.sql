CREATE TABLE "game_skill_policy" (
	"key" text PRIMARY KEY NOT NULL,
	"value" double precision NOT NULL,
	"count" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
