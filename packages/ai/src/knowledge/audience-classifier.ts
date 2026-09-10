import { z } from "zod";

import { createProviderFromEnv } from "../engine";
import type { LlmProvider } from "../provider/types";

/**
 * Suggests who may see an uploaded knowledge chunk: `character` (safe for
 * the role-play persona), `judge` (scoring methodology — must never reach
 * the character prompt), or `both`.
 *
 * This is a *suggestion*, not a publish decision. The admin-confirmed
 * `docs/ai-module.md` safety rule stays intact regardless of how good this
 * classifier is: a document stays `needs_review` until a human confirms the
 * labels, so a wrong guess here costs a review click, never a leak.
 */
const classificationSchema = z.object({
  chunks: z.array(
    z.object({
      index: z.number().int(),
      audience: z.enum(["character", "judge", "both"]),
      reason: z.string().max(200),
    }),
  ),
});

export interface AudienceClassification {
  index: number;
  audience: "character" | "judge" | "both";
  reason: string;
}

const SYSTEM_PROMPT = [
  "Ты размечаешь фрагменты документа, загруженного администратором тренажёра ситуационного руководства.",
  'Реплики играет ИИ-персонаж ("виртуальный сотрудник"), с которым тренируется участник; отдельно система оценивает диалог участника по методологии.',
  'Пометь фрагмент "judge", если это методология оценки: названия управленческих стилей, уровни готовности сотрудника, критерии/рубрика оценки, правильный ответ на упражнение — то, что нельзя показывать персонажу, иначе он подскажет участнику решение и упражнение сломается.',
  'Пометь фрагмент "character", если это факты, которые естественно знает сотрудник: его роль, регламенты кухни, процессы, контекст задачи.',
  'Пометь "both", только если фрагмент одновременно нейтрален и не раскрывает методологию оценки.',
  "При сомнении выбирай более осторожный вариант — judge, а не character.",
  "Верни разметку для каждого переданного индекса ровно один раз.",
].join("\n");

const BATCH_SIZE = 25;
/** Bounded parallelism, same pattern as buildContextualIndex in contextual-rag.ts — large documents can produce dozens of batches, and running them one at a time was blowing past the task's execution timeout. */
const CONCURRENCY = 4;

function batches<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size));
  }
  return result;
}

async function classifyBatch(
  batch: { index: number; text: string }[],
  provider: LlmProvider,
  signal: AbortSignal | undefined,
): Promise<AudienceClassification[]> {
  const { value } = await provider.generate({
    purpose: "knowledge.classify-audience",
    schemaName: "AudienceClassification",
    schema: classificationSchema,
    effort: "low",
    signal,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          chunks: batch.map((item) => ({
            index: item.index,
            text: item.text.slice(0, 4000),
          })),
        }),
      },
    ],
  });
  const expectedIndexes = new Set(batch.map((item) => item.index));
  const responseIndexes = new Set<number>();
  if (
    expectedIndexes.size !== batch.length ||
    value.chunks.length !== batch.length
  ) {
    throw new Error("Invalid audience classification indexes");
  }
  for (const chunk of value.chunks) {
    if (!expectedIndexes.has(chunk.index) || responseIndexes.has(chunk.index)) {
      throw new Error("Invalid audience classification indexes");
    }
    responseIndexes.add(chunk.index);
  }
  if (responseIndexes.size !== expectedIndexes.size) {
    throw new Error("Invalid audience classification indexes");
  }
  return value.chunks;
}

export async function classifyChunkAudience(
  chunks: { index: number; text: string }[],
  options: { provider?: LlmProvider; signal?: AbortSignal } = {},
): Promise<AudienceClassification[]> {
  if (chunks.length === 0) return [];
  const provider = options.provider ?? createProviderFromEnv();
  const chunkBatches = batches(chunks, BATCH_SIZE);
  const results: AudienceClassification[][] = new Array(chunkBatches.length);

  let cursor = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(CONCURRENCY, chunkBatches.length)) },
    async () => {
      while (cursor < chunkBatches.length) {
        const batchIndex = cursor;
        cursor += 1;
        const batch = chunkBatches[batchIndex];
        if (!batch) return;
        results[batchIndex] = await classifyBatch(
          batch,
          provider,
          options.signal,
        );
      }
    },
  );
  await Promise.all(workers);

  return results.flat();
}
