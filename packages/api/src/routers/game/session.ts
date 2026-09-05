import {
  and,
  count,
  desc,
  eq,
  GameOrder,
  GameProductEvent,
  GameSession,
  GameTrainingAssignment,
} from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { requireOwnedSession } from "../../game/access";
import { getMemberOrgId } from "../../game/organizations";
import { getActiveScorecardSnapshot } from "../../game/scorecards";
import { loadEngine, resolveLiveVariantId } from "../../game/service";
import { loadGameSettings } from "../../game/settings";
import { protectedProcedure } from "../../orpc";

const roundSchema = z.union([z.literal(2), z.literal(3)]);

/**
 * Open a game session for a team.
 *
 * The variant is fixed for the whole session so a team is never scored by two
 * different approaches mid-game. Which variant that is comes only from admin
 * choice — the configured default in game settings, or the engine's built-in
 * fallback — never from a random split.
 *
 * @example client.game.session.create({ title: "Смена 1", round: 2 })
 */
export const create = protectedProcedure
  .input(
    z.object({
      title: z.string().min(1).max(256),
      round: roundSchema.optional(),
      assignmentId: z.uuid().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const [engine, settings, orgId] = await Promise.all([
      loadEngine(context.db),
      loadGameSettings(context.db),
      getMemberOrgId(context.db, context.session.user.id),
    ]);
    const round = input.round ?? settings.defaultRound;
    const scorecard = await getActiveScorecardSnapshot(context.db, orgId);
    if (round === 3 && !settings.allowRoundThree) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Третий раунд отключён администратором",
      });
    }

    const [assignment] = input.assignmentId
      ? await context.db
          .select()
          .from(GameTrainingAssignment)
          .where(
            and(
              eq(GameTrainingAssignment.id, input.assignmentId),
              eq(GameTrainingAssignment.participantId, context.session.user.id),
              eq(GameTrainingAssignment.status, "assigned"),
            ),
          )
          .limit(1)
      : [undefined];
    if (input.assignmentId && !assignment) {
      throw new ORPCError("NOT_FOUND", {
        message: "Назначенная практика больше недоступна",
      });
    }
    if (assignment && assignment.orgId !== orgId) {
      throw new ORPCError("FORBIDDEN", {
        message: "Назначенная практика относится к другой организации",
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

    const variantId = settings.defaultVariantId ?? engine.defaultVariantId;

    // Fail here rather than at the first utterance of the first dialog.
    engine.pipeline(variantId);

    return context.db.transaction(async (tx) => {
      const liveVariantId = await resolveLiveVariantId(
        tx,
        variantId,
        engine.defaultVariantId,
      );
      const [session] = await tx
        .insert(GameSession)
        .values({
          title: input.title,
          round,
          variantId: liveVariantId,
          createdBy: context.session.user.id,
          orgId,
          trainingAssignmentId: assignment?.id,
          scorecardId: scorecard?.id,
          scorecardSnapshot: scorecard ?? undefined,
        })
        .returning();
      if (!session) throw new Error("Не удалось создать сессию");
      if (assignment) {
        const [started] = await tx
          .update(GameTrainingAssignment)
          .set({ status: "in_progress", startedAt: new Date() })
          .where(
            and(
              eq(GameTrainingAssignment.id, assignment.id),
              eq(GameTrainingAssignment.status, "assigned"),
            ),
          )
          .returning({ id: GameTrainingAssignment.id });
        if (!started) {
          throw new ORPCError("CONFLICT", {
            message: "Практика уже начата в другой сессии",
          });
        }
      }
      await tx.insert(GameProductEvent).values({
        userId: context.session.user.id,
        sessionId: session.id,
        name: "session_created",
        properties: { round: session.round },
      });
      return session;
    });
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
      .where(eq(GameSession.createdBy, context.session.user.id))
      .orderBy(desc(GameSession.createdAt))
      .limit(input.limit)
      .offset(input.offset),
  );

/** The current participant's session for an assigned practice. */
export const byAssignment = protectedProcedure
  .input(z.object({ assignmentId: z.uuid() }))
  .handler(async ({ context, input }) => {
    const [session] = await context.db
      .select()
      .from(GameSession)
      .where(
        and(
          eq(GameSession.trainingAssignmentId, input.assignmentId),
          eq(GameSession.createdBy, context.session.user.id),
        ),
      )
      .orderBy(desc(GameSession.createdAt))
      .limit(1);
    return session;
  });

/**
 * A session with its order queue.
 *
 * @example client.game.session.byId({ id })
 */
export const byId = protectedProcedure
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const session = await requireOwnedSession(
      context.db,
      input.id,
      context.session.user.id,
    );

    const [orders, engine] = await Promise.all([
      context.db
        .select()
        .from(GameOrder)
        .where(eq(GameOrder.sessionId, session.id))
        .orderBy(desc(GameOrder.createdAt)),
      loadEngine(context.db),
    ]);
    const variantName =
      engine.variants().find((item) => item.id === session.variantId)?.name ??
      session.variantId;

    return { session, orders, variantName };
  });

/**
 * Close a session.
 *
 * @example client.game.session.end({ id })
 */
export const end = protectedProcedure
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) =>
    context.db.transaction(async (tx) => {
      const [session] = await tx
        .update(GameSession)
        .set({ status: "completed", endedAt: new Date() })
        .where(
          and(
            eq(GameSession.id, input.id),
            eq(GameSession.createdBy, context.session.user.id),
          ),
        )
        .returning();

      if (!session) {
        throw new ORPCError("NOT_FOUND", { message: "Сессия не найдена" });
      }
      if (session.trainingAssignmentId) {
        const [assignment] = await tx
          .update(GameTrainingAssignment)
          .set({ status: "completed", completedAt: new Date() })
          .where(
            and(
              eq(GameTrainingAssignment.id, session.trainingAssignmentId),
              eq(GameTrainingAssignment.participantId, context.session.user.id),
              eq(GameTrainingAssignment.status, "in_progress"),
            ),
          )
          .returning({ id: GameTrainingAssignment.id });
        if (!assignment) {
          throw new ORPCError("CONFLICT", {
            message: "Назначение практики уже изменилось",
          });
        }
      }
      return session;
    }),
  );

export const gameSessionRouter = { create, list, byAssignment, byId, end };
