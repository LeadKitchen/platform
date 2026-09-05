import { desc, eq, GameReviewReport } from "@acme/db";
import { z } from "zod";

import { adminProcedure } from "../../../orpc";

/**
 * Published technical review reports of the legacy implementation
 * (`sitruk_review`), filtered to `kind: "legacy-review"`.
 *
 * Read-only by design, same reasoning as `benchmarks`: a report is written
 * offline (see `scripts/publish-review.ts`), then published here so it can be
 * studied in the admin panel without shell access to the analysis machine.
 * Shares `game_review_reports` with `comparisons` — see that router for why.
 *
 * @example client.admin.game.reviews.list({ limit: 10 })
 */
export const list = adminProcedure
  .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
  .handler(async ({ context, input }) =>
    context.db
      .select()
      .from(GameReviewReport)
      .where(eq(GameReviewReport.kind, "legacy-review"))
      .orderBy(desc(GameReviewReport.createdAt))
      .limit(input.limit),
  );

export const adminGameReviewsRouter = { list };
