import {
  avg,
  count,
  desc,
  eq,
  GameDialog,
  GameEvaluation,
  GameSession,
  user,
} from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { getFacilitatorOrgId } from "../../game/organizations";
import { protectedProcedure } from "../../orpc";

async function requireFacilitatorOrgId(
  db: Parameters<typeof getFacilitatorOrgId>[0],
  userId: string,
) {
  const orgId = await getFacilitatorOrgId(db, userId);
  if (!orgId) {
    throw new ORPCError("FORBIDDEN", {
      message: "Доступно только ведущим группы",
    });
  }
  return orgId;
}

/**
 * Sessions played by members of the caller's organization, with an
 * evaluation summary per session. Facilitator-only — the production
 * counterpart of `admin.game.sessions.list`, scoped to one org instead of
 * the whole platform.
 *
 * @example client.org.sessions.list({ limit: 50 })
 */
export const list = protectedProcedure
  .input(
    z.object({
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }),
  )
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );

    const [sessions, scores] = await Promise.all([
      context.db
        .select({ session: GameSession, participant: user.name })
        .from(GameSession)
        .leftJoin(user, eq(user.id, GameSession.createdBy))
        .where(eq(GameSession.orgId, orgId))
        .orderBy(desc(GameSession.createdAt))
        .limit(input.limit)
        .offset(input.offset),
      context.db
        .select({
          sessionId: GameDialog.sessionId,
          dialogs: count(),
          avgScore: avg(GameEvaluation.scorePercent),
        })
        .from(GameDialog)
        .leftJoin(GameEvaluation, eq(GameEvaluation.dialogId, GameDialog.id))
        .innerJoin(GameSession, eq(GameSession.id, GameDialog.sessionId))
        .where(eq(GameSession.orgId, orgId))
        .groupBy(GameDialog.sessionId),
    ]);

    const scoreBySession = new Map(
      scores.map((row) => [
        row.sessionId,
        {
          dialogs: row.dialogs,
          avgScore: row.avgScore ? Math.round(Number(row.avgScore)) : null,
        },
      ]),
    );

    return sessions.map((row) => ({
      ...row,
      dialogs: scoreBySession.get(row.session.id)?.dialogs ?? 0,
      avgScore: scoreBySession.get(row.session.id)?.avgScore ?? null,
    }));
  });

export const orgSessionsRouter = { list };
