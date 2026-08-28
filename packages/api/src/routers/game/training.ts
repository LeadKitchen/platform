import { and, desc, eq, GameTrainingAssignment, inArray } from "@acme/db";
import { getMemberOrgId } from "../../game/organizations";
import { protectedProcedure } from "../../orpc";

/**
 * Practice briefs assigned to the current participant by their facilitator.
 * A brief remains visible while its linked session is in progress so the
 * participant can return to it after a break.
 */
export const listMine = protectedProcedure.handler(async ({ context }) => {
  const orgId = await getMemberOrgId(context.db, context.session.user.id);
  if (!orgId) return [];
  return context.db
    .select()
    .from(GameTrainingAssignment)
    .where(
      and(
        eq(GameTrainingAssignment.participantId, context.session.user.id),
        eq(GameTrainingAssignment.orgId, orgId),
        inArray(GameTrainingAssignment.status, ["assigned", "in_progress"]),
      ),
    )
    .orderBy(desc(GameTrainingAssignment.createdAt));
});

export const gameTrainingRouter = { listMine };
