import { z } from "zod";

import { createProviderFromEnv } from "../engine";
import type { LlmProvider } from "../provider/types";

/**
 * Extracts entities and relations from knowledge-base chunks for
 * `org-fusion-rag`'s graph channel, upserted into Neo4j via
 * `./neo4j-graph.ts`'s `upsertEntities`. Mirrors the shape of the built-in
 * in-memory graph (`./graph.ts`: nodes with `id`/`type`/`label`, directed
 * edges with `from`/`to`/`type`/`label`) so the two graphs are conceptually
 * the same model, just one fixed at build time and one built per document.
 *
 * Same batched-LLM-call shape as `./audience-classifier.ts` — one call per
 * batch of chunks, response indexes validated against what was requested.
 * Relations may reference entity ids extracted from a *different* chunk of
 * the same document; the caller aggregates every chunk's entities/relations
 * for one document before a single `upsertEntities` call, so cross-chunk
 * references resolve.
 */

const graphSchema = z.object({
  chunks: z.array(
    z.object({
      index: z.number().int(),
      entities: z.array(
        z.object({
          id: z.string().max(120),
          type: z.string().max(60),
          label: z.string().max(200),
        }),
      ),
      relations: z.array(
        z.object({
          from: z.string().max(120),
          to: z.string().max(120),
          type: z.string().max(60),
          label: z.string().max(300),
        }),
      ),
    }),
  ),
});

export interface ExtractedEntity {
  id: string;
  type: string;
  label: string;
}

export interface ExtractedRelation {
  from: string;
  to: string;
  type: string;
  label: string;
}

export interface ChunkGraph {
  index: number;
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
}

const SYSTEM_PROMPT = [
  "Ты извлекаешь сущности и связи между ними из фрагмента документа, загруженного администратором тренажёра ситуационного руководства, для построения графа знаний.",
  'id — короткий стабильный идентификатор сущности в формате "тип:слаг" (например "product:tort-na-zakaz", "rule:srok-izgotovleniya"), одинаковый для одной и той же сущности в разных фрагментах.',
  "type — категория сущности (например product, process, rule, role, deadline).",
  "label — короткое человекочитаемое название сущности.",
  "relations — направленные связи между уже перечисленными id сущностей: from, to, type (короткий предикат, например requires, has_deadline, belongs_to), label — человекочитаемое описание связи.",
  "Извлекай только то, что явно следует из текста. Если во фрагменте нет сущностей, верни пустые списки.",
  "Верни результат для каждого переданного индекса ровно один раз.",
].join("\n");

const BATCH_SIZE = 15;
const MAX_ENTITIES_PER_CHUNK = 12;
const MAX_RELATIONS_PER_CHUNK = 16;

function batches<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size));
  }
  return result;
}

export async function extractGraph(
  chunks: { index: number; text: string }[],
  options: { provider?: LlmProvider; signal?: AbortSignal } = {},
): Promise<ChunkGraph[]> {
  if (chunks.length === 0) return [];
  const provider = options.provider ?? createProviderFromEnv();
  const results: ChunkGraph[] = [];

  for (const batch of batches(chunks, BATCH_SIZE)) {
    const { value } = await provider.generate({
      purpose: "knowledge.extract-graph",
      schemaName: "ExtractedGraph",
      schema: graphSchema,
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
      throw new Error("Invalid graph-extraction chunk indexes");
    }
    for (const chunk of value.chunks) {
      if (
        !expectedIndexes.has(chunk.index) ||
        responseIndexes.has(chunk.index)
      ) {
        throw new Error("Invalid graph-extraction chunk indexes");
      }
      responseIndexes.add(chunk.index);
    }
    if (responseIndexes.size !== expectedIndexes.size) {
      throw new Error("Invalid graph-extraction chunk indexes");
    }

    results.push(
      ...value.chunks.map((chunk) => ({
        index: chunk.index,
        entities: chunk.entities.slice(0, MAX_ENTITIES_PER_CHUNK),
        relations: chunk.relations.slice(0, MAX_RELATIONS_PER_CHUNK),
      })),
    );
  }

  return results;
}
