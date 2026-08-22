import {
  asc,
  count,
  desc,
  eq,
  GameDialog,
  GameOrder,
  GameSession,
  GameVariant,
} from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { adminProcedure } from "../../../orpc";

export const list = adminProcedure
  .input(
    z.object({
      limit: z.number().int().min(1).max(200).default(100),
      offset: z.number().int().min(0).default(0),
    }),
  )
  .handler(async ({ context, input }) => {
    const sessions = await context.db
      .select({ session: GameSession, variantName: GameVariant.name })
      .from(GameSession)
      .leftJoin(GameVariant, eq(GameVariant.id, GameSession.variantId))
      .orderBy(desc(GameSession.createdAt))
      .limit(input.limit)
      .offset(input.offset);

    const [orderCounts, dialogCounts] = await Promise.all([
      context.db
        .select({ sessionId: GameOrder.sessionId, count: count() })
        .from(GameOrder)
        .groupBy(GameOrder.sessionId)
        .orderBy(asc(GameOrder.sessionId)),
      context.db
        .select({ sessionId: GameDialog.sessionId, count: count() })
        .from(GameDialog)
        .groupBy(GameDialog.sessionId)
        .orderBy(asc(GameDialog.sessionId)),
    ]);

    const ordersBySession = new Map(
      orderCounts.map((item) => [item.sessionId, item.count]),
    );
    const dialogsBySession = new Map(
      dialogCounts.map((item) => [item.sessionId, item.count]),
    );

    return sessions.map((item) => ({
      ...item,
      orders: ordersBySession.get(item.session.id) ?? 0,
      dialogs: dialogsBySession.get(item.session.id) ?? 0,
    }));
  });

export const setStatus = adminProcedure
  .input(
    z.object({
      id: z.string().uuid(),
      status: z.enum(["active", "completed", "archived"]),
    }),
  )
  .handler(async ({ context, input }) => {
    const [session] = await context.db
      .update(GameSession)
      .set({
        status: input.status,
        endedAt: input.status === "active" ? null : new Date(),
      })
      .where(eq(GameSession.id, input.id))
      .returning();
    if (!session) {
      throw new ORPCError("NOT_FOUND", { message: "Сессия не найдена" });
    }
    return session;
  });

export const adminGameSessionsRouter = { list, setStatus };
