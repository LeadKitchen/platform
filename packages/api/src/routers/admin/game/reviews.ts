import { desc, GameReviewReport } from "@acme/db";
import { z } from "zod";

import { adminProcedure } from "../../../orpc";

/**
 * Published review reports of external/reference implementations.
 *
 * Read-only by design, same reasoning as `benchmarks`: a report is written
 * offline (see `scripts/publish-review.ts`), then published here so it can be
 * studied in the admin panel without shell access to the analysis machine.
 *
 * @example client.admin.game.reviews.list({ limit: 10 })
 */
export const list = adminProcedure
  .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
  .handler(async ({ context, input }) =>
    context.db
      .select()
      .from(GameReviewReport)
      .orderBy(desc(GameReviewReport.createdAt))
      .limit(input.limit),
  );

export const adminGameReviewsRouter = { list };
