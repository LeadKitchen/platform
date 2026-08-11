#!/usr/bin/env bun
/**
 * Seed the reference data for the business game.
 *
 * The catalog and the experiment variants live in code (`@acme/game`,
 * `@acme/ai`) so tests and the offline harness cannot drift from production;
 * this script copies them into Postgres, where the administrator can edit
 * them afterwards. Re-running is safe: rows are upserted, never duplicated,
 * and administrator edits to names/descriptions are preserved for variants
 * that already exist.
 */
import { BUILT_IN_VARIANTS } from "@acme/ai";
import { db, GameEmployee, GameTask, GameVariant } from "@acme/db";
import { EMPLOYEES, TASKS } from "@acme/game";

async function main(): Promise<void> {
  for (const employee of EMPLOYEES) {
    await db
      .insert(GameEmployee)
      .values({
        id: employee.id,
        name: employee.name,
        role: employee.role,
        level: employee.level,
        competences: employee.competences,
        personality: employee.personality as unknown as Record<string, unknown>,
      })
      .onConflictDoUpdate({
        target: GameEmployee.id,
        set: {
          name: employee.name,
          role: employee.role,
          level: employee.level,
          competences: employee.competences,
          personality: employee.personality as unknown as Record<
            string,
            unknown
          >,
        },
      });
  }
  console.log(`Сотрудники: ${EMPLOYEES.length}`);

  for (const task of TASKS) {
    await db
      .insert(GameTask)
      .values({
        id: task.id,
        title: task.title,
        type: task.type,
        complexity: task.complexity,
        timeCriticality: task.timeCriticality,
        requiresCheckpoints: task.requiresCheckpoints,
        failureModes: task.failureModes,
      })
      .onConflictDoUpdate({
        target: GameTask.id,
        set: {
          title: task.title,
          type: task.type,
          complexity: task.complexity,
          timeCriticality: task.timeCriticality,
          requiresCheckpoints: task.requiresCheckpoints,
          failureModes: task.failureModes,
        },
      });
  }
  console.log(`Задачи: ${TASKS.length}`);

  for (const variant of BUILT_IN_VARIANTS) {
    await db
      .insert(GameVariant)
      .values({
        id: variant.id,
        name: variant.name,
        description: variant.description,
        engagement: variant.engagement,
        knowledge: variant.knowledge,
        persona: variant.persona,
        evaluation: variant.evaluation,
        model: variant.model ?? null,
        effort: variant.effort ?? null,
        params: variant.params,
      })
      .onConflictDoUpdate({
        target: GameVariant.id,
        // Stage wiring is code-owned; naming and rollout knobs stay editable.
        set: {
          engagement: variant.engagement,
          knowledge: variant.knowledge,
          persona: variant.persona,
          evaluation: variant.evaluation,
        },
      });
  }
  console.log(`Варианты: ${BUILT_IN_VARIANTS.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
