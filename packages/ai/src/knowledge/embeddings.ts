import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { type EmbeddingModel, embedMany } from "ai";

/**
 * Dense retrieval side of the hybrid index.
 *
 * Kept behind an interface with a null implementation: the whole point of the
 * experiment is to find out whether embeddings beat BM25 on *this* corpus, and
 * an arm that cannot run without an embedding endpoint would simply be skipped
 * instead of measured.
 */
export interface EmbeddingProvider {
  readonly id: string;
  embed(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

// intfloat/multilingual-e5-large (1024-dim dense output) served by a
// self-hosted Text Embeddings Inference (TEI) instance — see the
// `embeddings` service in docker-compose.yml. Trained on MIRACL (multilingual
// retrieval), competitive with or ahead of OpenAI's English-leaning
// text-embedding-3-small on Russian/multilingual retrieval, and CPU-friendly
// at 560M params, so no GPU is required to run it. (BAAI/bge-m3 was tried
// first — same size class, similarly strong on paper — but its HF repo has
// no working ONNX export for TEI to load: every onnx/model.onnx* path 404s,
// and the pytorch_model.bin fallback failed to download intact.)
export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 1024;
const KNOWLEDGE_EMBEDDING_MODEL = "intfloat/multilingual-e5-large";

export function createEmbeddingProvider(
  options: EmbeddingOptions = {},
): EmbeddingProvider {
  // EMBEDDINGS_* takes precedence over OPENAI_* so this channel doesn't
  // silently follow wherever OPENAI_BASE_URL points the LLM pool (a paid
  // gateway there almost never also proxies embeddings) — OPENAI_* stays as
  // a fallback only for a bare deployment that never sets EMBEDDINGS_*.
  const apiKey =
    options.apiKey ??
    process.env.EMBEDDINGS_API_KEY ??
    process.env.OPENAI_API_KEY;
  const baseUrl =
    options.baseUrl ??
    process.env.EMBEDDINGS_BASE_URL ??
    process.env.OPENAI_BASE_URL;
  const modelId =
    options.model ?? process.env.EMBEDDING_MODEL ?? KNOWLEDGE_EMBEDDING_MODEL;

  if (modelId !== KNOWLEDGE_EMBEDDING_MODEL) {
    throw new Error(
      `Embedding model '${modelId}' is incompatible: knowledge vectors require ${KNOWLEDGE_EMBEDDING_DIMENSIONS} dimensions from ${KNOWLEDGE_EMBEDDING_MODEL}`,
    );
  }

  const isGateway =
    Boolean(baseUrl) && !baseUrl?.startsWith("https://api.openai.com");

  const model: EmbeddingModel = isGateway
    ? createOpenAICompatible({
        name: "gateway",
        apiKey,
        baseURL: baseUrl ?? "https://api.openai.com/v1",
      }).textEmbeddingModel(modelId)
    : createOpenAI({ apiKey, baseURL: baseUrl }).textEmbeddingModel(modelId);

  return {
    id: `embeddings:${modelId}`,
    async embed(texts) {
      if (texts.length === 0) return [];
      const { embeddings } = await embedMany({ model, values: texts });
      for (const embedding of embeddings) {
        if (embedding.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS) {
          throw new Error(
            `Embedding provider returned ${embedding.length} dimensions; expected ${KNOWLEDGE_EMBEDDING_DIMENSIONS}`,
          );
        }
      }
      return embeddings;
    },
  };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Embeddings for a fixed corpus, computed once and reused.
 *
 * The catalog changes when an administrator edits it, not per request, so
 * paying for one embedding pass per process is the difference between dense
 * retrieval being an option and being unaffordable.
 */
export class EmbeddingIndex {
  private vectors: number[][] = [];
  private ids: string[] = [];
  private ready: Promise<void> | null = null;

  constructor(
    private readonly provider: EmbeddingProvider,
    private readonly documents: { id: string; text: string }[],
  ) {}

  private ensureReady(): Promise<void> {
    this.ready ??= (async () => {
      this.ids = this.documents.map((doc) => doc.id);
      this.vectors = await this.provider.embed(
        this.documents.map((doc) => doc.text),
      );
    })();
    return this.ready;
  }

  async search(
    query: string,
    topK: number,
  ): Promise<{ id: string; score: number }[]> {
    await this.ensureReady();
    const [queryVector] = await this.provider.embed([query]);
    if (!queryVector) return [];

    return this.ids
      .map((id, position) => ({
        id,
        score: cosineSimilarity(queryVector, this.vectors[position] ?? []),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
