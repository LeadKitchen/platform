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
import { basename } from "node:path";

import { db, GameBenchmarkRun } from "@acme/db";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const path = argv.find((arg) => !arg.startsWith("--"));
  if (!path) {
    console.error("Использование: bun run publish <report.json> [--label X]");
    process.exit(1);
  }

  const labelFlag = argv.indexOf("--label");
  const label =
    labelFlag !== -1 ? argv[labelFlag + 1] : basename(path, ".json");
  if (!label) {
    console.error("Пустая метка отчёта");
    process.exit(1);
  }

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
