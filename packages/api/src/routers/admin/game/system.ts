import {
  count,
  eq,
  GameDialog,
  GameEmployee,
  GameEvaluation,
  GameSession,
  GameSettings,
  GameTask,
  GameVariant,
} from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { loadGameSettings } from "../../../game/settings";
import { adminProcedure } from "../../../orpc";

export const overview = adminProcedure.handler(async ({ context }) => {
  const [sessions, dialogs, evaluations, employees, tasks, variants, settings] =
    await Promise.all([
      context.db.select({ count: count() }).from(GameSession),
      context.db.select({ count: count() }).from(GameDialog),
      context.db.select({ count: count() }).from(GameEvaluation),
      context.db.select({ count: count() }).from(GameEmployee),
      context.db.select({ count: count() }).from(GameTask),
      context.db.select({ count: count() }).from(GameVariant),
      loadGameSettings(context.db),
    ]);

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  return {
    counts: {
      sessions: sessions[0]?.count ?? 0,
      dialogs: dialogs[0]?.count ?? 0,
      evaluations: evaluations[0]?.count ?? 0,
      employees: employees[0]?.count ?? 0,
      tasks: tasks[0]?.count ?? 0,
      variants: variants[0]?.count ?? 0,
    },
    runtime: {
      provider: process.env.AI_PROVIDER ?? "auto",
      model: process.env.AI_MODEL ?? process.env.OPENAI_MODEL ?? "по умолчанию",
      defaultVariant: process.env.AI_DEFAULT_VARIANT ?? "baseline",
      databaseDriver: process.env.DB_DRIVER ?? "auto",
      adminEmails,
      appEnvironment: process.env.NODE_ENV ?? "development",
    },
    settings,
  };
});

export const updateSettings = adminProcedure
  .input(
    z.object({
      defaultVariantId: z.string().min(1).max(64).nullable(),
      defaultRound: z.union([z.literal(2), z.literal(3)]),
      defaultDeadlineMinutes: z.number().int().min(5).max(600),
      allowRoundThree: z.boolean(),
      maxActiveSessions: z.number().int().min(1).max(100),
    }),
  )
  .handler(async ({ context, input }) => {
    if (input.defaultRound === 3 && !input.allowRoundThree) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Раунд по умолчанию не может быть отключён",
      });
    }

    if (input.defaultVariantId) {
      const [variant] = await context.db
        .select({ id: GameVariant.id, isActive: GameVariant.isActive })
        .from(GameVariant)
        .where(eq(GameVariant.id, input.defaultVariantId))
        .limit(1);
      if (!variant?.isActive) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Вариант по умолчанию должен быть активным",
        });
      }
    }

    const [settings] = await context.db
      .insert(GameSettings)
      .values({ id: "global", ...input })
      .onConflictDoUpdate({ target: GameSettings.id, set: input })
      .returning();

    if (!settings) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Не удалось сохранить настройки",
      });
    }
    return settings;
  });

export const adminGameSystemRouter = { overview, updateSettings };
