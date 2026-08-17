import type { Catalog } from "@acme/game";
import { z } from "zod";

import {
  type Bm25Index,
  buildBm25Index,
  fuseRankings,
  searchBm25,
} from "../../knowledge/bm25";
import { buildCorpus, type KnowledgeDoc } from "../../knowledge/corpus";
import {
  createEmbeddingProvider,
  EmbeddingIndex,
} from "../../knowledge/embeddings";
import { addUsage, type LlmUsage } from "../../provider/types";
import type { KnowledgeStrategy, StageDeps } from "../../types";

/**
 * Contextual Retrieval — техника Anthropic (сентябрь 2024).
 *
 * До индексации каждый чанк обогащается коротким LLM-описанием контекста:
 * что это за документ и какая ситуация в нём разбирается. По данным
 * Anthropic это снижает долю провальных ретривалов на 49% (и до 67% в паре
 * с реранкером) — потому что модель поиска перестаёт полагаться только на
 * поверхностные ключевые слова.
 *
 * В нашем корпусе документы короткие и атомарные, но именно регламенты
 * страдают от отсутствия «жизненного» контекста: строка «горячее отдаётся
 * при температуре не ниже 65 градусов» не пересечётся по словам с репликой
 * «проверь, при какой температуре мы отдаём горячее», пока в текст чанка не
 * попадёт что-то вроде «стандарт подачи горячих блюд».
 *
 * Один разовый проход через LLM на весь каталог; результат кэшируется на
 * catalog в WeakMap. Стоимость видна в telemetry первого dialogа и амортизируется
 * дальше.
 */

interface ContextualDoc extends KnowledgeDoc {
  /** Обогащённый текст, использующийся и в BM25, и в dense-индексе. */
  contextualText: string;
}

interface ContextualIndexes {
  docs: ContextualDoc[];
  bm25: Bm25Index;
  dense: EmbeddingIndex | null;
  buildUsage: LlmUsage;
  buildModels: string[];
}

interface ContextBuildResult {
  context: string;
  usage?: LlmUsage;
  model?: string;
}

interface CacheEntry {
  promise: Promise<ContextualIndexes>;
  usageClaimed: boolean;
}

const cache = new WeakMap<Catalog, Map<string, CacheEntry>>();

const CONTEXT_SYSTEM = `Ты дописываешь метаданные к чанку базы знаний ресторана
для поиска. По короткому фрагменту скажи одним–двумя предложениями:
- к какой ситуации на кухне это правило/факт применяется;
- какие ключевые слова руководителя (тип задачи, обстоятельство смены, роль
  сотрудника) должны привести именно к этому фрагменту.

Правила:
- Пиши сухо, без вводных фраз и обращений.
- Не переписывай сам фрагмент — только добавляй смысл вокруг него.
- Максимум два предложения.`;

const contextualHintSchema = z.object({
  context: z
    .string()
    .describe(
      "1-2 короткие фразы, объясняющие в каком случае этот фрагмент нужен и по каким словам его должны найти.",
    ),
});

async function buildContextForDoc(
  doc: KnowledgeDoc,
  deps: StageDeps,
): Promise<ContextBuildResult> {
  try {
    const result = await deps.provider.generate({
      purpose: "knowledge.contextual",
      schemaName: "contextual_hint",
      schema: contextualHintSchema,
      effort: "low",
      system: CONTEXT_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Тип документа: ${doc.source}.\nФрагмент:\n${doc.text}`,
        },
      ],
    });
    return {
      context: result.value.context.trim(),
      usage: result.usage,
      model: result.model,
    };
  } catch {
    // Сбой обогащения — не критичен: документ остаётся в индексе с исходным
    // текстом, стратегия деградирует к обычному hybrid для этого чанка.
    return { context: "" };
  }
}

async function buildContextualIndex(
  catalog: Catalog,
  useDense: boolean,
  concurrency: number,
  deps: StageDeps,
): Promise<ContextualIndexes> {
  const source = buildCorpus(catalog).filter((doc) => doc.audience !== "judge");

  // Ограниченная параллельность: разово греем индекс, но не хочется отправить
  // 70 запросов одновременно и упереться в rate limit.
  const contexts: ContextBuildResult[] = Array.from(
    { length: source.length },
    () => ({ context: "" }),
  );
  let cursor = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, source.length)) },
    async () => {
      while (cursor < source.length) {
        const index = cursor;
        cursor += 1;
        const doc = source[index];
        if (!doc) return;
        contexts[index] = await buildContextForDoc(doc, deps);
      }
    },
  );
  await Promise.all(workers);

  const docs: ContextualDoc[] = source.map((doc, index) => {
    const context = contexts[index]?.context ?? "";
    return {
      ...doc,
      contextualText: context ? `${context}\n${doc.text}` : doc.text,
    };
  });

  return {
    docs,
    bm25: buildBm25Index(
      docs.map((doc) => ({ ...doc, text: doc.contextualText })),
    ),
    dense: useDense
      ? new EmbeddingIndex(
          createEmbeddingProvider(),
          docs.map((doc) => ({ id: doc.id, text: doc.contextualText })),
        )
      : null,
    buildUsage: addUsage(...contexts.map((result) => result.usage)),
    buildModels: [
      ...new Set(
        contexts.flatMap((result) => (result.model ? [result.model] : [])),
      ),
    ],
  };
}

async function indexesFor(
  catalog: Catalog,
  useDense: boolean,
  concurrency: number,
  deps: StageDeps,
): Promise<{
  indexes: ContextualIndexes;
  buildUsage?: LlmUsage;
  coldStart: boolean;
}> {
  let variants = cache.get(catalog);
  if (!variants) {
    variants = new Map<string, CacheEntry>();
    cache.set(catalog, variants);
  }

  // Индексы, построенные разными моделями или с разным dense-режимом, не
  // взаимозаменяемы: контекстные подписи и векторы у них различаются.
  const key = [
    deps.provider.id,
    deps.provider.model,
    useDense ? "dense" : "lexical",
  ].join(":");
  let entry = variants.get(key);
  if (!entry) {
    entry = {
      promise: buildContextualIndex(catalog, useDense, concurrency, deps),
      usageClaimed: false,
    };
    variants.set(key, entry);
  }

  const indexes = await entry.promise;
  // При параллельном cold start несколько запросов ждут один Promise. После
  // await продолжения выполняются последовательно, поэтому usage заберёт
  // ровно первый из них, а не каждый ожидавший.
  const coldStart = !entry.usageClaimed;
  if (coldStart) entry.usageClaimed = true;

  return {
    indexes,
    buildUsage: coldStart ? indexes.buildUsage : undefined,
    coldStart,
  };
}

export const contextualKnowledge: KnowledgeStrategy = {
  id: "contextual-rag",
  description:
    "Contextual Retrieval (Anthropic 2024): каждый чанк обогащается коротким LLM-описанием контекста до индексации; поиск идёт по BM25+эмбеддингам поверх обогащённого текста.",

  async retrieve(request, deps) {
    const startedAt = Date.now();
    const topK = typeof deps.params.topK === "number" ? deps.params.topK : 6;
    const useDense = deps.params.dense !== false;
    const concurrency =
      typeof deps.params.buildConcurrency === "number"
        ? deps.params.buildConcurrency
        : 4;

    const { employee, task, shift } = request.dialog;
    const query = [
      request.query,
      employee.name,
      employee.role,
      task.title,
      task.type,
      shift.soloOnShift ? "один в смене перегруз приоритеты" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const { indexes, buildUsage, coldStart } = await indexesFor(
      deps.catalog,
      useDense,
      concurrency,
      deps,
    );
    const pool = topK * 3;

    const lexical = searchBm25(indexes.bm25, query, pool).map((hit, rank) => ({
      id: hit.doc.id,
      rank,
    }));

    let dense: { id: string; rank: number }[] = [];
    let denseFailed = false;
    if (indexes.dense) {
      try {
        dense = (await indexes.dense.search(query, pool)).map((hit, rank) => ({
          id: hit.id,
          rank,
        }));
      } catch {
        denseFailed = true;
      }
    }

    const fused = fuseRankings(dense.length > 0 ? [lexical, dense] : [lexical]);
    const byId = new Map(indexes.docs.map((doc) => [doc.id, doc]));

    const ranked = [...fused.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .flatMap(([id, score]) => {
        const doc = byId.get(id);
        return doc ? [{ doc, score }] : [];
      });

    const best = ranked[0]?.score ?? 1;
    // В persona-промпт отдаём оригинальный текст без обогащения: контекст
    // нужен ретривалу, персонажу же он лишь разбавит содержательный факт.
    const snippets = ranked.map((hit) => ({
      id: hit.doc.id,
      text: hit.doc.text,
      score: best === 0 ? 0 : hit.score / best,
      source: hit.doc.source,
    }));

    const pinnedId = `profile:${employee.id}`;
    if (!snippets.some((snippet) => snippet.id === pinnedId)) {
      const pinned = byId.get(pinnedId);
      if (pinned) {
        snippets.unshift({
          id: pinned.id,
          text: pinned.text,
          score: 1,
          source: pinned.source,
        });
      }
    }

    return {
      snippets,
      usage: buildUsage,
      latencyMs: Date.now() - startedAt,
      meta: {
        topK,
        corpusSize: indexes.docs.length,
        contextEnriched: indexes.docs.filter(
          (doc) => doc.contextualText !== doc.text,
        ).length,
        coldStart,
        buildModels: coldStart ? indexes.buildModels : [],
        denseFailed,
      },
    };
  },
};
