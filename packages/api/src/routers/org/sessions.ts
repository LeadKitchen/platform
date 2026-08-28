import {
  and,
  avg,
  count,
  desc,
  eq,
  GameDialog,
  GameEvaluation,
  GameSession,
  inArray,
  lt,
  or,
  user,
} from "@acme/db";
import { z } from "zod";
import { requireFacilitatorOrgId } from "../../game/organizations";
import { protectedProcedure } from "../../orpc";

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
      cursor: z
        .object({
          createdAt: z.date(),
          id: z.string().uuid(),
        })
        .optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );

    const sessions = await context.db
      .select({ session: GameSession, participant: user.name })
      .from(GameSession)
      .leftJoin(user, eq(user.id, GameSession.createdBy))
      .where(
        and(
          eq(GameSession.orgId, orgId),
          input.cursor
            ? or(
                lt(GameSession.createdAt, input.cursor.createdAt),
                and(
                  eq(GameSession.createdAt, input.cursor.createdAt),
                  lt(GameSession.id, input.cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(GameSession.createdAt), desc(GameSession.id))
      .limit(input.limit)
      .offset(input.cursor ? 0 : input.offset);

    const sessionIds = sessions.map((row) => row.session.id);
    const scores =
      sessionIds.length === 0
        ? []
        : await context.db
            .select({
              sessionId: GameDialog.sessionId,
              dialogs: count(),
              avgScore: avg(GameEvaluation.scorePercent),
            })
            .from(GameDialog)
            .leftJoin(
              GameEvaluation,
              eq(GameEvaluation.dialogId, GameDialog.id),
            )
            .where(inArray(GameDialog.sessionId, sessionIds))
            .groupBy(GameDialog.sessionId);

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
