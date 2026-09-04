import { hatchet } from "../hatchet-client";

/**
 * Cron-triggered task — runs every hour at :00.
 *
 * The schedule is declared directly in code via `onCrons`. Update the
 * expression and redeploy the worker to change it — no dashboard
 * configuration needed.
 *
 * Common cron patterns:
 * - Every hour:        "0 * * * *"
 * - Every day at 9am:  "0 9 * * *"
 * - Every Mon at 8am:  "0 8 * * 1"
 *
 * @see https://docs.hatchet.run/home/cron-runs
 */
export const scheduledTask = hatchet.task({
  name: "scheduled-example",
  onCrons: ["0 * * * *"],
  retries: 2,
  executionTimeout: "120s",
  fn: async () => {
    // Place your periodic logic here:
    // - clean up stale records
    // - send digest emails
    // - sync with external APIs

    return {
      processedAt: new Date().toISOString(),
      status: "ok" as const,
    };
  },
});
