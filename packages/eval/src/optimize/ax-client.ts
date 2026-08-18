import {
  buildAnthropicCandidates,
  buildGeminiCandidates,
  buildGroqCandidates,
  buildOpenAiCandidates,
  buildOpenRouterCandidates,
  type PoolCandidate,
} from "@acme/ai";
import { type AxAIOpenAIModel, type AxAIService, ai } from "@ax-llm/ax";

/**
 * Bridge the project's provider configuration into an Ax AI client.
 *
 * Ax brings its own provider layer, so this is the one place where the two
 * stacks meet. The candidate list is reused from `@acme/ai` rather than read
 * from env again: keys, base URLs and the probe-verified model order are
 * hard-won knowledge (see `provider/config.ts`), and a second copy of that
 * knowledge would rot.
 *
 * What is *not* bridged, and matters:
 *
 *  - **No failover.** `createPoolProvider` rotates candidates and cools down
 *    exhausted ones; an Ax client is a single endpoint. On the free tiers this
 *    task runs on, a quota wall aborts the optimisation instead of degrading
 *    to the next model. That is acceptable here — this is an offline optimiser,
 *    not the game loop — but it is why Ax stays out of `packages/ai`.
 *  - **No cost accounting.** `estimateCostUsd` is not in the loop, so Ax calls
 *    do not show up in the harness's `$/диалог`. Only the *scoring* runs,
 *    which go through the normal provider, are priced.
 */
export interface AxClientHandle {
  client: AxAIService;
  /** Candidate the client was built from, for logging. */
  candidateId: string;
  model: string;
}

export interface AxClientOptions {
  env?: NodeJS.ProcessEnv;
  /** Override the model, e.g. from a `--reflection-model` flag. */
  model?: string;
  /**
   * Cap on generated tokens.
   *
   * Kept low by default for the same reason the pool caps it: a rambling
   * free-tier backend can burn minutes on a call that needs a handful of
   * fields, and the bootstrapper makes one call per training example per round.
   */
  maxTokens?: number;
  temperature?: number;
}

/**
 * Pick the candidate Ax will talk to.
 *
 * Mirrors `createProviderFromEnv`'s precedence so the optimiser and the harness
 * do not silently end up on different models. `AI_PROVIDER=pool` collapses to
 * the first candidate — Ax cannot express a pool, and picking one explicitly is
 * better than pretending otherwise.
 */
function pickCandidate(env: NodeJS.ProcessEnv): PoolCandidate | undefined {
  const kind =
    env.AI_PROVIDER ??
    (env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEYS
      ? "openrouter"
      : env.GROQ_API_KEY || env.GROQ_API_KEYS
        ? "groq"
        : env.GEMINI_API_KEY || env.GEMINI_API_KEYS
          ? "gemini"
          : env.ANTHROPIC_API_KEY
            ? "anthropic"
            : env.OPENAI_API_KEY
              ? "openai"
              : "mock");

  const candidates =
    kind === "openrouter"
      ? buildOpenRouterCandidates({ env })
      : kind === "groq"
        ? buildGroqCandidates(env)
        : kind === "gemini"
          ? buildGeminiCandidates(env)
          : kind === "anthropic"
            ? buildAnthropicCandidates(env)
            : kind === "pool"
              ? [
                  ...buildOpenAiCandidates(env),
                  ...buildGroqCandidates(env),
                  ...buildGeminiCandidates(env),
                  ...buildOpenRouterCandidates({ env }),
                  ...buildAnthropicCandidates(env),
                ]
              : buildOpenAiCandidates(env);

  return candidates[0];
}

export function createAxClientFromEnv(
  options: AxClientOptions = {},
): AxClientHandle {
  const env = options.env ?? process.env;
  const candidate = pickCandidate(env);

  if (!candidate) {
    throw new Error(
      "Ax-оптимизатору нужен реальный провайдер: mock не подходит, а ключей в окружении нет. Задайте OPENAI_API_KEY / GROQ_API_KEY / GEMINI_API_KEY / OPENROUTER_API_KEY / ANTHROPIC_API_KEY.",
    );
  }

  const model = options.model ?? candidate.model;
  const config = {
    model: model as AxAIOpenAIModel,
    maxTokens: options.maxTokens ?? candidate.maxOutputTokens ?? 1500,
    // Bootstrapping keeps traces whose output matched the label, so sampling
    // noise here is pure loss: a demo is only useful if it is reproducible.
    temperature: options.temperature ?? 0,
  };

  const client =
    candidate.vendor === "anthropic"
      ? ai({
          name: "anthropic",
          apiKey: candidate.apiKey ?? "",
          // Anthropic's model enum is just as closed as OpenAI's; the cast is
          // the documented way to point Ax at a model it does not ship an
          // enum member for.
          config: config as never,
        })
      : ai({
          name: "openai",
          apiKey: candidate.apiKey ?? "",
          apiURL: candidate.baseUrl,
          config,
        });

  return { client, candidateId: candidate.id, model };
}
