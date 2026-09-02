import {
  and,
  count,
  desc,
  eq,
  GameCoachingPathAssignment,
  GameDialog,
  GameOrder,
  GameProductEvent,
  GameSession,
} from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { getMemberOrgId } from "../../game/organizations";
import {
  buildRoleplayNotes,
  roleplayScenarioFromSnapshot,
} from "../../game/roleplay";
import { getActiveScorecardSnapshot } from "../../game/scorecards";
import { loadEngine } from "../../game/service";
import { loadGameSettings } from "../../game/settings";
import { protectedProcedure } from "../../orpc";

export const listMine = protectedProcedure.handler(async ({ context }) => {
  const orgId = await getMemberOrgId(context.db, context.session.user.id);
  if (!orgId) return [];
  return context.db
    .select()
    .from(GameCoachingPathAssignment)
    .where(
      and(
        eq(GameCoachingPathAssignment.orgId, orgId),
        eq(GameCoachingPathAssignment.participantId, context.session.user.id),
      ),
    )
    .orderBy(desc(GameCoachingPathAssignment.createdAt));
});

export const startStep = protectedProcedure
  .input(
    z.object({
      assignmentId: z.uuid(),
      mode: z.enum(["full", "objections"]).default("full"),
    }),
  )
  .handler(async ({ context, input }) => {
    const [assignment] = await context.db
      .select()
      .from(GameCoachingPathAssignment)
      .where(
        and(
          eq(GameCoachingPathAssignment.id, input.assignmentId),
          eq(GameCoachingPathAssignment.participantId, context.session.user.id),
        ),
      )
      .limit(1);
    if (!assignment) {
      throw new ORPCError("NOT_FOUND", {
        message: "Назначенный путь не найден",
      });
    }
    if (assignment.status === "completed") {
      throw new ORPCError("BAD_REQUEST", { message: "Путь уже завершён" });
    }
    const step = assignment.pathSnapshot.steps[assignment.currentStep];
    if (!step) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Следующий шаг не найден",
      });
    }
    const scenario = roleplayScenarioFromSnapshot(step.scenario);
    const [engine, settings, scorecard] = await Promise.all([
      loadEngine(context.db),
      loadGameSettings(context.db),
      getActiveScorecardSnapshot(context.db, assignment.orgId),
    ]);
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
    engine.pipeline(variantId);

    return context.db.transaction(async (tx) => {
      const [session] = await tx
        .insert(GameSession)
        .values({
          title: `${assignment.pathSnapshot.name} · ${scenario.title}`,
          round: 2,
          variantId,
          createdBy: context.session.user.id,
          orgId: assignment.orgId,
          coachingPathAssignmentId: assignment.id,
          coachingPathStepId: step.id,
          roleplayScenarioId: scenario.id,
          roleplayScenarioSnapshot: step.scenario,
          roleplayMode: input.mode,
          scorecardId: scorecard?.id,
          scorecardSnapshot: scorecard ?? undefined,
        })
        .returning();
      if (!session) throw new Error("Не удалось создать тренировку");
      const [order] = await tx
        .insert(GameOrder)
        .values({
          sessionId: session.id,
          taskId: scenario.baseTaskId,
          employeeId: scenario.baseEmployeeId,
          deadlineMinutes: settings.defaultDeadlineMinutes,
          notes: buildRoleplayNotes(scenario, input.mode),
          status: "in_progress",
        })
        .returning();
      if (!order) throw new Error("Не удалось создать ситуацию");
      const [dialog] = await tx
        .insert(GameDialog)
        .values({
          sessionId: session.id,
          orderId: order.id,
          employeeId: scenario.baseEmployeeId,
          taskId: scenario.baseTaskId,
          round: 2,
          variantId,
          activeOrders: 1,
          soloOnShift: false,
        })
        .returning();
      if (!dialog) throw new Error("Не удалось открыть диалог");
      await tx
        .update(GameCoachingPathAssignment)
        .set({
          status: "in_progress",
          startedAt: assignment.startedAt ?? new Date(),
        })
        .where(eq(GameCoachingPathAssignment.id, assignment.id));
      await tx.insert(GameProductEvent).values({
        userId: context.session.user.id,
        sessionId: session.id,
        dialogId: dialog.id,
        name: "coaching_path_step_started",
        properties: {
          assignmentId: assignment.id,
          stepId: step.id,
          scenarioId: scenario.id,
        },
      });
      return { session, order, dialog };
    });
  });

export const gameCoachingPathsRouter = { listMine, startStep };
