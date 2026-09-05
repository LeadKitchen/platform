#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { renderScaleReport, runScaleSweep } from "./scale";
import { flushTelemetry, initTelemetry } from "./telemetry";

initTelemetry();

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const read = (flag: string): string | undefined => {
    const at = argv.indexOf(flag);
    return at === -1 ? undefined : argv[at + 1];
  };

  const sizes = (read("--sizes") ?? "8,25,50,100,200")
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value));

  const strategies = read("--strategies")
    ?.split(",")
    .map((s) => s.trim());

  const points = await runScaleSweep({
    sizes,
    strategyIds: strategies,
    probes: Number.parseInt(read("--probes") ?? "12", 10) || 12,
    topK: Number.parseInt(read("--topk") ?? "6", 10) || 6,
    onProgress: (message) => process.stdout.write(`  ${message}\r`),
  });

  process.stdout.write("\n");
  const report = renderScaleReport(points);
  console.log(report);

  const out = read("--out");
  if (out) {
    await mkdir(dirname(resolve(out)), { recursive: true });
    await writeFile(out, report, "utf8");
    console.log(`Отчёт записан: ${out}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(flushTelemetry);
