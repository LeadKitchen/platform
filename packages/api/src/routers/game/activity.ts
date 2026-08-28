import {
  and,
  desc,
  eq,
  GameDialog,
  GameEvaluation,
  GameProductEvent,
  GameSession,
  inArray,
} from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { requireOwnedDialog } from "../../game/access";
import { protectedProcedure } from "../../orpc";

const publicProductEvent = z.discriminatedUnion("name", [
  z.object({
    name: z.literal("warmup_started"),
    properties: z.object({}).default({}),
  }),
  z.object({
    name: z.literal("warmup_completed"),
    properties: z.object({
      score: z.number().int().min(0).max(100),
      total: z.number().int().min(1).max(100),
    }),
  }),
  z.object({
    name: z.literal("voice_used"),
    dialogId: z.uuid(),
    properties: z.object({}).default({}),
  }),
  z.object({
    name: z.literal("evaluation_viewed"),
    dialogId: z.uuid(),
    properties: z.object({}).default({}),
  }),
]);

export const track = protectedProcedure
  .input(publicProductEvent)
  .handler(async ({ context, input }) => {
    const owned =
      "dialogId" in input
        ? await requireOwnedDialog(
            context.db,
            input.dialogId,
            context.session.user.id,
          )
        : null;
    if (input.name === "evaluation_viewed") {
      const [evaluation] = await context.db
        .select({ dialogId: GameEvaluation.dialogId })
        .from(GameEvaluation)
        .where(eq(GameEvaluation.dialogId, input.dialogId))
        .limit(1);
      if (!evaluation) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Разбор ещё не сформирован",
        });
      }
    }
    const [event] = await context.db
      .insert(GameProductEvent)
      .values({
        userId: context.session.user.id,
        sessionId: owned?.session.id,
        dialogId: "dialogId" in input ? input.dialogId : undefined,
        name: input.name,
        properties: input.properties,
      })
      .returning({ id: GameProductEvent.id });
    return event;
  });

export const progress = protectedProcedure.handler(async ({ context }) => {
  const [rows, productEvents] = await Promise.all([
    context.db
      .select({
        dialogId: GameDialog.id,
        scorePercent: GameEvaluation.scorePercent,
        criteria: GameEvaluation.criteria,
        expectedStyle: GameEvaluation.expectedStyle,
        actualStyle: GameEvaluation.actualStyle,
        createdAt: GameEvaluation.createdAt,
      })
      .from(GameEvaluation)
      .innerJoin(GameDialog, eq(GameDialog.id, GameEvaluation.dialogId))
      .innerJoin(GameSession, eq(GameSession.id, GameDialog.sessionId))
      .where(eq(GameSession.createdBy, context.session.user.id))
      .orderBy(desc(GameEvaluation.createdAt))
      .limit(100),
    context.db
      .select({ name: GameProductEvent.name })
      .from(GameProductEvent)
      .where(
        and(
          eq(GameProductEvent.userId, context.session.user.id),
          inArray(GameProductEvent.name, [
            "warmup_completed",
            "evaluation_viewed",
          ]),
        ),
      )
      .groupBy(GameProductEvent.name),
  ]);

  const criteria = new Map<
    string,
    { title: string; met: number; total: number }
  >();
  for (const row of rows) {
    for (const item of row.criteria as Array<{
      id: string;
      title: string;
      met: boolean;
    }>) {
      const current = criteria.get(item.id) ?? {
        title: item.title,
        met: 0,
        total: 0,
      };
      current.total += 1;
      if (item.met) current.met += 1;
      criteria.set(item.id, current);
    }
  }

  const chronological = [...rows].reverse();
  const first = chronological.slice(0, Math.min(3, chronological.length));
  const latest = rows.slice(0, Math.min(3, rows.length));
  const dayKey = (date: Date) => date.toISOString().slice(0, 10);
  const dailyActivity = new Map<string, number>();
  const dailyScores = new Map<string, { count: number; total: number }>();
  const today = new Date();
  for (let offset = 27; offset >= 0; offset--) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - offset);
    dailyActivity.set(dayKey(date), 0);
  }
  for (const row of rows) {
    const key = dayKey(row.createdAt);
    if (dailyActivity.has(key)) {
      dailyActivity.set(key, (dailyActivity.get(key) ?? 0) + 1);
      const scores = dailyScores.get(key) ?? { count: 0, total: 0 };
      scores.count += 1;
      scores.total += row.scorePercent;
      dailyScores.set(key, scores);
    }
  }
  const average = (items: typeof rows) =>
    items.length === 0
      ? 0
      : Math.round(
          items.reduce((sum, item) => sum + item.scorePercent, 0) /
            items.length,
        );

  return {
    onboarding: {
      warmupCompleted: productEvents.some(
        (event) => event.name === "warmup_completed",
      ),
      evaluationViewed: productEvents.some(
        (event) => event.name === "evaluation_viewed",
      ),
    },
    dialogs: rows.length,
    averageScore: average(rows),
    recentScore: average(latest),
    improvement: average(latest) - average(first),
    styleMatchRate:
      rows.length === 0
        ? 0
        : Math.round(
            (rows.filter((row) => row.actualStyle === row.expectedStyle)
              .length /
              rows.length) *
              100,
          ),
    activeDays: [...dailyActivity.values()].filter((count) => count > 0).length,
    dailyActivity: [...dailyActivity.entries()].map(([date, dialogs]) => ({
      date,
      dialogs,
    })),
    scoreTrend: [...dailyScores.entries()].map(([date, scores]) => ({
      date,
      score: Math.round(scores.total / scores.count),
    })),
    criteria: [...criteria.entries()]
      .map(([id, item]) => ({
        id,
        title: item.title,
        rate: item.total === 0 ? 0 : item.met / item.total,
      }))
      .sort((a, b) => a.rate - b.rate),
    recent: rows.slice(0, 10),
  };
});

export const gameActivityRouter = { track, progress };
