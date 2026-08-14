import { desc, GameBenchmarkRun } from "@acme/db";
import { z } from "zod";

import { methodologistProcedure } from "../../../orpc";

/**
 * Published offline benchmark runs (`@acme/eval`'s harness).
 *
 * Read-only by design: a run is produced and vetted offline (see
 * `packages/eval/publish-report.ts`), then published here for a customer to
 * study without shell access. The API never recomputes or edits a result —
 * `result` is the harness's own `RunResult`, so what the customer sees is
 * exactly what the harness measured.
 *
 * @example client.admin.game.benchmarks.list({ limit: 10 })
 */
export const list = methodologistProcedure
  .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
  .handler(async ({ context, input }) =>
    context.db
      .select()
      .from(GameBenchmarkRun)
      .orderBy(desc(GameBenchmarkRun.createdAt))
      .limit(input.limit),
  );

export const adminGameBenchmarksRouter = { list };
