import {
  createEngine,
  createProviderFromEnv,
  type Engine,
  type SkillStats,
  skillRlStore,
  type VariantConfig,
} from "@acme/ai";
import {
  asc,
  type Database,
  eq,
  GameDialog,
  GameEmployee,
  GameEvaluation,
  GameEvent,
  GameOrder,
  GameSession,
  GameSkillPolicy,
  GameTask,
  GameVariant,
  sql,
} from "@acme/db";
import {
  type Catalog,
  type CompetenceState,
  type DialogContext,
  type DialogTurn,
  defaultCatalog,
  type Employee,
  type EmployeeLevel,
  type GameRound,
  resolveShiftLoad,
  type Task,
} from "@acme/game";
import { ORPCError } from "@orpc/server";
import { applyRoleplayScenario, resolveRoleplayScenario } from "./roleplay";
import { scorecardCriteria } from "./scorecards";

/**
 * Glue between the persisted game state and the stateless AI engine.
 *
 * The engine never touches the database: the API loads a `DialogContext`,
 * hands it over, and writes back both the projection and the raw event. That
 * separation is what lets the same engine run inside the web platform, inside
 * a batch replay, or behind whatever integration format the customer's
 * platform ends up using.
 */

/** The provider owns an HTTP client, so it is created once per process. */
let cachedProvider: ReturnType<typeof createProviderFromEnv> | undefined;

function provider() {
  cachedProvider ??= createProviderFromEnv();
  return cachedProvider;
}

/**
 * Hydrate the shared `skill-rl` bandit from the database.
 *
 * `skillRlStore` (the store behind the `skillRlPersona` singleton in
 * `@acme/ai`) otherwise lives only in process memory — a restart resets every
 * (context, skill) value to the optimistic default and the "обучаемая
 * политика" the variant is named after never actually learns anything in
 * production. Runs once per process; `saveSkillPolicy` keeps the table in
 * sync afterwards so the next cold start (or another instance) picks up
 * where this one left off.
 */
let skillPolicyHydrated: Promise<void> | undefined;

function hydrateSkillPolicy(db: Database): Promise<void> {
  skillPolicyHydrated ??= (async () => {
    const rows = await db.select().from(GameSkillPolicy);
    const snapshot: Record<string, SkillStats> = {};
    for (const row of rows) {
      snapshot[row.key] = { value: row.value, count: row.count };
    }
    skillRlStore.load(snapshot);
  })();
  return skillPolicyHydrated;
}

/** Persist the current bandit state after a dialog fed it a reward. */
export async function saveSkillPolicy(db: Database): Promise<void> {
  const snapshot = skillRlStore.snapshot();
  const entries = Object.entries(snapshot);
  if (entries.length === 0) return;

  await db
    .insert(GameSkillPolicy)
    .values(
      entries.map(([key, stats]) => ({
        key,
        value: stats.value,
        count: stats.count,
      })),
    )
    .onConflictDoUpdate({
      target: GameSkillPolicy.key,
      set: {
        value: sql`excluded.value`,
        count: sql`excluded.count`,
        updatedAt: sql`now()`,
      },
    });
}

export async function loadCatalog(db: Database): Promise<Catalog> {
  const [employees, tasks] = await Promise.all([
    db.select().from(GameEmployee).where(eq(GameEmployee.isActive, true)),
    db.select().from(GameTask).where(eq(GameTask.isActive, true)),
  ]);

  // Before the seed has run there is nothing in the tables; falling back to the
  // code catalog keeps a fresh checkout playable.
  if (employees.length === 0 || tasks.length === 0) return defaultCatalog;

  return {
    employees: employees.map(
      (row): Employee => ({
        id: row.id,
        name: row.name,
        role: row.role,
        level: row.level as EmployeeLevel,
        gender: row.gender,
        competences: row.competences as Record<string, CompetenceState>,
        personality: row.personality as unknown as Employee["personality"],
      }),
    ),
    tasks: tasks.map(
      (row): Task => ({
        id: row.id,
        title: row.title,
        type: row.type,
        complexity: row.complexity as Task["complexity"],
        timeCriticality: row.timeCriticality as Task["timeCriticality"],
        requiresCheckpoints: row.requiresCheckpoints,
        failureModes: row.failureModes,
      }),
    ),
  };
}

/**
 * `activeOnly` (default `true`) is for surfaces that *offer* a variant to
 * choose from, e.g. the session-creation form.
 *
 * Pass `false` when *resolving* a variant a dialog already runs on: a session
 * commits to a variant at creation time, and deactivating that variant later
 * (to stop offering it for new sessions) must not break dialogs already in
 * progress on it.
 */
export async function loadVariants(
  db: Database,
  options: { activeOnly?: boolean } = {},
): Promise<VariantConfig[]> {
  const activeOnly = options.activeOnly ?? true;
  const rows = await db
    .select()
    .from(GameVariant)
    .where(activeOnly ? eq(GameVariant.isActive, true) : undefined);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    engagement: row.engagement,
    knowledge: row.knowledge,
    persona: row.persona,
    evaluation: row.evaluation,
    model: row.model ?? undefined,
    effort: (row.effort ?? undefined) as VariantConfig["effort"],
    params: row.params,
  }));
}

export async function loadEngine(db: Database): Promise<Engine> {
  // Pipelines resolve variants for dialogs that may have started under a
  // variant since deactivated — load every variant, not just the active ones.
  const [catalog, variants] = await Promise.all([
    loadCatalog(db),
    loadVariants(db, { activeOnly: false }),
    hydrateSkillPolicy(db),
  ]);
  return createEngine({ provider: provider(), catalog, variants });
}

/**
 * Re-check that a resolved variant is still active right before the write
 * that assigns it to a new session, closing the window between reading the
 * admin's default variant and inserting the row during which it could have
 * been disabled. Falls back to the engine's built-in default if it was.
 *
 * `FOR UPDATE` locks the variant row for the rest of this transaction, so it
 * lines up with `setActive`/`upsert`'s own row-locking update: whichever of
 * the two commits first, the other sees a consistent, not a stale, value.
 */
export async function resolveLiveVariantId(
  tx: Database,
  variantId: string,
  fallbackVariantId: string,
): Promise<string> {
  const [row] = await tx
    .select({ isActive: GameVariant.isActive })
    .from(GameVariant)
    .where(eq(GameVariant.id, variantId))
    .limit(1)
    .for("update");
  return row?.isActive === false ? fallbackVariantId : variantId;
}

export interface DialogRecord {
  id: string;
  sessionId: string;
  orderId: string;
  variantId: string;
  status: string;
  round: number;
}

export interface LoadedDialog {
  record: DialogRecord;
  context: DialogContext;
  /** Highest `seq` written so far, so the next append is contiguous. */
  lastSeq: number;
}

const TURN_EVENTS = new Set(["manager_utterance", "employee_reply"]);

export async function loadDialog(
  db: Database,
  dialogId: string,
): Promise<LoadedDialog> {
  const [row] = await db
    .select({
      dialog: GameDialog,
      order: GameOrder,
      session: GameSession,
    })
    .from(GameDialog)
    .innerJoin(GameOrder, eq(GameOrder.id, GameDialog.orderId))
    .innerJoin(GameSession, eq(GameSession.id, GameDialog.sessionId))
    .where(eq(GameDialog.id, dialogId))
    .limit(1);

  if (!row) throw new ORPCError("NOT_FOUND", { message: "Диалог не найден" });

  const catalog = await loadCatalog(db);
  let employee = catalog.employees.find(
    (item) => item.id === row.dialog.employeeId,
  );
  let task = catalog.tasks.find((item) => item.id === row.dialog.taskId);
  if (!employee || !task) {
    throw new ORPCError("NOT_FOUND", {
      message: "Справочник сотрудников или задач изменился",
    });
  }

  if (row.session.roleplayScenarioId) {
    const scenario =
      row.session.roleplayScenarioSnapshot ??
      (await resolveRoleplayScenario(
        db,
        catalog,
        row.session.roleplayScenarioId,
      ));
    const applied = applyRoleplayScenario(scenario, employee, task);
    employee = applied.employee;
    task = applied.task;
  }

  const events = await db
    .select()
    .from(GameEvent)
    .where(eq(GameEvent.dialogId, dialogId))
    .orderBy(asc(GameEvent.seq));

  const turns: DialogTurn[] = [];
  for (const event of events) {
    if (!TURN_EVENTS.has(event.type)) continue;
    const text = String(event.payload.text ?? "");
    if (text.length === 0) continue;
    turns.push({
      role: event.type === "manager_utterance" ? "manager" : "employee",
      text,
      at: event.createdAt.toISOString(),
    });
  }

  const round = (row.dialog.round === 3 ? 3 : 2) as GameRound;

  return {
    record: {
      id: row.dialog.id,
      sessionId: row.dialog.sessionId,
      orderId: row.dialog.orderId,
      variantId: row.dialog.variantId,
      status: row.dialog.status,
      round,
    },
    lastSeq: events.at(-1)?.seq ?? 0,
    context: {
      employee,
      task,
      order: {
        id: row.order.id,
        taskId: row.order.taskId,
        employeeId: row.order.employeeId,
        portions: row.order.portions,
        deadlineMinutes: row.order.deadlineMinutes,
        notes: row.order.notes ?? undefined,
      },
      shift: {
        round,
        activeOrders: row.dialog.activeOrders,
        soloOnShift: row.dialog.soloOnShift,
        load: resolveShiftLoad(row.dialog.activeOrders, row.dialog.soloOnShift),
      },
      turns,
      engaged: row.dialog.engaged,
      emotion: row.dialog.emotion,
      ...(row.session.scorecardSnapshot
        ? {
            evaluationCriteria: scorecardCriteria(
              row.session.scorecardSnapshot,
            ),
            evaluationScorecard: {
              id: row.session.scorecardSnapshot.id,
              name: row.session.scorecardSnapshot.name,
            },
          }
        : {}),
    },
  };
}

/**
 * Append to the event log.
 *
 * `seq` is derived inside the statement so two concurrent writers cannot
 * silently collapse onto the same position — the unique index rejects the
 * loser instead of dropping a turn.
 */
export async function appendEvent(
  db: Database,
  dialogId: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.insert(GameEvent).values({
    dialogId,
    type,
    payload,
    seq: sql`(select coalesce(max(${GameEvent.seq}), 0) + 1 from ${GameEvent} where ${GameEvent.dialogId} = ${dialogId})`,
  });
}

/**
 * How many orders this employee already has open in the session.
 *
 * Only `queued`/`in_progress` count as active — `done` and `failed` are both
 * terminal. Counting `<> 'done'` would leave failed orders in the queue
 * forever and permanently inflate the shift load computed from this number.
 */
export async function countActiveOrders(
  db: Database,
  sessionId: string,
  employeeId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(GameOrder)
    .where(
      sql`${GameOrder.sessionId} = ${sessionId} and ${GameOrder.employeeId} = ${employeeId} and ${GameOrder.status} in ('queued', 'in_progress')`,
    );

  return row?.count ?? 0;
}

export async function saveEvaluation(
  db: Database,
  args: {
    dialogId: string;
    variantId: string;
    evaluation: import("@acme/game").Evaluation;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    scorecard?: { id: string; name: string };
  },
): Promise<void> {
  const values = {
    dialogId: args.dialogId,
    variantId: args.variantId,
    scorecardId: args.scorecard?.id,
    scorecardName: args.scorecard?.name,
    scorePercent: args.evaluation.scorePercent,
    expectedStyle: args.evaluation.expectedStyle,
    actualStyle: args.evaluation.actualStyle,
    styleDistribution: args.evaluation.styleDistribution,
    criteria: args.evaluation.criteria,
    outcome: args.evaluation.outcome as unknown as Record<string, unknown>,
    breakdown: args.evaluation.breakdown as unknown as Record<string, number>,
    summary: args.evaluation.summary,
    latencyMs: args.latencyMs,
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    costUsd: args.costUsd,
  };

  await db
    .insert(GameEvaluation)
    .values(values)
    .onConflictDoUpdate({ target: GameEvaluation.dialogId, set: values });
}

export async function requireOpenDialog(
  db: Database,
  dialogId: string,
): Promise<LoadedDialog> {
  const loaded = await loadDialog(db, dialogId);
  if (loaded.record.status !== "active") {
    throw new ORPCError("BAD_REQUEST", { message: "Диалог уже завершён" });
  }
  return loaded;
}

export async function markDialogFinished(
  db: Database,
  dialogId: string,
): Promise<void> {
  await db
    .update(GameDialog)
    .set({ status: "finished", endedAt: new Date() })
    .where(eq(GameDialog.id, dialogId));
}
