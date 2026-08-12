import { count, desc, eq, GameOrder, GameSession } from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { loadEngine } from "../../game/service";
import { loadGameSettings } from "../../game/settings";
import { protectedProcedure } from "../../orpc";

const roundSchema = z.union([z.literal(2), z.literal(3)]);

/**
 * Open a game session for a team.
 *
 * The variant is fixed for the whole session so a team is never scored by two
 * different approaches mid-game; leaving it empty picks the configured
 * default.
 *
 * @example client.game.session.create({ title: "Смена 1", round: 2 })
 */
export const create = protectedProcedure
  .input(
    z.object({
      title: z.string().min(1).max(256),
      round: roundSchema.optional(),
      variantId: z.string().max(64).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const [engine, settings] = await Promise.all([
      loadEngine(context.db),
      loadGameSettings(context.db),
    ]);
    const round = input.round ?? settings.defaultRound;
    if (round === 3 && !settings.allowRoundThree) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Третий раунд отключён администратором",
      });
    }

    const [activeSessions] = await context.db
      .select({ count: count() })
      .from(GameSession)
      .where(eq(GameSession.status, "active"));
    if ((activeSessions?.count ?? 0) >= settings.maxActiveSessions) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Достигнут лимит активных сессий: ${settings.maxActiveSessions}`,
      });
    }

    const variantId =
      input.variantId ?? settings.defaultVariantId ?? engine.defaultVariantId;

    // Fail here rather than at the first utterance of the first dialog.
    engine.pipeline(variantId);

    const [session] = await context.db
      .insert(GameSession)
      .values({
        title: input.title,
        round,
        variantId,
        createdBy: context.session.user.id,
      })
      .returning();

    return session;
  });

/**
 * List sessions, newest first.
 *
 * @example client.game.session.list({ limit: 20 })
 */
export const list = protectedProcedure
  .input(
    z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }),
  )
  .handler(async ({ context, input }) =>
    context.db
      .select()
      .from(GameSession)
      .orderBy(desc(GameSession.createdAt))
      .limit(input.limit)
      .offset(input.offset),
  );

/**
 * A session with its order queue.
 *
 * @example client.game.session.byId({ id })
 */
export const byId = protectedProcedure
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const [session] = await context.db
      .select()
      .from(GameSession)
      .where(eq(GameSession.id, input.id))
      .limit(1);

    if (!session) {
      throw new ORPCError("NOT_FOUND", { message: "Сессия не найдена" });
    }

    const orders = await context.db
      .select()
      .from(GameOrder)
      .where(eq(GameOrder.sessionId, session.id))
      .orderBy(desc(GameOrder.createdAt));

    return { session, orders };
  });

/**
 * Close a session.
 *
 * @example client.game.session.end({ id })
 */
export const end = protectedProcedure
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const [session] = await context.db
      .update(GameSession)
      .set({ status: "completed", endedAt: new Date() })
      .where(eq(GameSession.id, input.id))
      .returning();

    if (!session) {
      throw new ORPCError("NOT_FOUND", { message: "Сессия не найдена" });
    }
    return session;
  });

export const gameSessionRouter = { create, list, byId, end };
