CREATE TABLE "game_benchmark_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" varchar(128) NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "game_benchmark_runs_created_idx" ON "game_benchmark_runs" USING btree ("created_at");