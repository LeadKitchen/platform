import { and, asc, eq, GameOrder, GameSession } from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { requireOwnedSession } from "../../game/access";
import { loadCatalog } from "../../game/service";
import { loadGameSettings } from "../../game/settings";
import { protectedProcedure } from "../../orpc";

/**
 * Put an order into the queue and assign it to an employee.
 *
 * Assignment is the participants' decision — the module only records it and
 * later judges how it was managed.
 *
 * @example client.game.order.create({ sessionId, taskId: "decorated_cake", employeeId: "anna" })
 */
export const create = protectedProcedure
  .input(
    z.object({
      sessionId: z.uuid(),
      taskId: z.string().min(1).max(64),
      employeeId: z.string().min(1).max(64),
      portions: z.number().int().min(1).max(500).default(1),
      deadlineMinutes: z.number().int().min(5).max(600).optional(),
      notes: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    await requireOwnedSession(
      context.db,
      input.sessionId,
      context.session.user.id,
    );

    const [catalog, settings] = await Promise.all([
      loadCatalog(context.db),
      loadGameSettings(context.db),
    ]);
    const employee = catalog.employees.find(
      (item) => item.id === input.employeeId,
    );
    const task = catalog.tasks.find((item) => item.id === input.taskId);

    if (!employee || !task) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Неизвестный сотрудник или задача",
      });
    }

    const [order] = await context.db
      .insert(GameOrder)
      .values({
        sessionId: input.sessionId,
        taskId: input.taskId,
        employeeId: input.employeeId,
        portions: input.portions,
        deadlineMinutes:
          input.deadlineMinutes ?? settings.defaultDeadlineMinutes,
        notes: input.notes,
      })
      .returning();

    return order;
  });

/**
 * Orders of a session, oldest first (the kitchen queue).
 *
 * @example client.game.order.list({ sessionId })
 */
export const list = protectedProcedure
  .input(z.object({ sessionId: z.uuid() }))
  .handler(async ({ context, input }) => {
    await requireOwnedSession(
      context.db,
      input.sessionId,
      context.session.user.id,
    );
    return context.db
      .select()
      .from(GameOrder)
      .where(eq(GameOrder.sessionId, input.sessionId))
      .orderBy(asc(GameOrder.createdAt));
  });

/**
 * Mark an order done or failed — this is what changes the queue length that
 * round 3 reacts to.
 *
 * @example client.game.order.setStatus({ id, status: "done" })
 */
export const setStatus = protectedProcedure
  .input(
    z.object({
      id: z.uuid(),
      status: z.enum(["queued", "in_progress", "done", "failed"]),
    }),
  )
  .handler(async ({ context, input }) => {
    const owned = await context.db
      .select({ id: GameOrder.id })
      .from(GameOrder)
      .innerJoin(GameSession, eq(GameSession.id, GameOrder.sessionId))
      .where(
        and(
          eq(GameOrder.id, input.id),
          eq(GameSession.createdBy, context.session.user.id),
        ),
      )
      .limit(1);
    if (!owned[0]) {
      throw new ORPCError("NOT_FOUND", { message: "Заказ не найден" });
    }
    const [order] = await context.db
      .update(GameOrder)
      .set({ status: input.status })
      .where(eq(GameOrder.id, input.id))
      .returning();

    if (!order) {
      throw new ORPCError("NOT_FOUND", { message: "Заказ не найден" });
    }
    return order;
  });

export const gameOrderRouter = { create, list, setStatus };
