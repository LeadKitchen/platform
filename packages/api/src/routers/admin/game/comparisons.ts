import { desc, eq, GameReviewReport } from "@acme/db";
import { z } from "zod";

import { adminProcedure } from "../../../orpc";

/**
 * Published side-by-side comparison reports (legacy implementation vs the
 * Sitruk architecture), filtered to `kind: "comparison"`.
 *
 * Shares `game_review_reports` with `reviews` — a comparison report is
 * editorially a different document (synthesises findings into one
 * client-facing read, always paired with a fresh LLM evaluation of the
 * legacy side), but technically the same shape, so splitting it into its
 * own table would just duplicate the publish/list/render stack.
 *
 * @example client.admin.game.comparisons.list({ limit: 10 })
 */
export const list = adminProcedure
  .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
  .handler(async ({ context, input }) =>
    context.db
      .select()
      .from(GameReviewReport)
      .where(eq(GameReviewReport.kind, "comparison"))
      .orderBy(desc(GameReviewReport.createdAt))
      .limit(input.limit),
  );

export const adminGameComparisonsRouter = { list };
