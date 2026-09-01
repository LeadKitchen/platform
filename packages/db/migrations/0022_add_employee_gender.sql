ALTER TABLE "game_employees" ADD COLUMN "gender" varchar(8) DEFAULT 'female' NOT NULL;--> statement-breakpoint
UPDATE "game_employees" SET "gender" = 'male' WHERE "id" IN ('igor', 'timur');
