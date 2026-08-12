import {
  count,
  GameDialog,
  GameEmployee,
  GameEvaluation,
  GameSession,
  GameTask,
  GameVariant,
} from "@acme/db";

import { adminProcedure } from "../../../orpc";

export const overview = adminProcedure.handler(async ({ context }) => {
  const [sessions, dialogs, evaluations, employees, tasks, variants] =
    await Promise.all([
      context.db.select({ count: count() }).from(GameSession),
      context.db.select({ count: count() }).from(GameDialog),
      context.db.select({ count: count() }).from(GameEvaluation),
      context.db.select({ count: count() }).from(GameEmployee),
      context.db.select({ count: count() }).from(GameTask),
      context.db.select({ count: count() }).from(GameVariant),
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
  };
});

export const adminGameSystemRouter = { overview };
