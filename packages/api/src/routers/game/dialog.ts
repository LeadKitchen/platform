import {
  asc,
  desc,
  eq,
  GameDialog,
  GameEvaluation,
  GameEvent,
  GameOrder,
  GameProductEvent,
} from "@acme/db";
import { detectCriteria, detectToxicity, resolveExpectation } from "@acme/game";
import { Laminar, observe } from "@lmnr-ai/lmnr";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import {
  requireOwnedDialog,
  requireOwnedOrder,
  requireOwnedSession,
} from "../../game/access";
import {
  appendEvent,
  countActiveOrders,
  loadDialog,
  loadEngine,
  markDialogFinished,
  requireOpenDialog,
  saveEvaluation,
  saveSkillPolicy,
} from "../../game/service";
import { protectedProcedure } from "../../orpc";

function fallbackEmployeeReply(loaded: Awaited<ReturnType<typeof loadDialog>>) {
  const employee = loaded.context.employee;
  const task = loaded.context.task;
  const load = loaded.context.shift.load;
  const lastManagerTurn = loaded.context.turns
    .filter((turn) => turn.role === "manager")
    .at(-1)?.text;

  if (load === "overload" || loaded.context.shift.soloOnShift) {
    return `Понял задачу по заказу «${task.title}». Сейчас я один и нагрузка высокая — помогите расставить приоритеты и зафиксировать контрольную точку, чтобы я ничего не упустил.`;
  }

  if (lastManagerTurn) {
    return `Понял. По задаче «${task.title}» начну работу и сверюсь с вами в обозначенной контрольной точке. Если увижу риск по сроку, сразу сообщу.`;
  }

  return `${employee.name}: понял задачу по заказу «${task.title}». Уточните срок и ожидаемый результат, пожалуйста.`;
}

/**
 * Open a dialog with the employee an order was assigned to.
 *
 * The kitchen state is snapshotted here: queue length and whether the cook is
 * alone on shift. That is what makes round 3 behave differently from round 2
 * for the very same task.
 *
 * @example client.game.dialog.start({ orderId })
 */
export const start = protectedProcedure
  .input(z.object({ orderId: z.uuid() }))
  .handler(async ({ context, input }) => {
    const row = await requireOwnedOrder(
      context.db,
      input.orderId,
      context.session.user.id,
    );
    const [existing] = await context.db
      .select()
      .from(GameDialog)
      .where(eq(GameDialog.orderId, row.order.id))
      .orderBy(desc(GameDialog.startedAt))
      .limit(1);
    if (existing) return existing;

    const engine = await loadEngine(context.db);
    const variantId = row.session.variantId ?? engine.defaultVariantId;
    const round = row.session.round === 3 ? 3 : 2;

    const activeOrders = await countActiveOrders(
      context.db,
      row.session.id,
      row.order.employeeId,
    );

    const dialog = await context.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(GameDialog)
        .values({
          sessionId: row.session.id,
          orderId: row.order.id,
          employeeId: row.order.employeeId,
          taskId: row.order.taskId,
          round,
          variantId,
          activeOrders: Math.max(1, activeOrders),
          soloOnShift: round === 3,
        })
        .returning();
      if (!created) return undefined;
      await tx
        .update(GameOrder)
        .set({ status: "in_progress" })
        .where(eq(GameOrder.id, row.order.id));
      await tx.insert(GameProductEvent).values({
        userId: context.session.user.id,
        sessionId: row.session.id,
        dialogId: created.id,
        name: "dialog_started",
        properties: {
          taskId: row.order.taskId,
          employeeId: row.order.employeeId,
        },
      });
      return created;
    });

    if (!dialog) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Не удалось создать диалог",
      });
    }

    return dialog;
  });

/**
 * Send the manager's utterance (already transcribed by the platform's STT) and
 * get the character's answer.
 *
 * Speech recognition deliberately stays on the platform side: this module
 * works with text, which is what makes it cheap to scale and easy to test.
 *
 * @example client.game.dialog.say({ dialogId, text: "Анна, нужен торт к 19:00" })
 */
export const say = protectedProcedure
  .input(
    z.object({
      dialogId: z.uuid(),
      text: z.string().min(1).max(2000),
    }),
  )
  .handler(async ({ context, input, signal }) => {
    await requireOwnedDialog(
      context.db,
      input.dialogId,
      context.session.user.id,
    );
    const loaded = await requireOpenDialog(context.db, input.dialogId);
    const engine = await loadEngine(context.db);
    const pipeline = engine.pipeline(loaded.record.variantId);

    // Записываем реплику руководителя ДО обращения к модели: если модель
    // упадёт (сеть, 5xx, refusal), реплика всё равно останется в логе диалога,
    // а не потеряется вместе с ошибкой.
    const managerToxic = detectToxicity(input.text);
    await appendEvent(context.db, input.dialogId, "manager_utterance", {
      text: input.text,
      toxic: managerToxic,
    });

    let turn: Awaited<ReturnType<typeof pipeline.respond>>;
    try {
      turn = await observe(
        {
          name: "game.dialog.say",
          userId: context.session.user.id,
          sessionId: input.dialogId,
          metadata: { variantId: loaded.record.variantId },
        },
        async () => {
          Laminar.setTraceUserId(context.session.user.id);
          Laminar.setTraceSessionId(input.dialogId);
          return pipeline.respond({
            dialog: loaded.context,
            utterance: input.text,
            signal,
          });
        },
      );
    } catch (cause) {
      if (signal?.aborted) {
        await appendEvent(context.db, input.dialogId, "error", {
          stage: "persona",
          message: "Ответ остановлен игроком",
          recovered: false,
          aborted: true,
        });
        throw cause;
      }
      const fallbackReply = fallbackEmployeeReply(loaded);
      await appendEvent(context.db, input.dialogId, "error", {
        stage: "persona",
        message: cause instanceof Error ? cause.message : String(cause),
        recovered: true,
      });
      await appendEvent(context.db, input.dialogId, "employee_reply", {
        text: fallbackReply,
        understood: loaded.context.task.title,
        readiness: "unsure",
        requests: ["Уточнить срок и контрольную точку"],
        confirmsCheckpoints: false,
        fallback: true,
      });

      await context.db
        .update(GameDialog)
        .set({ engaged: true })
        .where(eq(GameDialog.id, input.dialogId));

      return {
        silent: false,
        reply: fallbackReply,
        understood: loaded.context.task.title,
        readiness: "unsure" as const,
        requests: ["Уточнить срок и контрольную точку"],
        confirmsCheckpoints: false,
        engaged: true,
        emotion: loaded.context.emotion,
        managerToxic,
        degraded: true,
      };
    }

    if (turn.reply.silent) {
      await appendEvent(context.db, input.dialogId, "employee_silent", {
        reason: "не включён в диалог",
      });
    } else {
      await appendEvent(context.db, input.dialogId, "employee_reply", {
        text: turn.reply.reply,
        understood: turn.reply.understood,
        readiness: turn.reply.readiness,
        requests: turn.reply.requests,
        confirmsCheckpoints: turn.reply.confirmsCheckpoints,
        telemetry: turn.telemetry,
      });
    }

    await context.db
      .update(GameDialog)
      .set({ engaged: turn.dialog.engaged, emotion: turn.dialog.emotion })
      .where(eq(GameDialog.id, input.dialogId));

    return {
      silent: turn.reply.silent,
      reply: turn.reply.reply,
      understood: turn.reply.understood,
      readiness: turn.reply.readiness,
      requests: turn.reply.requests,
      confirmsCheckpoints: turn.reply.confirmsCheckpoints,
      engaged: turn.dialog.engaged,
      emotion: turn.dialog.emotion,
      managerToxic: turn.managerToxic,
    };
  });

/**
 * Finish the dialog and score it.
 *
 * The evaluation is written once per dialog and carries the variant plus the
 * cost/latency of the whole conversation, which is what the admin analytics
 * aggregates over.
 *
 * @example client.game.dialog.finish({ dialogId })
 */
export const finish = protectedProcedure
  .input(z.object({ dialogId: z.uuid() }))
  .handler(async ({ context, input }) => {
    await requireOwnedDialog(
      context.db,
      input.dialogId,
      context.session.user.id,
    );
    const loaded = await requireOpenDialog(context.db, input.dialogId);
    const engine = await loadEngine(context.db);
    const pipeline = engine.pipeline(loaded.record.variantId);

    const result = await observe(
      {
        name: "game.dialog.finish",
        userId: context.session.user.id,
        sessionId: input.dialogId,
        metadata: { variantId: loaded.record.variantId },
      },
      async () => {
        Laminar.setTraceUserId(context.session.user.id);
        Laminar.setTraceSessionId(input.dialogId);
        return pipeline.evaluate(loaded.context);
      },
    );

    // Sum what the conversation itself cost, then add the scoring call.
    const events = await context.db
      .select()
      .from(GameEvent)
      .where(eq(GameEvent.dialogId, input.dialogId));

    let latencyMs = result.latencyMs;
    let inputTokens = result.usage?.inputTokens ?? 0;
    let outputTokens = result.usage?.outputTokens ?? 0;
    let costUsd = result.costUsd;
    const turnMeta: Record<string, unknown>[] = [];

    for (const event of events) {
      const telemetry = event.payload.telemetry as
        | {
            totalMs?: number;
            costUsd?: number;
            usage?: { inputTokens?: number; outputTokens?: number };
            meta?: Record<string, unknown>;
          }
        | undefined;
      if (!telemetry) continue;
      latencyMs += telemetry.totalMs ?? 0;
      costUsd += telemetry.costUsd ?? 0;
      inputTokens += telemetry.usage?.inputTokens ?? 0;
      outputTokens += telemetry.usage?.outputTokens ?? 0;
      if (telemetry.meta) turnMeta.push(telemetry.meta);
    }

    // Feed the outcome back to learning persona strategies (e.g. skill-rl).
    // There is no expert label in production, so `scorePercent` — how well
    // the methodology's own rubric scored this dialog — is the best available
    // proxy for "was this a good episode". Strategies without a `learn` hook
    // ignore this.
    await pipeline.learn({
      dialogId: input.dialogId,
      variantId: loaded.record.variantId,
      evaluation: result.evaluation,
      reward: Math.max(0, Math.min(1, result.evaluation.scorePercent / 100)),
      turnMeta,
    });
    await saveSkillPolicy(context.db);

    await saveEvaluation(context.db, {
      dialogId: input.dialogId,
      variantId: loaded.record.variantId,
      evaluation: result.evaluation,
      latencyMs,
      inputTokens,
      outputTokens,
      costUsd,
      scorecard: loaded.context.evaluationScorecard,
    });

    await appendEvent(context.db, input.dialogId, "evaluation", {
      scorePercent: result.evaluation.scorePercent,
      expectedStyle: result.evaluation.expectedStyle,
      actualStyle: result.evaluation.actualStyle,
    });

    await markDialogFinished(context.db, input.dialogId);
    await context.db
      .update(GameOrder)
      .set({
        status:
          result.evaluation.outcome.status === "failed" ? "failed" : "done",
      })
      .where(eq(GameOrder.id, loaded.record.orderId));
    await context.db
      .insert(GameProductEvent)
      .values({
        userId: context.session.user.id,
        sessionId: loaded.record.sessionId,
        dialogId: input.dialogId,
        name: "dialog_completed",
        properties: { score: result.evaluation.scorePercent },
      })
      .catch(() => undefined);

    return {
      evaluation: result.evaluation,
      variantId: loaded.record.variantId,
      telemetry: { latencyMs, inputTokens, outputTokens, costUsd },
    };
  });

export const preflight = protectedProcedure
  .input(z.object({ dialogId: z.uuid() }))
  .handler(async ({ context, input }) => {
    await requireOwnedDialog(
      context.db,
      input.dialogId,
      context.session.user.id,
    );
    const loaded = await requireOpenDialog(context.db, input.dialogId);
    const expectation = resolveExpectation(
      loaded.context.employee,
      loaded.context.task,
      loaded.context.shift,
    );
    const met = detectCriteria(loaded.context.turns);
    const criteria = expectation.requiredCriteria.map((criterion) => ({
      id: criterion.id,
      title: criterion.title,
      met: met.has(criterion.id),
    }));
    const critical = new Set([
      "clarify_task",
      "set_deadline",
      "check_understanding",
    ]);
    const missingCritical = criteria.filter(
      (criterion) => critical.has(criterion.id) && !criterion.met,
    );
    return {
      ready: missingCritical.length === 0,
      criteria,
      missingCritical,
      managerTurns: loaded.context.turns.filter(
        (turn) => turn.role === "manager",
      ).length,
    };
  });

export const replay = protectedProcedure
  .input(z.object({ dialogId: z.uuid() }))
  .handler(async ({ context, input }) => {
    const owned = await requireOwnedDialog(
      context.db,
      input.dialogId,
      context.session.user.id,
    );
    const [sourceOrder] = await context.db
      .select()
      .from(GameOrder)
      .where(eq(GameOrder.id, owned.dialog.orderId))
      .limit(1);
    if (!sourceOrder) {
      throw new ORPCError("NOT_FOUND", { message: "Исходный заказ не найден" });
    }
    const activeOrders = await countActiveOrders(
      context.db,
      owned.session.id,
      sourceOrder.employeeId,
    );
    const dialog = await context.db.transaction(async (tx) => {
      const [order] = await tx
        .insert(GameOrder)
        .values({
          sessionId: sourceOrder.sessionId,
          taskId: sourceOrder.taskId,
          employeeId: sourceOrder.employeeId,
          portions: sourceOrder.portions,
          deadlineMinutes: sourceOrder.deadlineMinutes,
          notes: sourceOrder.notes,
          status: "in_progress",
        })
        .returning();
      if (!order) throw new Error("Не удалось повторить заказ");
      const [created] = await tx
        .insert(GameDialog)
        .values({
          sessionId: owned.session.id,
          orderId: order.id,
          employeeId: order.employeeId,
          taskId: order.taskId,
          round: owned.dialog.round,
          variantId: owned.dialog.variantId,
          activeOrders: Math.max(1, activeOrders + 1),
          soloOnShift: owned.dialog.soloOnShift,
        })
        .returning();
      if (created) {
        await tx.insert(GameProductEvent).values({
          userId: context.session.user.id,
          sessionId: owned.session.id,
          dialogId: input.dialogId,
          name: "situation_replayed",
          properties: { newDialogId: created.id },
        });
      }
      return created;
    });
    if (!dialog) throw new Error("Не удалось открыть повторный разговор");
    return dialog;
  });

/**
 * Dialog with its full transcript and score.
 *
 * @example client.game.dialog.byId({ dialogId })
 */
export const byId = protectedProcedure
  .input(z.object({ dialogId: z.uuid() }))
  .handler(async ({ context, input }) => {
    await requireOwnedDialog(
      context.db,
      input.dialogId,
      context.session.user.id,
    );
    const loaded = await loadDialog(context.db, input.dialogId);

    const [evaluation] = await context.db
      .select()
      .from(GameEvaluation)
      .where(eq(GameEvaluation.dialogId, input.dialogId))
      .limit(1);

    const events = await context.db
      .select()
      .from(GameEvent)
      .where(eq(GameEvent.dialogId, input.dialogId))
      .orderBy(asc(GameEvent.seq));

    return {
      dialog: loaded.record,
      employee: loaded.context.employee,
      task: loaded.context.task,
      shift: loaded.context.shift,
      turns: loaded.context.turns,
      emotion: loaded.context.emotion,
      engaged: loaded.context.engaged,
      events,
      evaluation: evaluation ?? null,
    };
  });

/**
 * Dialogs of a session, newest first.
 *
 * @example client.game.dialog.list({ sessionId })
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
      .select({ dialog: GameDialog, evaluation: GameEvaluation })
      .from(GameDialog)
      .leftJoin(GameEvaluation, eq(GameEvaluation.dialogId, GameDialog.id))
      .where(eq(GameDialog.sessionId, input.sessionId))
      .orderBy(desc(GameDialog.startedAt));
  });

/**
 * Cheap guardrail the platform can call before sending audio transcripts on,
 * so an abusive utterance never reaches the model at all.
 *
 * @example client.game.dialog.screen({ text })
 */
export const screen = protectedProcedure
  .input(z.object({ text: z.string().max(2000) }))
  .handler(({ input }) => ({ toxic: detectToxicity(input.text) }));

export const gameDialogRouter = {
  start,
  say,
  finish,
  preflight,
  replay,
  byId,
  list,
  screen,
};
