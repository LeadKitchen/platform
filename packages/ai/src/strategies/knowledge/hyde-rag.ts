import type { Catalog } from "@acme/game";

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
import { hypotheticalDocumentSchema } from "../../schemas";
import type { KnowledgeStrategy } from "../../types";

/**
 * HyDE — Hypothetical Document Embeddings (Gao et al., arXiv:2212.10496).
 *
 * До ретривала модель пишет короткий гипотетический документ на реплику
 * руководителя: не ответ сотрудника, а «регламентная справка», которую
 * стоило бы найти. Этот документ вместе с исходным вопросом идёт в поиск —
 * тем самым запрос сближается по стилю с корпусом (регламенты, компетенции,
 * профили), а не с разговорной репликой.
 *
 * Механизм особенно помогает, когда:
 *   - руководитель формулирует косвенно («что там с банкетом?») и точных
 *     ключевых слов в корпусе нет;
 *   - вопрос ссылается на регламент, названия которого никто не произносит.
 *
 * Цена — один короткий LLM-вызов на реплику. Стоит она recall@k или нет —
 * решает не наша интуиция, а paired-сравнение против `hybrid-rag` на
 * фикстурах: если выигрыша нет, вариант просто не станет дефолтным.
 */

interface Indexes {
  docs: KnowledgeDoc[];
  bm25: Bm25Index;
  dense: EmbeddingIndex | null;
}

const cache = new WeakMap<Catalog, Indexes>();

function indexesFor(catalog: Catalog, useDense: boolean): Indexes {
  const cached = cache.get(catalog);
  if (cached) return cached;

  const docs = buildCorpus(catalog).filter((doc) => doc.audience !== "judge");

  const indexes: Indexes = {
    docs,
    bm25: buildBm25Index(docs),
    dense: useDense
      ? new EmbeddingIndex(
          createEmbeddingProvider(),
          docs.map((doc) => ({ id: doc.id, text: doc.text })),
        )
      : null,
  };

  cache.set(catalog, indexes);
  return indexes;
}

const HYDE_SYSTEM = `Ты вспомогательный поиск в корпусе регламентов ресторана.
По реплике руководителя ты предполагаешь, какая справка из корпуса могла бы
её обслужить, и записываешь её 1–3 короткими утверждениями от третьего лица.

Правила:
- Пиши так, как если бы это была цитата из внутреннего регламента, карточки
  сотрудника или карточки заказа — сухо, по делу.
- Не отвечай руководителю; не проси уточнить; не используй местоимения «я»
  и «мы».
- Не выдумывай новые правила. Если непонятно — опиши общий принцип
  ситуационного руководства применительно к кухне.
- Максимум 3 предложения.`;

export const hydeKnowledge: KnowledgeStrategy = {
  id: "hyde-rag",
  description:
    "HyDE: LLM пишет гипотетический документ по реплике руководителя, поиск идёт по нему поверх BM25+эмбеддингов.",

  async retrieve(request, deps) {
    const startedAt = Date.now();
    const topK = typeof deps.params.topK === "number" ? deps.params.topK : 6;
    const useDense = deps.params.dense !== false;

    const { employee, task, shift } = request.dialog;

    // Плитка контекста, чтобы модель писала гипотезу про нужного сотрудника
    // и заказ, а не общую «кухонную» справку.
    const contextHint = [
      `Сотрудник: ${employee.name}, ${employee.role}, уровень ${employee.level}.`,
      `Заказ: ${task.title}, тип «${task.type}», сложность ${task.complexity}/5.`,
      shift.soloOnShift ? "Смена: один повар, перегруз." : "",
    ]
      .filter(Boolean)
      .join(" ");

    let hypothetical = "";
    let usage: { inputTokens: number; outputTokens: number } | undefined;
    let model: string | undefined;
    let hydeFailed = false;

    try {
      const result = await deps.provider.generate({
        purpose: "knowledge.hyde",
        schemaName: "hypothetical_document",
        schema: hypotheticalDocumentSchema,
        // HyDE — вспомогательный шаг, качество финального ответа задаёт
        // persona. Считать глубоко тут — платить дважды за один и тот же
        // токен-бюджет.
        effort: "low",
        signal: deps.signal,
        system: HYDE_SYSTEM,
        messages: [
          {
            role: "user",
            content: `${contextHint}\n\nРеплика руководителя: ${request.query}`,
          },
        ],
      });
      hypothetical = result.value.document.trim();
      usage = result.usage;
      model = result.model;
    } catch (cause) {
      // Сбой HyDE не должен ронять диалог: деградируем до hybrid-поиска на
      // сырой реплике.
      if (deps.signal?.aborted) throw cause;
      hydeFailed = true;
    }

    const indexes = indexesFor(deps.catalog, useDense);
    const pool = topK * 3;

    // Расширяем запрос гипотетическим документом, но не выкидываем исходный:
    // BM25 ловит точные слова из речи руководителя, эмбеддинги — семантику,
    // и обе половины хуже без якорных ключевых слов.
    const expandedQuery = [
      request.query,
      hypothetical,
      employee.name,
      task.title,
      task.type,
    ]
      .filter(Boolean)
      .join(" ");

    const lexical = searchBm25(indexes.bm25, expandedQuery, pool).map(
      (hit, rank) => ({ id: hit.doc.id, rank }),
    );

    let dense: { id: string; rank: number }[] = [];
    let denseFailed = false;
    if (indexes.dense) {
      try {
        // Плотный поиск идёт по эмбеддингу гипотетического документа, если он
        // получен; иначе — по исходной реплике. Это и есть точка HyDE: запрос
        // перестаёт быть разговорной репликой и становится похож на
        // регламент, а именно регламенты лежат в корпусе.
        const denseQuery = hypothetical || request.query;
        dense = (await indexes.dense.search(denseQuery, pool)).map(
          (hit, rank) => ({ id: hit.id, rank }),
        );
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
    const snippets = ranked.map((hit) => ({
      id: hit.doc.id,
      text: hit.doc.text,
      score: best === 0 ? 0 : hit.score / best,
      source: hit.doc.source,
    }));

    // Профиль пиним, как и в остальных стратегиях: персонаж должен знать
    // себя, что бы там ни выдал ретривал.
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
      usage,
      latencyMs: Date.now() - startedAt,
      meta: {
        topK,
        corpusSize: indexes.docs.length,
        hypothetical,
        hydeFailed,
        denseFailed,
        model,
      },
    };
  },
};
