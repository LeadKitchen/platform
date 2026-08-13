import { desc, GameProductEvent } from "@acme/db";
import { z } from "zod";

import { facilitatorProcedure } from "../../../orpc";

export const productAnalytics = facilitatorProcedure
  .input(z.object({ limit: z.number().int().min(1).max(20000).default(10000) }))
  .handler(async ({ context, input }) => {
    const rows = await context.db
      .select()
      .from(GameProductEvent)
      .orderBy(desc(GameProductEvent.createdAt))
      .limit(input.limit);
    const counts: Record<string, number> = {};
    const users = new Map<string, Set<string>>();
    for (const row of rows) {
      counts[row.name] = (counts[row.name] ?? 0) + 1;
      if (row.userId) {
        const set = users.get(row.name) ?? new Set<string>();
        set.add(row.userId);
        users.set(row.name, set);
      }
    }
    const uniqueUsers = Object.fromEntries(
      [...users.entries()].map(([name, set]) => [name, set.size]),
    );
    const startedUsers = users.get("dialog_started") ?? new Set<string>();
    const completedUsers = users.get("dialog_completed") ?? new Set<string>();
    const intersectionSize = (left: Set<string>, right: Set<string>) =>
      [...left].filter((userId) => right.has(userId)).length;
    const started = startedUsers.size;
    const completed = completedUsers.size;
    return {
      events: rows.length,
      counts,
      uniqueUsers,
      dialogCompletionRate:
        started === 0
          ? 0
          : intersectionSize(startedUsers, completedUsers) / started,
      voiceAdoptionRate:
        started === 0
          ? 0
          : intersectionSize(
              startedUsers,
              users.get("voice_used") ?? new Set<string>(),
            ) / started,
      replayRate:
        completed === 0
          ? 0
          : intersectionSize(
              completedUsers,
              users.get("situation_replayed") ?? new Set<string>(),
            ) / completed,
    };
  });
