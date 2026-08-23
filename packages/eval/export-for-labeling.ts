/**
 * Exports CORE_FIXTURES (or ALL_FIXTURES with --extended) as a blind review
 * sheet for a human methodologist: full situation card and script, with NO
 * hint of what the pipeline expects or scored — no `expectedStyle`, no
 * generator score. Filling in `expectedStyle` would let the reviewer confirm
 * the model instead of testing it against it, which defeats the point of an
 * expert label.
 *
 * Usage:
 *   bun run export-for-labeling.ts [--extended] [--out reports/labeling/core-blind.csv]
 *
 * Fill in the blank columns (actual_style, met_*, expert_score, comment) and
 * re-import with `bun run import-labels.ts <file>`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  COMPETENCE_LABELS,
  CRITERIA,
  competenceFor,
  defaultCatalog,
  findEmployee,
  findTask,
  resolveShiftLoad,
  TASK_TYPES,
} from "@acme/game";

import { ALL_FIXTURES, CORE_FIXTURES } from "./src/fixtures";

const CRITERION_IDS = Object.keys(CRITERIA) as (keyof typeof CRITERIA)[];

function csvField(value: string | number | boolean): string {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function parseArgs(argv: string[]) {
  const extended = argv.includes("--extended");
  const outIndex = argv.indexOf("--out");
  const out =
    outIndex >= 0 && argv[outIndex + 1]
      ? (argv[outIndex + 1] as string)
      : `reports/labeling/${extended ? "all" : "core"}-blind.csv`;
  return { extended, out };
}

async function main(): Promise<void> {
  const { extended, out } = parseArgs(process.argv.slice(2));
  const fixtures = extended ? ALL_FIXTURES : CORE_FIXTURES;

  const readonlyColumns = [
    "id",
    "round",
    "active_orders",
    "solo_on_shift",
    "load",
    "employee_name",
    "employee_role",
    "employee_level",
    "task_title",
    "task_type",
    "task_complexity",
    "task_time_criticality",
    "requires_checkpoints",
    "employee_competence_for_task",
    "script",
  ];
  const fillColumns = [
    "actual_style",
    ...CRITERION_IDS.map((id) => `met_${id}`),
    "expert_score",
    "comment",
  ];
  const header = [...readonlyColumns, ...fillColumns];

  const rows: string[] = [header.map(csvField).join(",")];

  for (const fixture of fixtures) {
    const employee = findEmployee(defaultCatalog, fixture.employeeId);
    const task = findTask(defaultCatalog, fixture.taskId);
    if (!employee || !task) {
      throw new Error(
        `справочник не содержит ${fixture.employeeId}/${fixture.taskId}`,
      );
    }
    const load = resolveShiftLoad(fixture.activeOrders, fixture.soloOnShift);
    const competence = competenceFor(employee, task);

    const script = fixture.script
      .map((line, index) => `${index + 1}. ${line}`)
      .join("\n");

    const values: (string | number | boolean)[] = [
      fixture.id,
      fixture.round,
      fixture.activeOrders,
      fixture.soloOnShift ? "да" : "нет",
      load,
      employee.name,
      employee.role,
      employee.level,
      task.title,
      TASK_TYPES[task.type],
      task.complexity,
      task.timeCriticality,
      task.requiresCheckpoints ? "да" : "нет",
      COMPETENCE_LABELS[competence],
      script,
      ...fillColumns.map(() => ""),
    ];

    rows.push(values.map(csvField).join(","));
  }

  const path = resolve(out);
  await mkdir(dirname(path), { recursive: true });
  // Excel needs a BOM to detect UTF-8 correctly; Sheets/LibreOffice don't mind it.
  await writeFile(path, `﻿${rows.join("\r\n")}\r\n`, "utf8");

  console.log(`Экспортировано ${fixtures.length} сценариев: ${path}`);
  console.log("");
  console.log("Для эксперта:");
  console.log(
    "- actual_style: один из directive / coaching / supporting / delegating —",
  );
  console.log("  какой стиль руководитель реально применил, на ваш взгляд.");
  console.log(
    "- met_<критерий>: «да», если руководитель это действие выполнил",
  );
  console.log(
    "  (список критериев и формулировок — packages/game/src/criteria.ts).",
  );
  console.log(
    "- expert_score: 0–100, ваша целостная оценка по опыту ведущего —",
  );
  console.log(
    "  не пересчёт формулы, а то, как вы оценили бы этот диалог вживую.",
  );
  console.log(
    "- Столбцы слева — только для контекста. Строка не содержит ожидаемого",
  );
  console.log(
    "  стиля и авто-оценки намеренно: если их видно, разметка перестаёт",
  );
  console.log("  быть независимой проверкой методологии.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
