import { asc, eq, GameEmployee, GameTask } from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { employeeProfileSchema } from "../../../game/character-studio";
import { mutateConfig } from "../../../game/config-version";
import { facilitatorProcedure, methodologistProcedure } from "../../../orpc";

const employeeInput = employeeProfileSchema.extend({ isActive: z.boolean() });

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

export const list = facilitatorProcedure.handler(async ({ context }) => {
  const [employees, tasks] = await Promise.all([
    context.db.select().from(GameEmployee).orderBy(asc(GameEmployee.name)),
    context.db.select().from(GameTask).orderBy(asc(GameTask.title)),
  ]);
  return { employees, tasks };
});

export const upsertEmployee = methodologistProcedure
  .input(employeeInput)
  .handler(async ({ context, input }) => {
    const audit = await mutateConfig(
      context.db,
      {
        actorId: context.session.user.id,
        source: "form",
        summary: `Сотрудник: ${input.name}`,
      },
      async (tx) => {
        const [employee] = await tx
          .insert(GameEmployee)
          .values(input)
          .onConflictDoUpdate({ target: GameEmployee.id, set: input })
          .returning();
        return employee;
      },
    );
    const employee = audit.result;
    if (!employee) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Не удалось сохранить сотрудника",
      });
    }
    return employee;
  });

export const upsertTask = methodologistProcedure
  .input(taskInput)
  .handler(async ({ context, input }) => {
    const audit = await mutateConfig(
      context.db,
      {
        actorId: context.session.user.id,
        source: "form",
        summary: `Задание: ${input.title}`,
      },
      async (tx) => {
        const [task] = await tx
          .insert(GameTask)
          .values(input)
          .onConflictDoUpdate({ target: GameTask.id, set: input })
          .returning();
        return task;
      },
    );
    const task = audit.result;
    if (!task) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Не удалось сохранить задание",
      });
    }
    return task;
  });

export const setEmployeeActive = methodologistProcedure
  .input(z.object({ id: z.string().max(64), isActive: z.boolean() }))
  .handler(async ({ context, input }) => {
    const audit = await mutateConfig(
      context.db,
      {
        actorId: context.session.user.id,
        source: "form",
        summary: `${input.isActive ? "Включён" : "Выключен"} сотрудник ${input.id}`,
      },
      async (tx) => {
        const [employee] = await tx
          .update(GameEmployee)
          .set({ isActive: input.isActive })
          .where(eq(GameEmployee.id, input.id))
          .returning();
        return employee;
      },
    );
    const employee = audit.result;
    if (!employee) {
      throw new ORPCError("NOT_FOUND", { message: "Сотрудник не найден" });
    }
    return employee;
  });

export const setTaskActive = methodologistProcedure
  .input(z.object({ id: z.string().max(64), isActive: z.boolean() }))
  .handler(async ({ context, input }) => {
    const audit = await mutateConfig(
      context.db,
      {
        actorId: context.session.user.id,
        source: "form",
        summary: `${input.isActive ? "Включено" : "Выключено"} задание ${input.id}`,
      },
      async (tx) => {
        const [task] = await tx
          .update(GameTask)
          .set({ isActive: input.isActive })
          .where(eq(GameTask.id, input.id))
          .returning();
        return task;
      },
    );
    const task = audit.result;
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
