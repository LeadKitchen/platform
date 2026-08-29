import {
  and,
  count,
  desc,
  eq,
  GameDialog,
  GameEvaluation,
  GameOrder,
  GameProductEvent,
  GameRoleplayScenario,
  GameSession,
  GameVariant,
  isNotNull,
} from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { getMemberOrgId } from "../../game/organizations";
import {
  buildRoleplayNotes,
  buildRoleplayTemplates,
  mapStoredRoleplayScenario,
  ROLEPLAY_CATEGORIES,
  resolveRoleplayScenario,
  snapshotRoleplayScenario,
} from "../../game/roleplay";
import { loadCatalog, loadEngine } from "../../game/service";
import { loadGameSettings } from "../../game/settings";
import { protectedProcedure } from "../../orpc";
import { selectWeightedVariant } from "./session";

const categorySchema = z.enum(ROLEPLAY_CATEGORIES);
const levelSchema = z.enum(["L1", "L2", "L3", "L4"]);
const modeSchema = z.enum(["full", "objections"]);

const scenarioFields = z.object({
  title: z.string().trim().min(3).max(180),
  baseEmployeeId: z.string().min(1).max(64),
  baseTaskId: z.string().min(1).max(64),
  employeeName: z.string().trim().min(2).max(128),
  employeeRole: z.string().trim().min(2).max(128),
  employeeLevel: levelSchema,
  category: categorySchema,
  description: z.string().trim().min(20).max(4000),
  trainingObjectives: z.array(z.string().trim().min(2).max(300)).max(10),
  objections: z.array(z.string().trim().min(2).max(300)).max(10),
  privateBeliefs: z.array(z.string().trim().min(2).max(300)).max(10),
});

async function validateCatalogIds(
  context: { db: Parameters<typeof loadCatalog>[0] },
  input: { baseEmployeeId: string; baseTaskId: string },
) {
  const catalog = await loadCatalog(context.db);
  const employee = catalog.employees.find(
    (item) => item.id === input.baseEmployeeId,
  );
  const task = catalog.tasks.find((item) => item.id === input.baseTaskId);
  if (!employee || !task) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Базовый сотрудник или задача больше недоступны",
    });
  }
  return catalog;
}

/** Catalog plus the participant's recent attempts. */
export const list = protectedProcedure.handler(async ({ context }) => {
  const [catalog, customRows, attempts] = await Promise.all([
    loadCatalog(context.db),
    context.db
      .select()
      .from(GameRoleplayScenario)
      .where(
        and(
          eq(GameRoleplayScenario.createdBy, context.session.user.id),
          eq(GameRoleplayScenario.isArchived, false),
        ),
      )
      .orderBy(desc(GameRoleplayScenario.updatedAt)),
    context.db
      .select({
        scenarioId: GameSession.roleplayScenarioId,
        sessionId: GameSession.id,
        sessionStatus: GameSession.status,
        startedAt: GameSession.createdAt,
        endedAt: GameSession.endedAt,
        mode: GameSession.roleplayMode,
        dialogId: GameDialog.id,
        dialogStatus: GameDialog.status,
        scorePercent: GameEvaluation.scorePercent,
      })
      .from(GameSession)
      .leftJoin(GameDialog, eq(GameDialog.sessionId, GameSession.id))
      .leftJoin(GameEvaluation, eq(GameEvaluation.dialogId, GameDialog.id))
      .where(
        and(
          eq(GameSession.createdBy, context.session.user.id),
          isNotNull(GameSession.roleplayScenarioId),
        ),
      )
      .orderBy(desc(GameSession.createdAt)),
  ]);

  return {
    scenarios: [
      ...buildRoleplayTemplates(catalog),
      ...customRows.map(mapStoredRoleplayScenario),
    ],
    attempts,
    reference: {
      employees: catalog.employees.map((employee) => ({
        id: employee.id,
        name: employee.name,
        role: employee.role,
        level: employee.level,
      })),
      tasks: catalog.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        type: task.type,
      })),
    },
  };
});

export const create = protectedProcedure
  .input(scenarioFields)
  .handler(async ({ context, input }) => {
    await validateCatalogIds(context, input);
    const orgId = await getMemberOrgId(context.db, context.session.user.id);
    const [created] = await context.db
      .insert(GameRoleplayScenario)
      .values({
        ...input,
        createdBy: context.session.user.id,
        orgId,
      })
      .returning();
    if (!created) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Не удалось создать сценарий",
      });
    }
    return mapStoredRoleplayScenario(created);
  });

export const update = protectedProcedure
  .input(scenarioFields.extend({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    await validateCatalogIds(context, input);
    const { id, ...values } = input;
    const [updated] = await context.db
      .update(GameRoleplayScenario)
      .set(values)
      .where(
        and(
          eq(GameRoleplayScenario.id, id),
          eq(GameRoleplayScenario.createdBy, context.session.user.id),
          eq(GameRoleplayScenario.isArchived, false),
        ),
      )
      .returning();
    if (!updated) {
      throw new ORPCError("NOT_FOUND", { message: "Сценарий не найден" });
    }
    return mapStoredRoleplayScenario(updated);
  });

export const setFavorite = protectedProcedure
  .input(z.object({ id: z.uuid(), isFavorite: z.boolean() }))
  .handler(async ({ context, input }) => {
    const [updated] = await context.db
      .update(GameRoleplayScenario)
      .set({ isFavorite: input.isFavorite })
      .where(
        and(
          eq(GameRoleplayScenario.id, input.id),
          eq(GameRoleplayScenario.createdBy, context.session.user.id),
          eq(GameRoleplayScenario.isArchived, false),
        ),
      )
      .returning();
    if (!updated) {
      throw new ORPCError("NOT_FOUND", { message: "Сценарий не найден" });
    }
    return mapStoredRoleplayScenario(updated);
  });

export const archive = protectedProcedure
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const [updated] = await context.db
      .update(GameRoleplayScenario)
      .set({ isArchived: true })
      .where(
        and(
          eq(GameRoleplayScenario.id, input.id),
          eq(GameRoleplayScenario.createdBy, context.session.user.id),
        ),
      )
      .returning({ id: GameRoleplayScenario.id });
    if (!updated) {
      throw new ORPCError("NOT_FOUND", { message: "Сценарий не найден" });
    }
    return updated;
  });

/** Create a dedicated session, order and live dialog in one operation. */
export const start = protectedProcedure
  .input(z.object({ scenarioId: z.string().min(1), mode: modeSchema }))
  .handler(async ({ context, input }) => {
    const [catalog, engine, settings, orgId] = await Promise.all([
      loadCatalog(context.db),
      loadEngine(context.db),
      loadGameSettings(context.db),
      getMemberOrgId(context.db, context.session.user.id),
    ]);
    const scenario = await resolveRoleplayScenario(
      context.db,
      catalog,
      input.scenarioId,
      context.session.user.id,
    );
    if (scenario.isArchived) {
      throw new ORPCError("NOT_FOUND", { message: "Сценарий не найден" });
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
    engine.pipeline(variantId);

    return context.db.transaction(async (tx) => {
      const [session] = await tx
        .insert(GameSession)
        .values({
          title: scenario.title,
          round: 2,
          variantId,
          createdBy: context.session.user.id,
          orgId,
          roleplayScenarioId: scenario.id,
          roleplayScenarioSnapshot: snapshotRoleplayScenario(scenario),
          roleplayMode: input.mode,
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

      await tx.insert(GameProductEvent).values([
        {
          userId: context.session.user.id,
          sessionId: session.id,
          name: "roleplay_session_created",
          properties: { scenarioId: scenario.id, mode: input.mode },
        },
        {
          userId: context.session.user.id,
          sessionId: session.id,
          dialogId: dialog.id,
          name: "dialog_started",
          properties: {
            scenarioId: scenario.id,
            taskId: scenario.baseTaskId,
            employeeId: scenario.baseEmployeeId,
          },
        },
      ]);

      return { session, order, dialog };
    });
  });

export const gameRoleplayRouter = {
  list,
  create,
  update,
  setFavorite,
  archive,
  start,
};
