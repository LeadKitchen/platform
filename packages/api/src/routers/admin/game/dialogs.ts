import {
  and,
  desc,
  eq,
  GameDialog,
  GameEmployee,
  GameEvaluation,
  GameEvent,
  GameSession,
  GameTask,
} from "@acme/db";
import { z } from "zod";

import { adminProcedure } from "../../../orpc";

/**
 * Recent dialogs with their scores, filterable by arm and round.
 *
 * @example client.admin.game.dialogs({ variantId: "graph-rag" })
 */
export const dialogs = adminProcedure
  .input(
    z.object({
      variantId: z.string().max(64).optional(),
      round: z.union([z.literal(2), z.literal(3)]).optional(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }),
  )
  .handler(async ({ context, input }) => {
    // Фильтры по варианту и раунду должны попасть в WHERE до LIMIT/OFFSET —
    // иначе при фильтрации в JS страница может вернуться пустой или неполной,
    // хотя подходящие диалоги в базе есть, просто не попали в выбранную
    // SQL-страницу.
    const conditions = [
      input.variantId ? eq(GameDialog.variantId, input.variantId) : undefined,
      input.round ? eq(GameDialog.round, input.round) : undefined,
    ].filter((condition) => condition !== undefined);

    return context.db
      .select({
        dialog: GameDialog,
        evaluation: GameEvaluation,
        sessionTitle: GameSession.title,
        employeeName: GameEmployee.name,
        taskTitle: GameTask.title,
      })
      .from(GameDialog)
      .leftJoin(GameEvaluation, eq(GameEvaluation.dialogId, GameDialog.id))
      .innerJoin(GameSession, eq(GameSession.id, GameDialog.sessionId))
      .innerJoin(GameEmployee, eq(GameEmployee.id, GameDialog.employeeId))
      .innerJoin(GameTask, eq(GameTask.id, GameDialog.taskId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(GameDialog.startedAt))
      .limit(input.limit)
      .offset(input.offset);
  });

export const detail = adminProcedure
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, input }) => {
    const [row] = await context.db
      .select({
        dialog: GameDialog,
        evaluation: GameEvaluation,
        sessionTitle: GameSession.title,
        employeeName: GameEmployee.name,
        taskTitle: GameTask.title,
      })
      .from(GameDialog)
      .leftJoin(GameEvaluation, eq(GameEvaluation.dialogId, GameDialog.id))
      .innerJoin(GameSession, eq(GameSession.id, GameDialog.sessionId))
      .innerJoin(GameEmployee, eq(GameEmployee.id, GameDialog.employeeId))
      .innerJoin(GameTask, eq(GameTask.id, GameDialog.taskId))
      .where(eq(GameDialog.id, input.id))
      .limit(1);

    if (!row) return null;
    const events = await context.db
      .select()
      .from(GameEvent)
      .where(eq(GameEvent.dialogId, input.id))
      .orderBy(GameEvent.seq);
    return { ...row, events };
  });
