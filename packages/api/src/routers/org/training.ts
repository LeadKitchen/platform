import {
  and,
  desc,
  eq,
  GameOrgMember,
  GameTrainingAssignment,
  inArray,
  user,
} from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { requireFacilitatorOrgIdFromContext } from "../../game/organizations";
import { protectedProcedure } from "../../orpc";

const assignmentInput = z.object({
  participantId: z.string().min(1),
  criterionId: z.string().min(1).max(64),
  criterionTitle: z.string().min(1).max(256),
});

/** Assign the participant a drill anchored to the criterion they miss most. */
export const assign = protectedProcedure
  .input(assignmentInput)
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgIdFromContext(context);
    const [participant] = await context.db
      .select({ userId: GameOrgMember.userId })
      .from(GameOrgMember)
      .where(
        and(
          eq(GameOrgMember.orgId, orgId),
          eq(GameOrgMember.userId, input.participantId),
        ),
      )
      .limit(1);
    if (!participant) {
      throw new ORPCError("NOT_FOUND", { message: "Участник не найден" });
    }

    try {
      const [assignment] = await context.db
        .insert(GameTrainingAssignment)
        .values({
          orgId,
          participantId: input.participantId,
          assignedBy: context.session.user.id,
          criterionId: input.criterionId,
          criterionTitle: input.criterionTitle,
        })
        .returning({ id: GameTrainingAssignment.id });
      if (!assignment) throw new Error("Не удалось назначить практику");
      return { ...assignment, duplicate: false };
    } catch (cause) {
      if (
        !(cause instanceof Error) ||
        !("code" in cause) ||
        cause.code !== "23505"
      ) {
        throw cause;
      }
      const [existing] = await context.db
        .select({ id: GameTrainingAssignment.id })
        .from(GameTrainingAssignment)
        .where(
          and(
            eq(GameTrainingAssignment.orgId, orgId),
            eq(GameTrainingAssignment.participantId, input.participantId),
            eq(GameTrainingAssignment.criterionId, input.criterionId),
            inArray(GameTrainingAssignment.status, ["assigned", "in_progress"]),
          ),
        )
        .limit(1);
      if (!existing) throw cause;
      return { id: existing.id, duplicate: true };
    }
  });

/** Active assignments, for a facilitator's own organization only. */
export const list = protectedProcedure.handler(async ({ context }) => {
  const orgId = await requireFacilitatorOrgIdFromContext(context);
  return context.db
    .select({ assignment: GameTrainingAssignment, participant: user.name })
    .from(GameTrainingAssignment)
    .innerJoin(user, eq(user.id, GameTrainingAssignment.participantId))
    .where(
      and(
        eq(GameTrainingAssignment.orgId, orgId),
        inArray(GameTrainingAssignment.status, ["assigned", "in_progress"]),
      ),
    )
    .orderBy(desc(GameTrainingAssignment.createdAt));
});

export const orgTrainingRouter = { assign, list };
