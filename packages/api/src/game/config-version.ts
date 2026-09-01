import { createHash } from "node:crypto";
import {
  type Database,
  GameConfigVersion,
  GameEmployee,
  GameSettings,
  GameTask,
  GameVariant,
  inArray,
  sql,
} from "@acme/db";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface ConfigSnapshot {
  settings: {
    defaultVariantId: string | null;
    defaultRound: number;
    defaultDeadlineMinutes: number;
    allowRoundThree: boolean;
    maxActiveSessions: number;
  };
  employees: Array<typeof GameEmployee.$inferSelect>;
  tasks: Array<typeof GameTask.$inferSelect>;
  variants: Array<typeof GameVariant.$inferSelect>;
}

export async function loadConfigSnapshot(
  db: Pick<Database, "select">,
): Promise<ConfigSnapshot> {
  const [settingsRows, employees, tasks, variants] = await Promise.all([
    db.select().from(GameSettings),
    db.select().from(GameEmployee),
    db.select().from(GameTask),
    db.select().from(GameVariant),
  ]);
  const settings = settingsRows[0];
  return {
    settings: settings
      ? {
          defaultVariantId: settings.defaultVariantId,
          defaultRound: settings.defaultRound,
          defaultDeadlineMinutes: settings.defaultDeadlineMinutes,
          allowRoundThree: settings.allowRoundThree,
          maxActiveSessions: settings.maxActiveSessions,
        }
      : {
          defaultVariantId: null,
          defaultRound: 2,
          defaultDeadlineMinutes: 60,
          allowRoundThree: true,
          maxActiveSessions: 20,
        },
    employees,
    tasks,
    variants,
  };
}

export interface ConfigChange {
  path: string;
  before: unknown;
  after: unknown;
}

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    const items = value.map(canonical);
    return items.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof (item as { id?: unknown }).id === "string",
    )
      ? items.sort((left, right) =>
          String((left as { id: string }).id).localeCompare(
            String((right as { id: string }).id),
          ),
        )
      : items;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

function stable(value: unknown): string {
  return JSON.stringify(canonical(value));
}

export function configRevision(snapshot: ConfigSnapshot): string {
  return createHash("sha256").update(stable(snapshot)).digest("hex");
}

/** Serialize every configuration writer for the duration of its transaction. */
export async function lockConfig(tx: Transaction): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(873104221)`);
}

export function diffSnapshots(
  before: ConfigSnapshot,
  after: ConfigSnapshot,
): ConfigChange[] {
  const changes: ConfigChange[] = [];
  const compare = (path: string, oldValue: unknown, newValue: unknown) => {
    if (stable(oldValue) !== stable(newValue)) {
      changes.push({ path, before: oldValue, after: newValue });
    }
  };

  for (const key of Object.keys(before.settings) as Array<
    keyof ConfigSnapshot["settings"]
  >) {
    compare(`settings.${key}`, before.settings[key], after.settings[key]);
  }

  for (const [kind, oldRows, newRows] of [
    ["employees", before.employees, after.employees],
    ["tasks", before.tasks, after.tasks],
    ["variants", before.variants, after.variants],
  ] as const) {
    const oldMap = new Map(oldRows.map((row) => [row.id, row]));
    const newMap = new Map(newRows.map((row) => [row.id, row]));
    for (const id of new Set([...oldMap.keys(), ...newMap.keys()])) {
      compare(`${kind}.${id}`, oldMap.get(id) ?? null, newMap.get(id) ?? null);
    }
  }
  return changes;
}

export async function mutateConfig<T>(
  db: Database,
  meta: { actorId: string; source: string; summary: string },
  mutation: (tx: Transaction, before: ConfigSnapshot) => Promise<T>,
): Promise<{ result: T; versionId: string; changes: ConfigChange[] }> {
  return db.transaction(async (tx) => {
    await lockConfig(tx);
    const before = await loadConfigSnapshot(tx);
    const result = await mutation(tx, before);
    const after = await loadConfigSnapshot(tx);
    const [version] = await tx
      .insert(GameConfigVersion)
      .values({
        actorId: meta.actorId,
        source: meta.source,
        summary: meta.summary,
        beforeSnapshot: before as unknown as Record<string, unknown>,
        afterSnapshot: after as unknown as Record<string, unknown>,
      })
      .returning({ id: GameConfigVersion.id });
    if (!version) throw new Error("Не удалось записать версию конфигурации");
    return {
      result,
      versionId: version.id,
      changes: diffSnapshots(before, after),
    };
  });
}

export async function restoreSnapshot(
  tx: Transaction,
  snapshot: ConfigSnapshot,
): Promise<void> {
  const current = await loadConfigSnapshot(tx);
  await tx
    .insert(GameSettings)
    .values({ id: "global", ...snapshot.settings })
    .onConflictDoUpdate({ target: GameSettings.id, set: snapshot.settings });

  for (const employee of snapshot.employees) {
    const values = {
      id: employee.id,
      name: employee.name,
      role: employee.role,
      level: employee.level,
      gender: employee.gender,
      competences: employee.competences,
      personality: employee.personality,
      isActive: employee.isActive,
    };
    await tx
      .insert(GameEmployee)
      .values(values)
      .onConflictDoUpdate({ target: GameEmployee.id, set: values });
  }
  for (const task of snapshot.tasks) {
    const values = {
      id: task.id,
      title: task.title,
      type: task.type,
      complexity: task.complexity,
      timeCriticality: task.timeCriticality,
      requiresCheckpoints: task.requiresCheckpoints,
      failureModes: task.failureModes,
      isActive: task.isActive,
    };
    await tx
      .insert(GameTask)
      .values(values)
      .onConflictDoUpdate({ target: GameTask.id, set: values });
  }
  for (const variant of snapshot.variants) {
    const values = {
      id: variant.id,
      name: variant.name,
      description: variant.description,
      engagement: variant.engagement,
      knowledge: variant.knowledge,
      persona: variant.persona,
      evaluation: variant.evaluation,
      model: variant.model,
      effort: variant.effort,
      params: variant.params,
      isActive: variant.isActive,
      weight: variant.weight,
    };
    await tx
      .insert(GameVariant)
      .values(values)
      .onConflictDoUpdate({ target: GameVariant.id, set: values });
  }

  const missingEmployees = current.employees
    .filter((row) => !snapshot.employees.some((item) => item.id === row.id))
    .map((row) => row.id);
  const missingTasks = current.tasks
    .filter((row) => !snapshot.tasks.some((item) => item.id === row.id))
    .map((row) => row.id);
  const missingVariants = current.variants
    .filter((row) => !snapshot.variants.some((item) => item.id === row.id))
    .map((row) => row.id);
  if (missingEmployees.length > 0) {
    await tx
      .update(GameEmployee)
      .set({ isActive: false })
      .where(inArray(GameEmployee.id, missingEmployees));
  }
  if (missingTasks.length > 0) {
    await tx
      .update(GameTask)
      .set({ isActive: false })
      .where(inArray(GameTask.id, missingTasks));
  }
  if (missingVariants.length > 0) {
    await tx
      .update(GameVariant)
      .set({ isActive: false })
      .where(inArray(GameVariant.id, missingVariants));
  }
}
