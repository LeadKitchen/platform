import {
  and,
  asc,
  eq,
  GameDialog,
  GameEvaluation,
  GameFacilitator,
  GameOrgMember,
  GameSession,
  ilike,
  user,
} from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { requireFacilitatorOrgId } from "../../game/organizations";
import { protectedProcedure } from "../../orpc";

/**
 * Facilitator-only roster of a workspace: who is in it, their role, and the
 * activity Kendo-style member tables show — last call, last roleplay, last
 * active. "Call" here means a negotiation session from the business game
 * (`roleplayScenarioId` unset); "roleplay" means an AI roleplay session.
 *
 * @example client.org.members.list()
 */
const list = protectedProcedure.handler(async ({ context }) => {
  const orgId = await requireFacilitatorOrgId(
    context.db,
    context.session.user.id,
  );

  const [rows, sessions, evaluations] = await Promise.all([
    context.db
      .select({
        userId: GameOrgMember.userId,
        joinedAt: GameOrgMember.createdAt,
        name: user.name,
        email: user.email,
        image: user.image,
        facilitatorUserId: GameFacilitator.userId,
      })
      .from(GameOrgMember)
      .innerJoin(user, eq(user.id, GameOrgMember.userId))
      .leftJoin(
        GameFacilitator,
        and(
          eq(GameFacilitator.userId, GameOrgMember.userId),
          eq(GameFacilitator.orgId, orgId),
        ),
      )
      .where(eq(GameOrgMember.orgId, orgId))
      .orderBy(asc(user.name)),
    context.db
      .select({
        userId: GameSession.createdBy,
        roleplayScenarioId: GameSession.roleplayScenarioId,
        createdAt: GameSession.createdAt,
      })
      .from(GameSession)
      .where(eq(GameSession.orgId, orgId)),
    context.db
      .select({
        userId: GameSession.createdBy,
        scorePercent: GameEvaluation.scorePercent,
      })
      .from(GameEvaluation)
      .innerJoin(GameDialog, eq(GameDialog.id, GameEvaluation.dialogId))
      .innerJoin(GameSession, eq(GameSession.id, GameDialog.sessionId))
      .where(eq(GameSession.orgId, orgId)),
  ]);

  interface Activity {
    liveSessions: number;
    roleplaySessions: number;
    lastCallAt: Date | null;
    lastRoleplayAt: Date | null;
  }
  const activityByUser = new Map<string, Activity>();
  for (const row of sessions) {
    if (!row.userId) continue;
    const activity = activityByUser.get(row.userId) ?? {
      liveSessions: 0,
      roleplaySessions: 0,
      lastCallAt: null,
      lastRoleplayAt: null,
    };
    if (row.roleplayScenarioId) {
      activity.roleplaySessions += 1;
      if (!activity.lastRoleplayAt || row.createdAt > activity.lastRoleplayAt)
        activity.lastRoleplayAt = row.createdAt;
    } else {
      activity.liveSessions += 1;
      if (!activity.lastCallAt || row.createdAt > activity.lastCallAt)
        activity.lastCallAt = row.createdAt;
    }
    activityByUser.set(row.userId, activity);
  }

  const scoresByUser = new Map<string, number[]>();
  for (const row of evaluations) {
    if (!row.userId) continue;
    const scores = scoresByUser.get(row.userId) ?? [];
    scores.push(row.scorePercent);
    scoresByUser.set(row.userId, scores);
  }

  const members = rows.map((row) => {
    const activity = activityByUser.get(row.userId);
    const scores = scoresByUser.get(row.userId) ?? [];
    const lastActiveAt =
      activity?.lastCallAt && activity.lastRoleplayAt
        ? activity.lastCallAt > activity.lastRoleplayAt
          ? activity.lastCallAt
          : activity.lastRoleplayAt
        : (activity?.lastCallAt ?? activity?.lastRoleplayAt ?? null);

    return {
      userId: row.userId,
      name: row.name,
      email: row.email,
      image: row.image,
      isFacilitator: row.facilitatorUserId !== null,
      isYou: row.userId === context.session.user.id,
      joinedAt: row.joinedAt,
      liveSessions: activity?.liveSessions ?? 0,
      roleplaySessions: activity?.roleplaySessions ?? 0,
      lastCallAt: activity?.lastCallAt ?? null,
      lastRoleplayAt: activity?.lastRoleplayAt ?? null,
      lastActiveAt,
      avgScore:
        scores.length > 0
          ? Math.round(
              scores.reduce((sum, value) => sum + value, 0) / scores.length,
            )
          : null,
    };
  });

  return { orgId, members };
});

/** Adds an already-registered user to the workspace by email. */
const add = protectedProcedure
  .input(z.object({ email: z.string().trim().email() }))
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );

    const [candidate] = await context.db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(ilike(user.email, input.email))
      .limit(1);
    if (!candidate) {
      throw new ORPCError("NOT_FOUND", {
        message: "Пользователь с такой почтой ещё не зарегистрирован",
      });
    }

    const [existing] = await context.db
      .select({ userId: GameOrgMember.userId })
      .from(GameOrgMember)
      .where(
        and(
          eq(GameOrgMember.userId, candidate.id),
          eq(GameOrgMember.orgId, orgId),
        ),
      )
      .limit(1);
    if (existing) {
      throw new ORPCError("CONFLICT", {
        message: "Этот пользователь уже состоит в команде",
      });
    }

    await context.db
      .insert(GameOrgMember)
      .values({ userId: candidate.id, orgId });

    return { userId: candidate.id, name: candidate.name };
  });

/** Removes a member (and any facilitator grant) from the workspace. */
const remove = protectedProcedure
  .input(z.object({ userId: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );

    if (input.userId === context.session.user.id) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Нельзя удалить себя из команды",
      });
    }

    await context.db.transaction(async (tx) => {
      await tx
        .delete(GameOrgMember)
        .where(
          and(
            eq(GameOrgMember.userId, input.userId),
            eq(GameOrgMember.orgId, orgId),
          ),
        );
      await tx
        .delete(GameFacilitator)
        .where(
          and(
            eq(GameFacilitator.userId, input.userId),
            eq(GameFacilitator.orgId, orgId),
          ),
        );
    });

    return { userId: input.userId };
  });

/** Grants or revokes the facilitator role for a member of the workspace. */
const setFacilitator = protectedProcedure
  .input(z.object({ userId: z.string().min(1), isFacilitator: z.boolean() }))
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );

    if (!input.isFacilitator) {
      const facilitators = await context.db
        .select({ userId: GameFacilitator.userId })
        .from(GameFacilitator)
        .where(eq(GameFacilitator.orgId, orgId));
      if (
        facilitators.length <= 1 &&
        facilitators.some((row) => row.userId === input.userId)
      ) {
        throw new ORPCError("BAD_REQUEST", {
          message: "В команде должен остаться хотя бы один фасилитатор",
        });
      }
      await context.db
        .delete(GameFacilitator)
        .where(
          and(
            eq(GameFacilitator.userId, input.userId),
            eq(GameFacilitator.orgId, orgId),
          ),
        );
      return { userId: input.userId, isFacilitator: false };
    }

    await context.db
      .insert(GameFacilitator)
      .values({
        userId: input.userId,
        orgId,
        grantedBy: context.session.user.id,
      })
      .onConflictDoNothing();
    return { userId: input.userId, isFacilitator: true };
  });

export const orgMembersRouter = { list, add, remove, setFacilitator };
