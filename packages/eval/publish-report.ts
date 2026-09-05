#!/usr/bin/env bun
/**
 * Publish a harness `RunResult` JSON file to the admin panel.
 *
 * The harness only ever writes local files under `reports/`; a customer has
 * no shell access to read them. This inserts the file's content verbatim
 * into `game_benchmark_runs` so `/admin/game/benchmarks` can show it — no
 * recomputation, so what gets published is exactly what the harness measured.
 *
 * Usage: bun run publish reports/wave1-stateless.json [--label "Волна 1"]
 */
import { readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { db, GameBenchmarkRun } from "@acme/db";

/**
 * `bun --filter @acme/eval publish <path>` runs with this package's directory
 * as cwd, not the repo root the user typed the path from — a plain
 * `reports/run.json` then resolves to `packages/eval/reports/run.json` and
 * 404s. Trying the repo root (two levels up from this script) as a fallback
 * base is what makes the path work the way it reads on the command line.
 */
async function resolveReportPath(input: string): Promise<string> {
  if (isAbsolute(input)) return input;

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const candidates = [resolve(process.cwd(), input), resolve(repoRoot, input)];

  for (const candidate of candidates) {
    if (await Bun.file(candidate).exists()) return candidate;
  }

  throw new Error(
    `Файл не найден ни по одному из путей:\n${candidates.join("\n")}`,
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const pathArg = argv.find((arg) => !arg.startsWith("--"));
  if (!pathArg) {
    console.error("Использование: bun run publish <report.json> [--label X]");
    process.exit(1);
  }

  const labelFlag = argv.indexOf("--label");
  const label =
    labelFlag !== -1 ? argv[labelFlag + 1] : basename(pathArg, ".json");
  if (!label) {
    console.error("Пустая метка отчёта");
    process.exit(1);
  }

  const path = await resolveReportPath(pathArg);
  const raw = await readFile(path, "utf8");
  const result = JSON.parse(raw) as Record<string, unknown>;

  if (typeof result.startedAt !== "string" || !Array.isArray(result.items)) {
    console.error(
      `Файл не похож на RunResult харнесса (нет startedAt/items): ${path}`,
    );
    process.exit(1);
  }

  const [row] = await db
    .insert(GameBenchmarkRun)
    .values({ label, result })
    .returning({ id: GameBenchmarkRun.id });

  console.log(`Опубликовано: ${label} (id ${row?.id})`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
