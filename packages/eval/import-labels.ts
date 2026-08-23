/**
 * Imports a filled-in blind review sheet (from `export-for-labeling.ts`) back
 * into `src/fixtures.ts`: for every row with a non-empty `actual_style`, sets
 * `label.actualStyle` / `label.expertScore` / `label.metCriteria` from the
 * reviewer's answers and flips `labelSource` to `--source` (default
 * `"expert"`).
 *
 * `--source ai-assisted` exists for a model's own draft pass over the sheet —
 * useful as a starting point for the methodologist to correct, never as a
 * substitute for their sign-off. Only `expert` counts toward
 * `expertLabelledFixtures`, and the report warns until that number covers
 * every scenario — see the `labelSource` doc comment in `src/fixtures.ts` for
 * why the distinction is load-bearing, not cosmetic.
 *
 * The whole file is regenerated from the current in-memory fixture arrays
 * rather than patched with text surgery, so a partially-filled sheet or a
 * re-import never corrupts formatting.
 *
 * Usage:
 *   bun run import-labels.ts reports/labeling/core-blind.csv [--dry-run]
 *   bun run import-labels.ts reports/labeling/core-blind.csv --source ai-assisted
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CriterionId, ManagementStyle } from "@acme/game";
import { CRITERIA, MANAGEMENT_STYLES } from "@acme/game";
import { z } from "zod";

import {
  ALL_FIXTURES,
  CORE_FIXTURES,
  type EvalFixture,
  EXTENDED_FIXTURES,
} from "./src/fixtures";

const CRITERION_IDS = Object.keys(CRITERIA) as CriterionId[];

function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < clean.length) {
    const char = clean[i];
    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

function isMet(value: string | undefined): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return ["да", "yes", "y", "true", "1", "x", "х"].includes(v);
}

function serializeFixture(f: EvalFixture): string {
  const lines: string[] = [];
  lines.push("  {");
  lines.push(`    id: ${JSON.stringify(f.id)},`);
  lines.push("    description:");
  lines.push(`      ${JSON.stringify(f.description)},`);
  lines.push(`    employeeId: ${JSON.stringify(f.employeeId)},`);
  lines.push(`    taskId: ${JSON.stringify(f.taskId)},`);
  lines.push(`    round: ${f.round},`);
  lines.push(`    activeOrders: ${f.activeOrders},`);
  lines.push(`    soloOnShift: ${f.soloOnShift},`);
  lines.push(`    labelSource: ${JSON.stringify(f.labelSource)},`);
  lines.push("    script: [");
  for (const line of f.script) lines.push(`      ${JSON.stringify(line)},`);
  lines.push("    ],");
  lines.push("    label: {");
  lines.push(`      expectedStyle: ${JSON.stringify(f.label.expectedStyle)},`);
  lines.push(`      actualStyle: ${JSON.stringify(f.label.actualStyle)},`);
  lines.push(`      expertScore: ${f.label.expertScore},`);
  lines.push(
    `      metCriteria: [${f.label.metCriteria.map((id) => JSON.stringify(id)).join(", ")}],`,
  );
  lines.push("    },");
  lines.push("  },");
  return lines.join("\n");
}

const FILE_HEADER = `import type { CriterionId, GameRound, ManagementStyle } from "@acme/game";

/**
 * Labelled scenarios — the ground truth every approach is measured against.
 *
 * Each fixture is a scripted manager, a situation, and an expert verdict. A
 * good approach is one whose automatic score lands close to the expert's *and*
 * whose expected style matches the methodology.
 *
 * Two tiers, curated by hand out of a larger generated pool (see
 * \`gen-fixtures.ts\`, which still produces the full combinatorial set if the
 * pool ever needs to grow again):
 *
 * - \`CORE_FIXTURES\` (exported as \`FIXTURES\`, the default for every run) —
 *   one scenario per (expected style × match/extreme-mismatch), round 2 and
 *   round 3 where the methodology allows it. This is the minimum needed to
 *   catch "the approach ignores the required style" and "the approach cannot
 *   tell overload from normal load" — the two failure modes the game is
 *   actually built to catch. Two of the twelve are also the toxic-turn cases,
 *   so toxicity handling is covered without spending a dedicated scenario.
 * - \`EXTENDED_FIXTURES\` — the "one step off" arms (over/under-manage by a
 *   single level) that CORE_FIXTURES deliberately drops. They matter for
 *   telling apart the partial-credit table in \`styleCredit\` (0.4/0.6/0.15/0.3)
 *   but not for a quick regression check — pull them in with \`ALL_FIXTURES\`
 *   before shipping a technique, not for everyday iteration.
 *
 * Labels start \`provisional\` (a placeholder calibration formula, see
 * \`gen-fixtures.ts\`'s \`provisionalScore\`) and move to \`ai-assisted\` or
 * \`expert\` via \`export-for-labeling.ts\` + \`import-labels.ts\` as a model or
 * a methodologist reviews scenarios blind — see those two files and the
 * \`labelSource\` doc comment below for what each tier is actually worth.
 *
 * Regenerate the full pool with \`bun run gen-fixtures.ts\` after changing the
 * catalog, then re-pick CORE_FIXTURES / EXTENDED_FIXTURES by hand — the
 * selection is a methodology call, not something to automate away.
 */
export interface EvalFixture {
  id: string;
  description: string;
  employeeId: string;
  taskId: string;
  round: GameRound;
  activeOrders: number;
  soloOnShift: boolean;
  /**
   * Where the label came from.
   *
   * \`provisional\` labels are a placeholder calibration formula (see
   * \`gen-fixtures.ts\`'s \`provisionalScore\`), not a considered judgement at
   * all. \`ai-assisted\` is a model's own read of the script — useful as a
   * starting draft, but it must not be trusted as ground truth: the model
   * being graded here and the model doing the grading share the same failure
   * modes, so an ai-assisted label can silently agree with a bad approach for
   * the same reason the approach is bad. Only \`expert\` — a human
   * methodologist's verdict, made blind to what the pipeline expected or
   * scored (see \`export-for-labeling.ts\`) — is strong enough to justify
   * adopting an approach; the report says so out loud for anything less.
   */
  labelSource: "provisional" | "ai-assisted" | "expert";
  /** What the participant says, turn by turn. */
  script: string[];
  label: {
    /** Style the methodology requires in this situation. */
    expectedStyle: ManagementStyle;
    /** Style the scripted manager actually used. */
    actualStyle: ManagementStyle;
    /** Expert score, 0–100. */
    expertScore: number;
    /** Managerial actions an expert would tick off. */
    metCriteria: CriterionId[];
  };
}

/** Utterance used to check the "employee stays silent" requirement. */
export const SILENCE_PROBE =
  "Так, посмотрим, что там у нас по заказам на вечер";
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const sourceIndex = args.indexOf("--source");
  const source = sourceIndex >= 0 ? args[sourceIndex + 1] : "expert";
  if (source !== "expert" && source !== "ai-assisted") {
    console.error('--source должен быть "expert" или "ai-assisted"');
    process.exitCode = 1;
    return;
  }
  const skip = new Set<number>();
  if (sourceIndex >= 0) {
    skip.add(sourceIndex);
    skip.add(sourceIndex + 1);
  }
  const csvPath = args.find(
    (a, index) => !skip.has(index) && !a.startsWith("--"),
  );
  if (!csvPath) {
    console.error(
      "Использование: bun run import-labels.ts <файл.csv> [--dry-run] [--source ai-assisted|expert]",
    );
    process.exitCode = 1;
    return;
  }

  const text = await readFile(resolve(csvPath), "utf8");
  const rows = parseCsv(text);
  const [header, ...dataRows] = rows;
  if (!header) throw new Error("пустой CSV");
  const col = (name: string) => header.indexOf(name);

  const idCol = col("id");
  const styleCol = col("actual_style");
  const scoreCol = col("expert_score");
  const commentCol = col("comment");
  const metCols = CRITERION_IDS.map((id) => ({ id, index: col(`met_${id}`) }));

  if (idCol < 0 || styleCol < 0 || scoreCol < 0) {
    throw new Error(
      "в CSV нет колонок id / actual_style / expert_score — это не наш формат экспорта",
    );
  }

  // Pre-validate schema: all met_<criterion> columns must be present
  const missingMetCols = metCols.filter(({ index }) => index < 0);
  if (missingMetCols.length > 0) {
    throw new Error(
      `в CSV нет обязательных колонок критериев: ${missingMetCols.map(({ id }) => `met_${id}`).join(", ")}`,
    );
  }

  const byId = new Map<string, EvalFixture>();
  for (const f of ALL_FIXTURES) byId.set(f.id, f);

  let applied = 0;
  let skippedBlank = 0;
  const warnings: string[] = [];

  for (const row of dataRows) {
    const id = row[idCol]?.trim();
    if (!id) continue;
    const fixture = byId.get(id);
    if (!fixture) {
      warnings.push(`строка пропущена: неизвестный id "${id}"`);
      continue;
    }

    const styleRaw = row[styleCol]?.trim().toLowerCase();
    if (!styleRaw) {
      skippedBlank += 1;
      continue;
    }
    if (!MANAGEMENT_STYLES.includes(styleRaw as ManagementStyle)) {
      warnings.push(
        `${id}: actual_style "${styleRaw}" не входит в ${MANAGEMENT_STYLES.join("/")} — пропущено`,
      );
      continue;
    }

    const scoreRaw = row[scoreCol]?.trim();
    const scoreSchema = z
      .string()
      .regex(/^\d+$/, "должно быть целое число без дополнительного текста")
      .transform((val) => Number.parseInt(val, 10))
      .refine((val) => val >= 0 && val <= 100, "должно быть от 0 до 100");
    const scoreResult = scoreSchema.safeParse(scoreRaw ?? "");
    if (!scoreResult.success) {
      warnings.push(
        `${id}: expert_score "${scoreRaw}" ${scoreResult.error.errors[0]?.message ?? "невалидно"} — строка пропущена целиком`,
      );
      continue;
    }
    const score = scoreResult.data;

    const metCriteria: CriterionId[] = metCols
      .filter(({ index }) => index >= 0 && isMet(row[index]))
      .map(({ id: criterionId }) => criterionId)
      .sort();

    fixture.label.actualStyle = styleRaw as ManagementStyle;
    fixture.label.expertScore = score;
    fixture.label.metCriteria = metCriteria;
    fixture.labelSource = source;
    applied += 1;
    void commentCol; // comment column is for the reviewer's own notes, not stored in fixtures.ts
  }

  console.log(
    `Применено: ${applied}. Пустых (ещё не размечено): ${skippedBlank}.`,
  );
  for (const w of warnings) console.log(`  ! ${w}`);

  if (dryRun) {
    console.log("--dry-run: fixtures.ts не изменён.");
    return;
  }

  if (applied === 0) {
    console.log("Нечего записывать — fixtures.ts не изменён.");
    return;
  }

  const body = [
    FILE_HEADER,
    "/** Core set — default for every eval run. See file header for the selection rationale. */",
    "export const CORE_FIXTURES: EvalFixture[] = [",
    CORE_FIXTURES.map(serializeFixture).join("\n"),
    "];",
    "",
    "/** One-step-off arms — pull in via ALL_FIXTURES before a ship decision. */",
    "export const EXTENDED_FIXTURES: EvalFixture[] = [",
    EXTENDED_FIXTURES.map(serializeFixture).join("\n"),
    "];",
    "",
    "export const ALL_FIXTURES: EvalFixture[] = [...CORE_FIXTURES, ...EXTENDED_FIXTURES];",
    "",
    "/** Default export used by the runner and CLI. */",
    "export const FIXTURES: EvalFixture[] = CORE_FIXTURES;",
    "",
  ].join("\n");

  await writeFile(resolve("src/fixtures.ts"), body, "utf8");
  console.log(
    "src/fixtures.ts обновлён. Дальше: bunx biome check --write src/fixtures.ts && bun typecheck && bun test",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
