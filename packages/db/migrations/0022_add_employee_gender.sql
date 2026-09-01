-- Backfills the 5 built-in catalog employees (see packages/game/src/catalog.ts);
-- `bun run db:seed` corrects them again on next run regardless. Any custom
-- employee created before this migration (via the admin catalog or the LLM
-- character studio) has no gender on record and is defaulted to 'female' —
-- review and correct those in the admin catalog's new "Голос (пол)" field.
ALTER TABLE "game_employees" ADD COLUMN "gender" varchar(8) DEFAULT 'female' NOT NULL;--> statement-breakpoint
UPDATE "game_employees" SET "gender" = 'male' WHERE "id" IN ('igor', 'timur');
