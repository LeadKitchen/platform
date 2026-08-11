import { asc, eq, GameOrder, GameSession } from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { loadCatalog } from "../../game/service";
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
      deadlineMinutes: z.number().int().min(5).max(600).default(60),
      notes: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const [session] = await context.db
      .select()
      .from(GameSession)
      .where(eq(GameSession.id, input.sessionId))
      .limit(1);

    if (!session) {
      throw new ORPCError("NOT_FOUND", { message: "Сессия не найдена" });
    }

    const catalog = await loadCatalog(context.db);
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
        deadlineMinutes: input.deadlineMinutes,
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
  .handler(async ({ context, input }) =>
    context.db
      .select()
      .from(GameOrder)
      .where(eq(GameOrder.sessionId, input.sessionId))
      .orderBy(asc(GameOrder.createdAt)),
  );

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
