import { schedules } from "@trigger.dev/sdk";

/**
 * Cron-triggered task — runs every hour at :00.
 *
 * The schedule is declared directly in code via `cron`. Update the
 * expression and redeploy to change it — no dashboard configuration needed.
 *
 * Common cron patterns:
 * - Every hour:        "0 * * * *"
 * - Every day at 9am:  "0 9 * * *"
 * - Every Mon at 8am:  "0 8 * * 1"
 *
 * @see https://trigger.dev/docs/tasks/scheduled
 */
export const scheduledTask = schedules.task({
  id: "scheduled-example",
  cron: "0 * * * *",
  retry: { maxAttempts: 2 },
  maxDuration: 120,
  run: async () => {
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
