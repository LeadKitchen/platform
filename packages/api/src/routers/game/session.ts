import {
  and,
  count,
  desc,
  eq,
  GameOrder,
  GameProductEvent,
  GameSession,
  GameTrainingAssignment,
  GameVariant,
} from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { requireOwnedSession } from "../../game/access";
import { getMemberOrgId } from "../../game/organizations";
import { loadEngine } from "../../game/service";
import { loadGameSettings } from "../../game/settings";
import { protectedProcedure } from "../../orpc";

const roundSchema = z.union([z.literal(2), z.literal(3)]);

export function selectWeightedVariant(
  variants: Array<{ id: string; weight: number }>,
  random = Math.random,
): string | undefined {
  const available = variants.filter((item) => item.weight > 0);
  const total = available.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) return undefined;
  let cursor = random() * total;
  for (const item of available) {
    cursor -= item.weight;
    if (cursor < 0) return item.id;
  }
  return available.at(-1)?.id;
}

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

    const weightedVariants = settings.defaultVariantId
      ? []
      : await context.db
          .select({ id: GameVariant.id, weight: GameVariant.weight })
          .from(GameVariant)
          .where(eq(GameVariant.isActive, true));
    const variantId =
      settings.defaultVariantId ??
      selectWeightedVariant(weightedVariants) ??
      engine.defaultVariantId;

    // Fail here rather than at the first utterance of the first dialog.
    engine.pipeline(variantId);

    return context.db.transaction(async (tx) => {
      const [session] = await tx
        .insert(GameSession)
        .values({
          title: input.title,
          round,
          variantId,
          createdBy: context.session.user.id,
          orgId,
          trainingAssignmentId: assignment?.id,
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
