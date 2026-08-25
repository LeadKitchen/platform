#!/usr/bin/env bun
/**
 * Publish a written review report (markdown) to the admin panel.
 *
 * Companion to `@acme/eval`'s `publish-report.ts`, for human-authored
 * analysis rather than harness-measured numbers: the file is inserted
 * verbatim into `game_review_reports` so `/admin/game/reviews` can show it.
 *
 * Usage: bun run src/scripts/publish-review.ts report.md --title "Название" [--summary "..."] [--kind comparison]
 *
 * `--kind` defaults to `legacy-review` (shown under "Ревью старого проекта");
 * pass `--kind comparison` to publish under "Сравнение с новым проектом" instead.
 */
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import { db } from "../client";
import { GameReviewReport } from "../schema/game/game";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const pathArg = argv.find((arg) => !arg.startsWith("--"));
  if (!pathArg) {
    console.error(
      "Использование: bun run publish-review.ts <report.md> --title X [--summary Y]",
    );
    process.exit(1);
  }

  const titleFlag = argv.indexOf("--title");
  const titleValue = titleFlag !== -1 ? argv[titleFlag + 1] : undefined;
  const title =
    titleValue && !titleValue.startsWith("--") ? titleValue : undefined;
  if (!title) {
    console.error('Нужен заголовок: --title "Название отчёта"');
    process.exit(1);
  }

  const summaryFlag = argv.indexOf("--summary");
  const summary = summaryFlag !== -1 ? (argv[summaryFlag + 1] ?? "") : "";

  const kindFlag = argv.indexOf("--kind");
  const kindValue = kindFlag !== -1 ? argv[kindFlag + 1] : undefined;
  const kind = kindValue === "comparison" ? "comparison" : "legacy-review";

  const path = isAbsolute(pathArg) ? pathArg : resolve(process.cwd(), pathArg);
  const content = await readFile(path, "utf8");

  const [row] = await db
    .insert(GameReviewReport)
    .values({ title, summary, content, kind })
    .returning({ id: GameReviewReport.id });

  console.log(`Опубликовано: ${title} (id ${row?.id})`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
