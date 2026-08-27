import {
  asc,
  eq,
  GameDialog,
  GameEvaluation,
  GameSession,
  user,
} from "@acme/db";
import { CRITERIA, type CriterionId } from "@acme/game";
import { z } from "zod";
import { requireFacilitatorOrgId } from "../../game/organizations";
import { protectedProcedure } from "../../orpc";

interface CriterionRow {
  id: string;
  title: string;
  met: boolean;
}

export interface MissedCount {
  id: string;
  title: string;
  /** How many times it was required but not met. */
  missed: number;
  /** How many times it was required at all — the denominator for `share`. */
  total: number;
  /** `missed / total`, i.e. the miss rate among dialogs where it applied. */
  share: number;
}

function criterionTitle(id: string, fallback: string): string {
  return CRITERIA[id as CriterionId]?.title ?? fallback;
}

/**
 * Most-missed criteria, ranked by how often they were required but not met.
 * `share` is per-criterion (missed ÷ how often *that* criterion applied) —
 * not a fraction of all criteria checks, which would conflate a rarely
 * required criterion with a frequently missed one.
 */
function topMissed(rows: CriterionRow[], limit: number): MissedCount[] {
  const counts = new Map<
    string,
    { id: string; title: string; missed: number; total: number }
  >();
  for (const criterion of rows) {
    const existing = counts.get(criterion.id) ?? {
      id: criterion.id,
      title: criterionTitle(criterion.id, criterion.title),
      missed: 0,
      total: 0,
    };
    existing.total += 1;
    if (!criterion.met) existing.missed += 1;
    counts.set(criterion.id, existing);
  }
  return [...counts.values()]
    .filter((item) => item.missed > 0)
    .map((item) => ({
      ...item,
      share: Math.round((item.missed / item.total) * 100) / 100,
    }))
    .sort((a, b) => b.missed - a.missed)
    .slice(0, limit);
}

/**
 * Per-person and org-wide skill summary — the production counterpart of
 * `admin.game.analytics`, sliced by who played instead of by which AI
 * variant answered. Facilitator-only.
 *
 * "Dynamics" is deliberately simple: each person's evaluations are split in
 * chronological halves and compared, rather than a fitted trend line — with
 * a handful of sessions per person a regression would be noise dressed up
 * as signal.
 *
 * @example client.org.people.list()
 */
export const list = protectedProcedure
  .input(z.object({ limit: z.number().int().min(1).max(5000).default(2000) }))
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );

    const rows = await context.db
      .select({
        userId: GameSession.createdBy,
        userName: user.name,
        sessionId: GameSession.id,
        scorePercent: GameEvaluation.scorePercent,
        expectedStyle: GameEvaluation.expectedStyle,
        actualStyle: GameEvaluation.actualStyle,
        criteria: GameEvaluation.criteria,
        createdAt: GameEvaluation.createdAt,
      })
      .from(GameEvaluation)
      .innerJoin(GameDialog, eq(GameDialog.id, GameEvaluation.dialogId))
      .innerJoin(GameSession, eq(GameSession.id, GameDialog.sessionId))
      .leftJoin(user, eq(user.id, GameSession.createdBy))
      .where(eq(GameSession.orgId, orgId))
      .orderBy(asc(GameEvaluation.createdAt))
      .limit(input.limit);

    interface PersonAcc {
      userId: string;
      name: string;
      sessions: Set<string>;
      scores: number[];
      styleMatches: number;
      criteria: CriterionRow[];
      lastActiveAt: Date;
    }
    const byPerson = new Map<string, PersonAcc>();
    const orgCriteria: CriterionRow[] = [];

    for (const row of rows) {
      if (!row.userId) continue;
      const criteria = row.criteria as CriterionRow[];
      orgCriteria.push(...criteria);

      const person = byPerson.get(row.userId) ?? {
        userId: row.userId,
        name: row.userName ?? "—",
        sessions: new Set<string>(),
        scores: [],
        styleMatches: 0,
        criteria: [],
        lastActiveAt: row.createdAt,
      };
      person.sessions.add(row.sessionId);
      person.scores.push(row.scorePercent);
      if (row.expectedStyle === row.actualStyle) person.styleMatches += 1;
      person.criteria.push(...criteria);
      if (row.createdAt > person.lastActiveAt)
        person.lastActiveAt = row.createdAt;
      byPerson.set(row.userId, person);
    }

    const people = [...byPerson.values()]
      .map((person) => {
        const mid = Math.floor(person.scores.length / 2);
        const firstHalf = person.scores.slice(0, mid);
        const secondHalf = person.scores.slice(mid);
        const avg = (values: number[]) =>
          values.reduce((sum, value) => sum + value, 0) / values.length;
        const trend =
          firstHalf.length > 0 && secondHalf.length > 0
            ? Math.round(avg(secondHalf) - avg(firstHalf))
            : null;

        return {
          userId: person.userId,
          name: person.name,
          sessions: person.sessions.size,
          dialogs: person.scores.length,
          avgScore: Math.round(avg(person.scores)),
          styleMatchRate:
            Math.round((person.styleMatches / person.scores.length) * 100) /
            100,
          trend,
          topMissed: topMissed(person.criteria, 3),
          lastActiveAt: person.lastActiveAt,
        };
      })
      .sort((a, b) => b.dialogs - a.dialogs);

    return {
      people,
      topMissedOrg: topMissed(orgCriteria, 3),
    };
  });

export const orgPeopleRouter = { list };
