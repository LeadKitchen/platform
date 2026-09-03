import { z } from "zod";

import { createProviderFromEnv } from "../engine";
import type { LlmProvider } from "../provider/types";

/**
 * Extracts `(subject, predicate, object)` triples from knowledge-base
 * chunks for `org-fusion-rag`'s atomic-facts channel — the fourth channel
 * alongside BM25/vector/graph, backed by `GameKnowledgeFact`
 * (`packages/db/src/schema/game/game.ts`). Exists for the lookups a
 * paraphrase-tolerant vector search or a whole chunk of prose is worse at:
 * an exact answer to "что делать при X".
 *
 * Same batched-LLM-call shape as `./audience-classifier.ts` — one call per
 * batch of chunks, response indexes validated against what was requested.
 * Facts inherit the audience label already computed for their chunk; no
 * second classification pass, and the same "judge content must never reach
 * the character prompt" invariant applies identically to this channel.
 */

const factsSchema = z.object({
  chunks: z.array(
    z.object({
      index: z.number().int(),
      facts: z.array(
        z.object({
          subject: z.string().max(200),
          predicate: z.string().max(200),
          object: z.string().max(400),
          confidence: z.number().min(0).max(1),
        }),
      ),
    }),
  ),
});

export interface ExtractedFact {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
}

export interface ChunkFacts {
  index: number;
  facts: ExtractedFact[];
}

const SYSTEM_PROMPT = [
  "Ты извлекаешь атомарные факты из фрагмента документа, загруженного администратором тренажёра ситуационного руководства.",
  "Факт — тройка (субъект, предикат, объект): короткое самодостаточное утверждение, которое можно найти точным совпадением, а не пересказом.",
  'Пример: субъект "торты на заказ", предикат "срок изготовления", объект "72 часа".',
  "Извлекай только факты, явно присутствующие в тексте — не додумывай и не обобщай.",
  "confidence — твоя уверенность, что тройка точно передаёт написанное в тексте, от 0 до 1.",
  "Если во фрагменте нет фактов, верни для него пустой список facts.",
  "Верни результат для каждого переданного индекса ровно один раз.",
].join("\n");

const BATCH_SIZE = 15;
const MAX_FACTS_PER_CHUNK = 8;

function batches<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size));
  }
  return result;
}

export async function extractFacts(
  chunks: { index: number; text: string }[],
  options: { provider?: LlmProvider; signal?: AbortSignal } = {},
): Promise<ChunkFacts[]> {
  if (chunks.length === 0) return [];
  const provider = options.provider ?? createProviderFromEnv();
  const results: ChunkFacts[] = [];

  for (const batch of batches(chunks, BATCH_SIZE)) {
    const { value } = await provider.generate({
      purpose: "knowledge.extract-facts",
      schemaName: "ExtractedFacts",
      schema: factsSchema,
      effort: "low",
      signal: options.signal,
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
      throw new Error("Invalid fact-extraction chunk indexes");
    }
    for (const chunk of value.chunks) {
      if (
        !expectedIndexes.has(chunk.index) ||
        responseIndexes.has(chunk.index)
      ) {
        throw new Error("Invalid fact-extraction chunk indexes");
      }
      responseIndexes.add(chunk.index);
    }
    if (responseIndexes.size !== expectedIndexes.size) {
      throw new Error("Invalid fact-extraction chunk indexes");
    }

    results.push(
      ...value.chunks.map((chunk) => ({
        index: chunk.index,
        facts: chunk.facts.slice(0, MAX_FACTS_PER_CHUNK),
      })),
    );
  }

  return results;
}
