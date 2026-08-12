import type { AiSdkVendor } from "./ai-sdk";
import type { PoolCandidate } from "./pool";

/**
 * Build the failover pool from environment variables.
 *
 * Everything is comma-separated so a run can be widened without a code change:
 * more keys when one is rate-limited, more models when one is deprecated. Keys
 * and models form a cross product, ordered so that the first model on the first
 * key is tried first.
 */

/** Free models on OpenRouter, in the order worth trying for this task. */
export const OPENROUTER_FREE_MODELS = [
  // Large context and general-purpose: the best fit for Russian role-play.
  "nvidia/nemotron-3.5-lightning:free",
  "inclusionai/ling-3.0-tiny:free",
  "liquid/lfm-2.5-2.6b:free",
] as const;

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function split(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export interface BuildPoolOptions {
  env?: NodeJS.ProcessEnv;
  /** Override the model list, e.g. from a `--models` flag. */
  models?: string[];
}

/**
 * OpenRouter candidates: every key × every model.
 *
 * Free models are the point here — they make a full benchmark cost nothing —
 * but they are small models, so results say more about the pipeline than about
 * production quality. Treat a free-tier run as a regression check, not as the
 * number to show a customer.
 */
export function buildOpenRouterCandidates(
  options: BuildPoolOptions = {},
): PoolCandidate[] {
  const env = options.env ?? process.env;

  const keys = [
    ...split(env.OPENROUTER_API_KEYS),
    ...(env.OPENROUTER_API_KEY ? [env.OPENROUTER_API_KEY] : []),
  ];
  if (keys.length === 0) return [];

  const models =
    options.models && options.models.length > 0
      ? options.models
      : split(env.OPENROUTER_MODELS).length > 0
        ? split(env.OPENROUTER_MODELS)
        : [...OPENROUTER_FREE_MODELS];

  const candidates: PoolCandidate[] = [];
  for (const [modelIndex, model] of models.entries()) {
    for (const [keyIndex, apiKey] of keys.entries()) {
      candidates.push({
        id: `openrouter#${keyIndex + 1}:${model}`,
        vendor: "openai-compatible" as AiSdkVendor,
        model,
        apiKey,
        baseUrl: env.OPENROUTER_BASE_URL ?? OPENROUTER_BASE_URL,
        // OpenRouter proxies many backends; structured-output support varies
        // per model, so the schema always goes into the prompt.
        supportsStructuredOutputs: false,
        headers: {
          // OpenRouter attributes usage by these; harmless elsewhere.
          "HTTP-Referer": env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
          "X-Title": env.OPENROUTER_APP_NAME ?? "Situational Leadership Game",
        },
      });
      void modelIndex;
    }
  }

  return candidates;
}

/** Candidates for a plain OpenAI-compatible endpoint (gateway or OpenAI). */
export function buildOpenAiCandidates(
  env: NodeJS.ProcessEnv = process.env,
): PoolCandidate[] {
  const keys = [
    ...split(env.OPENAI_API_KEYS),
    ...(env.OPENAI_API_KEY ? [env.OPENAI_API_KEY] : []),
  ];
  if (keys.length === 0) return [];

  const models = split(env.OPENAI_MODELS).length
    ? split(env.OPENAI_MODELS)
    : [env.OPENAI_MODEL ?? "gpt-4o-mini"];

  const baseUrl = env.OPENAI_BASE_URL;
  const isGateway =
    Boolean(baseUrl) && !baseUrl?.startsWith("https://api.openai.com");

  const candidates: PoolCandidate[] = [];
  for (const model of models) {
    for (const [keyIndex, apiKey] of keys.entries()) {
      candidates.push({
        id: `openai#${keyIndex + 1}:${model}`,
        vendor: (isGateway ? "openai-compatible" : "openai") as AiSdkVendor,
        model,
        apiKey,
        baseUrl,
        supportsStructuredOutputs: !isGateway,
      });
    }
  }

  return candidates;
}

export function buildAnthropicCandidates(
  env: NodeJS.ProcessEnv = process.env,
): PoolCandidate[] {
  const keys = [
    ...split(env.ANTHROPIC_API_KEYS),
    ...(env.ANTHROPIC_API_KEY ? [env.ANTHROPIC_API_KEY] : []),
  ];
  if (keys.length === 0) return [];

  const models = split(env.ANTHROPIC_MODELS).length
    ? split(env.ANTHROPIC_MODELS)
    : [env.AI_MODEL ?? "claude-opus-5"];

  return models.flatMap((model) =>
    keys.map((apiKey, keyIndex) => ({
      id: `anthropic#${keyIndex + 1}:${model}`,
      vendor: "anthropic" as AiSdkVendor,
      model,
      apiKey,
    })),
  );
}
