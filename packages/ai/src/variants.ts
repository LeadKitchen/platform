import { z } from "zod";

import { stageParamsSchema } from "./types";

/**
 * A variant is one *approach* under test: a concrete choice of implementation
 * for each pipeline stage. Every dialog stores the variant it ran under, which
 * is what makes "did RAG / GraphRAG / skill-RL actually improve the game?"
 * an answerable question rather than an opinion.
 */
/**
 * The family a variant belongs to, independent of which stages it wires up:
 *
 *   control    — no retrieval, no learning, no multi-agent reasoning; the
 *                yardstick everything else is measured against
 *   retrieval  — knowledge stage does non-trivial retrieval (RAG and its
 *                variations)
 *   learning   — persona stage adapts from feedback across dialogs
 *   ensemble   — several model calls cooperate or vote within one turn
 *                (debate, self-consistency); this is the family to look at
 *                when testing how approaches work *together*
 */
export const variantCategorySchema = z.enum([
  "control",
  "retrieval",
  "learning",
  "ensemble",
]);

export type VariantCategory = z.infer<typeof variantCategorySchema>;

export const variantConfigSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  description: z.string().max(1024).default(""),
  category: variantCategorySchema.default("control"),
  /** Кто решает, обратились ли к сотруднику: маркеры или модель. */
  engagement: z.string().min(1).default("heuristic"),
  knowledge: z.string().min(1),
  persona: z.string().min(1),
  evaluation: z.string().min(1),
  /** Model override; falls back to the provider default. */
  model: z.string().optional(),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  /** Strategy-specific knobs: `{ topK: 8 }`, `{ hops: 3 }`, … */
  params: stageParamsSchema.default({}),
});

export type VariantConfig = z.infer<typeof variantConfigSchema>;

export const DEFAULT_VARIANT_ID = "baseline";

export const BUILT_IN_VARIANTS: VariantConfig[] = [
  {
    id: "baseline",
    name: "Baseline (промпт + правила)",
    description:
      "Контрольная группа: весь контекст в промпте, оценка по детерминированным правилам. Дешёвая и полностью воспроизводимая.",
    category: "control",
    engagement: "heuristic",
    knowledge: "prompt-baseline",
    persona: "prompt-baseline",
    evaluation: "rules",
    effort: "low",
    params: {},
  },
  {
    id: "baseline-judge",
    name: "Baseline + LLM-судья",
    description:
      "Тот же промпт-контекст, но стиль и критерии определяет модель. Проверяет вклад именно судьи.",
    category: "control",
    engagement: "heuristic",
    knowledge: "prompt-baseline",
    persona: "prompt-baseline",
    evaluation: "llm-judge",
    effort: "medium",
    params: {},
  },
  {
    id: "llm-first",
    name: "Всё через модель",
    description:
      "Ни одной эвристики в контуре решения: гейт вовлечения, стиль и критерии определяет модель. Прямое сравнение с baseline показывает, что даёт отказ от маркеров и во что он обходится.",
    category: "control",
    engagement: "llm",
    knowledge: "prompt-baseline",
    persona: "prompt-baseline",
    evaluation: "llm-judge",
    effort: "medium",
    params: {},
  },
  {
    id: "rag",
    name: "RAG",
    description:
      "Контекст персонажа собирается поиском по базе знаний; оценка гибридная.",
    category: "retrieval",
    engagement: "heuristic",
    knowledge: "rag-lexical",
    persona: "prompt-baseline",
    evaluation: "hybrid",
    effort: "medium",
    params: { topK: 6, llmWeight: 0.7 },
  },
  {
    id: "hybrid-rag",
    name: "Гибридный RAG (BM25 + эмбеддинги)",
    description:
      "Поиск объединяет лексический BM25 и плотные эмбеддинги через RRF: первый ловит точные идентификаторы, второй — перефразировки.",
    category: "retrieval",
    engagement: "heuristic",
    knowledge: "hybrid-rag",
    persona: "prompt-baseline",
    evaluation: "hybrid",
    effort: "medium",
    params: { topK: 6, llmWeight: 0.7, dense: true },
  },
  {
    id: "graph-rag",
    name: "GraphRAG",
    description:
      "Контекст собирается обходом графа знаний с производными фактами; оценка гибридная.",
    category: "retrieval",
    engagement: "heuristic",
    knowledge: "graph-rag",
    persona: "prompt-baseline",
    evaluation: "hybrid",
    effort: "medium",
    params: { hops: 2, llmWeight: 0.7 },
  },
  {
    id: "skill-rl",
    name: "GraphRAG + Skill-RL",
    description:
      "Граф знаний плюс обучаемая политика навыков персонажа: какие поведенческие навыки включать, решает контекстный бандит.",
    category: "learning",
    engagement: "heuristic",
    knowledge: "graph-rag",
    persona: "skill-rl",
    evaluation: "hybrid",
    effort: "medium",
    params: { hops: 2, llmWeight: 0.7 },
  },
  {
    id: "hyde-rag",
    name: "HyDE RAG",
    description:
      "Перед retrieval модель пишет гипотетический документ; сравнивать с hybrid-rag, чтобы измерить вклад query expansion.",
    category: "retrieval",
    engagement: "heuristic",
    knowledge: "hyde-rag",
    persona: "prompt-baseline",
    evaluation: "hybrid",
    effort: "medium",
    params: { topK: 6, llmWeight: 0.7, dense: true },
  },
  {
    id: "contextual-rag",
    name: "Contextual Retrieval",
    description:
      "Чанки один раз обогащаются LLM-контекстом перед индексацией; сравнивать с hybrid-rag.",
    category: "retrieval",
    engagement: "heuristic",
    knowledge: "contextual-rag",
    persona: "prompt-baseline",
    evaluation: "hybrid",
    effort: "medium",
    params: {
      topK: 6,
      llmWeight: 0.7,
      dense: true,
      buildConcurrency: 4,
    },
  },
  {
    id: "rerank-rag",
    name: "Hybrid RAG + LLM reranker",
    description:
      "Широкий hybrid-поиск и LLM cross-encoder-подобный reranking; сравнивать с hybrid-rag.",
    category: "retrieval",
    engagement: "heuristic",
    knowledge: "rerank-rag",
    persona: "prompt-baseline",
    evaluation: "hybrid",
    effort: "medium",
    params: { topK: 6, llmWeight: 0.7, dense: true, candidateMultiplier: 3 },
  },
  {
    id: "corrective-rag",
    name: "Corrective RAG (CRAG)",
    description:
      "Hybrid retrieval с LLM-проверкой релевантности и одним query rewrite; сравнивать с hybrid-rag.",
    category: "retrieval",
    engagement: "heuristic",
    knowledge: "corrective-rag",
    persona: "prompt-baseline",
    evaluation: "hybrid",
    effort: "medium",
    params: {
      topK: 6,
      llmWeight: 0.7,
      dense: true,
      gradeThreshold: 0.65,
    },
  },
  {
    id: "self-consistency",
    name: "Self-consistency persona",
    description:
      "Три независимых ответа на ход агрегируются majority vote; сравнивать с baseline для измерения вклада test-time compute.",
    category: "ensemble",
    engagement: "heuristic",
    knowledge: "prompt-baseline",
    persona: "self-consistency",
    evaluation: "rules",
    effort: "low",
    params: { selfConsistencySamples: 3 },
  },
  {
    id: "debate-judge",
    name: "Multi-agent debate judge",
    description:
      "Критик, защитник и арбитр классифицируют стиль; сравнивать с baseline-judge.",
    category: "ensemble",
    engagement: "heuristic",
    knowledge: "prompt-baseline",
    persona: "prompt-baseline",
    evaluation: "debate-judge",
    effort: "medium",
    params: {},
  },
];

export function resolveVariant(
  id: string,
  extra: VariantConfig[] = [],
): VariantConfig {
  const found =
    extra.find((variant) => variant.id === id) ??
    BUILT_IN_VARIANTS.find((variant) => variant.id === id);

  if (!found) {
    const known = [...BUILT_IN_VARIANTS, ...extra].map((v) => v.id).join(", ");
    throw new Error(`Unknown variant "${id}". Known variants: ${known}`);
  }
  return found;
}

/** Buckets variants by {@link VariantCategory} for a grouped admin picker. */
export function groupVariantsByCategory(
  variants: VariantConfig[] = BUILT_IN_VARIANTS,
): Record<VariantCategory, VariantConfig[]> {
  const groups: Record<VariantCategory, VariantConfig[]> = {
    control: [],
    retrieval: [],
    learning: [],
    ensemble: [],
  };
  for (const variant of variants) {
    groups[variant.category].push(variant);
  }
  return groups;
}
