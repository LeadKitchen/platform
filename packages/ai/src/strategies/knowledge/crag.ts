import { addUsage } from "../../provider/types";
import { clamp, retrievalGradeSchema } from "../../schemas";
import type { KnowledgeResult, KnowledgeStrategy } from "../../types";
import { hybridRagKnowledge } from "./hybrid-rag";

/**
 * Corrective RAG (CRAG, Yan et al., 2024).
 *
 * Обычный RAG безусловно передаёт первый top-k генератору. CRAG сначала
 * проверяет, отвечает ли извлечённый контекст на запрос. При низкой
 * релевантности модель переписывает запрос, после чего retrieval выполняется
 * ещё раз. Здесь число коррекций намеренно ограничено одним проходом:
 * бесконечный agent loop неприемлем для интерактивного тренажёра и ломает
 * сопоставимость latency/cost между вариантами.
 */

const GRADER_SYSTEM = `Ты проверяешь качество retrieval для базы знаний
ресторана. Сравни последнюю реплику руководителя с найденными фрагментами.

Вердикты:
- correct: хотя бы один фрагмент прямо содержит нужный факт или правило;
- ambiguous: фрагменты относятся к теме, но точного ответа не дают;
- incorrect: фрагменты не относятся к вопросу или вводят в заблуждение.

bestScore — уверенность, что лучший фрагмент полезен, от 0 до 1.
Если verdict не correct, rewrittenQuery должен быть коротким поисковым запросом
на русском: добавь синонимы, вид регламента и ключевой объект, но не выдумывай
ответ. Для correct верни rewrittenQuery = null.`;

function renderSnippets(result: KnowledgeResult): string {
  if (result.snippets.length === 0) return "(ничего не найдено)";
  return result.snippets
    .map(
      (snippet, index) =>
        `[${index}] (${snippet.source}, ${snippet.id}) ${snippet.text}`,
    )
    .join("\n");
}

function mergeResults(
  first: KnowledgeResult,
  corrected: KnowledgeResult,
  topK: number,
  employeeId: string,
): KnowledgeResult["snippets"] {
  // Результаты второго поиска важнее, но сохраняем уникальные фрагменты из
  // первого: rewrite может повысить precision и одновременно потерять точный
  // идентификатор заказа, который был в исходной реплике.
  const merged = new Map(
    [...corrected.snippets, ...first.snippets].map((snippet) => [
      snippet.id,
      snippet,
    ]),
  );
  const profileId = `profile:${employeeId}`;
  const profile = merged.get(profileId);
  const ranked = [...merged.values()]
    .filter((snippet) => snippet.id !== profileId)
    .slice(0, topK);
  return profile ? [profile, ...ranked] : ranked;
}

export const correctiveRagKnowledge: KnowledgeStrategy = {
  id: "corrective-rag",
  description:
    "CRAG: LLM оценивает релевантность hybrid-retrieval; при промахе переписывает запрос и делает один корректирующий поиск.",

  async retrieve(request, deps) {
    const startedAt = Date.now();
    const topK = typeof deps.params.topK === "number" ? deps.params.topK : 6;
    const gradeThreshold =
      typeof deps.params.gradeThreshold === "number"
        ? clamp(deps.params.gradeThreshold, 0, 1)
        : 0.65;

    const first = await hybridRagKnowledge.retrieve(request, {
      ...deps,
      params: { ...deps.params, topK },
    });

    try {
      const grade = await deps.provider.generate({
        purpose: "knowledge.grade",
        schemaName: "retrieval_grade",
        schema: retrievalGradeSchema,
        effort: "low",
        signal: deps.signal,
        system: GRADER_SYSTEM,
        messages: [
          {
            role: "user",
            content: `Реплика руководителя: ${request.query}\n\nНайденные фрагменты:\n${renderSnippets(first)}`,
          },
        ],
      });

      const bestScore = clamp(grade.value.bestScore, 0, 1);
      const rewrittenQuery = grade.value.rewrittenQuery?.trim() ?? "";
      const needsCorrection =
        grade.value.verdict !== "correct" || bestScore < gradeThreshold;

      if (!needsCorrection || rewrittenQuery.length === 0) {
        return {
          ...first,
          usage: addUsage(first.usage, grade.usage),
          latencyMs: Date.now() - startedAt,
          meta: {
            ...first.meta,
            cragVerdict: grade.value.verdict,
            cragBestScore: bestScore,
            corrected: false,
            graderModel: grade.model,
          },
        };
      }

      const corrected = await hybridRagKnowledge.retrieve(
        { ...request, query: rewrittenQuery },
        { ...deps, params: { ...deps.params, topK } },
      );
      const snippets = mergeResults(
        first,
        corrected,
        topK,
        request.dialog.employee.id,
      );

      return {
        snippets,
        usage: addUsage(first.usage, grade.usage, corrected.usage),
        latencyMs: Date.now() - startedAt,
        meta: {
          ...corrected.meta,
          cragVerdict: grade.value.verdict,
          cragBestScore: bestScore,
          corrected: true,
          originalQuery: request.query,
          rewrittenQuery,
          graderModel: grade.model,
        },
      };
    } catch (cause) {
      if (deps.signal?.aborted) throw cause;
      // Grader — оптимизация, а не зависимость доступности. Любая ошибка
      // оставляет исходный hybrid-контекст пригодным для ответа.
      return {
        ...first,
        latencyMs: Date.now() - startedAt,
        meta: { ...first.meta, corrected: false, cragGraderFailed: true },
      };
    }
  },
};
