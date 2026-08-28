WITH "ranked_assignments" AS (
	SELECT
		"id",
		FIRST_VALUE("id") OVER (
			PARTITION BY "org_id", "participant_id", "criterion_id"
			ORDER BY
				CASE WHEN "status" = 'in_progress' THEN 0 ELSE 1 END,
				"started_at" ASC NULLS LAST,
				"created_at" ASC,
				"id" ASC
		) AS "keeper_id",
		ROW_NUMBER() OVER (
			PARTITION BY "org_id", "participant_id", "criterion_id"
			ORDER BY
				CASE WHEN "status" = 'in_progress' THEN 0 ELSE 1 END,
				"started_at" ASC NULLS LAST,
				"created_at" ASC,
				"id" ASC
		) AS "row_number"
	FROM "game_training_assignments"
	WHERE "status" IN ('assigned', 'in_progress')
)
UPDATE "game_sessions"
SET "training_assignment_id" = "ranked_assignments"."keeper_id"
FROM "ranked_assignments"
WHERE "ranked_assignments"."row_number" > 1
	AND "game_sessions"."training_assignment_id" = "ranked_assignments"."id";
--> statement-breakpoint
WITH "ranked_assignments" AS (
	SELECT
		"id",
		ROW_NUMBER() OVER (
			PARTITION BY "org_id", "participant_id", "criterion_id"
			ORDER BY
				CASE WHEN "status" = 'in_progress' THEN 0 ELSE 1 END,
				"started_at" ASC NULLS LAST,
				"created_at" ASC,
				"id" ASC
		) AS "row_number"
	FROM "game_training_assignments"
	WHERE "status" IN ('assigned', 'in_progress')
)
DELETE FROM "game_training_assignments"
USING "ranked_assignments"
WHERE "ranked_assignments"."row_number" > 1
	AND "game_training_assignments"."id" = "ranked_assignments"."id";
--> statement-breakpoint
CREATE UNIQUE INDEX "game_training_assignments_active_idx" ON "game_training_assignments" USING btree ("org_id","participant_id","criterion_id") WHERE "game_training_assignments"."status" in ('assigned', 'in_progress');
