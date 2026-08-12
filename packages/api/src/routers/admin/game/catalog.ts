import { asc, eq, GameEmployee, GameTask } from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { adminProcedure } from "../../../orpc";

const employeeInput = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1).max(128),
  role: z.string().min(1).max(128),
  level: z.enum(["L1", "L2", "L3", "L4"]),
  competences: z.record(z.string(), z.string()),
  personality: z.record(z.string(), z.unknown()),
  isActive: z.boolean(),
});

const taskInput = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_-]+$/),
  title: z.string().min(1).max(256),
  type: z.string().min(1).max(64),
  complexity: z.number().int().min(1).max(5),
  timeCriticality: z.number().int().min(1).max(5),
  requiresCheckpoints: z.boolean(),
  failureModes: z.array(z.string().min(1).max(256)).max(20),
  isActive: z.boolean(),
});

export const list = adminProcedure.handler(async ({ context }) => {
  const [employees, tasks] = await Promise.all([
    context.db.select().from(GameEmployee).orderBy(asc(GameEmployee.name)),
    context.db.select().from(GameTask).orderBy(asc(GameTask.title)),
  ]);
  return { employees, tasks };
});

export const upsertEmployee = adminProcedure
  .input(employeeInput)
  .handler(async ({ context, input }) => {
    const [employee] = await context.db
      .insert(GameEmployee)
      .values(input)
      .onConflictDoUpdate({ target: GameEmployee.id, set: input })
      .returning();
    if (!employee) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Не удалось сохранить сотрудника",
      });
    }
    return employee;
  });

export const upsertTask = adminProcedure
  .input(taskInput)
  .handler(async ({ context, input }) => {
    const [task] = await context.db
      .insert(GameTask)
      .values(input)
      .onConflictDoUpdate({ target: GameTask.id, set: input })
      .returning();
    if (!task) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Не удалось сохранить задание",
      });
    }
    return task;
  });

export const setEmployeeActive = adminProcedure
  .input(z.object({ id: z.string().max(64), isActive: z.boolean() }))
  .handler(async ({ context, input }) => {
    const [employee] = await context.db
      .update(GameEmployee)
      .set({ isActive: input.isActive })
      .where(eq(GameEmployee.id, input.id))
      .returning();
    if (!employee) {
      throw new ORPCError("NOT_FOUND", { message: "Сотрудник не найден" });
    }
    return employee;
  });

export const setTaskActive = adminProcedure
  .input(z.object({ id: z.string().max(64), isActive: z.boolean() }))
  .handler(async ({ context, input }) => {
    const [task] = await context.db
      .update(GameTask)
      .set({ isActive: input.isActive })
      .where(eq(GameTask.id, input.id))
      .returning();
    if (!task) {
      throw new ORPCError("NOT_FOUND", { message: "Задание не найдено" });
    }
    return task;
  });

export const adminGameCatalogRouter = {
  list,
  upsertEmployee,
  upsertTask,
  setEmployeeActive,
  setTaskActive,
};
