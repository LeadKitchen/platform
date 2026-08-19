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

/**
 * Free OpenRouter models, ordered by how well they held this task's contracts.
 *
 * The order is not the provider's list and not model size — it is the result of
 * `bun run packages/eval/probe-models.ts`, which checks the two things that
 * actually matter here: returning a schema-valid object, and staying in a
 * Russian-speaking role. Models that answer in English or drift into assistant
 * register are useless for the benchmark no matter how large they are.
 *
 * Re-run the probe when adding models; do not extend this list from the
 * provider's catalogue alone.
 *
 * `gemma-4-26b-a4b-it` and `nemotron-3-nano-30b-a3b` passed that probe but
 * were dropped after the first real harness run: both failed
 * `persona.reply`'s schema consistently against the actual production system
 * prompt (longer and stricter than the probe's simplified one), from the very
 * first jobs — not a rate-limit artefact. The probe's shorter prompt was not a
 * faithful stand-in for these two; production evidence overrides it. See
 * `OPENROUTER_REJECTED_MODELS` and `docs/model-pool.md`.
 */
export const OPENROUTER_FREE_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-nano-9b-v2:free",
] as const;

/**
 * Free models that failed either the probe or a real harness run, kept so
 * they are not re-added by mistake.
 *
 * Notably `nemotron-3.5-lightning` (1M context) and `gemma-4-31b-it` are both
 * larger than several models that passed — context size and parameter count
 * predicted nothing here. Whether a model returns a schema-valid object and
 * stays in a Russian role is an empirical question, and this is the answer for
 * this task as of the last check.
 */
export const OPENROUTER_REJECTED_MODELS = [
  "nvidia/nemotron-3.5-lightning:free",
  "google/gemma-4-31b-it:free",
  "openai/gpt-oss-20b:free",
  "inclusionai/ling-3.0-tiny:free",
  // Passed probe-models.ts, failed against the real production prompt:
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
] as const;

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Groq's free tier: 14 400 requests/day per account (30 rpm), no credit card.
 * That is the one free tier in this file with enough daily headroom to run
 * the full harness (~2000 calls) in a single sitting instead of spreading it
 * over several days like the OpenRouter free pool.
 *
 * Probe-verified (`PROBE_PROVIDER=groq bun run packages/eval/probe-models.ts`):
 * the `openai/gpt-oss-*` models look attractive on paper (native
 * `structured_outputs`, large context) but fail in practice for two unrelated
 * reasons — neither is a role/language problem, both are hard blockers:
 *  - native structured outputs 400s because `criteriaAssessmentSchema`'s
 *    optional fields aren't listed in the JSON Schema `required` array, which
 *    Groq's strict mode demands;
 *  - the prompt-based fallback then hits an 8 000 TPM cap on the free/on-demand
 *    tier — these are reasoning models, so the hidden reasoning tokens alone
 *    can exceed that budget before any answer is emitted.
 * `llama-3.1-8b-instant` and both `groq/compound*` also failed the schema
 * check. Only `llama-3.3-70b-versatile` passed cleanly.
 */
export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
export const GROQ_FREE_MODELS = ["llama-3.3-70b-versatile"] as const;

/** Groq models that failed the probe — see the comment on {@link GROQ_FREE_MODELS}. */
export const GROQ_REJECTED_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
  "groq/compound",
  "groq/compound-mini",
] as const;

/**
 * Gemini's OpenAI-compatible endpoint. Free tier is metered per model, not
 * per account (Flash-Lite: 1000 req/day, Flash: 250 req/day), so pick the
 * model to match the volume of the run rather than defaulting to the
 * strongest one.
 */
export const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai";
export const GEMINI_FREE_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
] as const;

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
        // Free routed models are slow, and an uncapped 16k budget lets a
        // rambling or reasoning-heavy backend burn minutes on a call that only
        // needs a short reply or a handful of criteria verdicts.
        maxOutputTokens: 1500,
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
        // Persona replies are short; keeping the cap modest prevents gateways
        // that pre-authorise by maximum output size from rejecting a turn even
        // though the actual answer would only use a few hundred tokens.
        maxOutputTokens: isGateway ? 800 : undefined,
      });
    }
  }

  return candidates;
}

/**
 * Groq candidates: an OpenAI-compatible endpoint with a 14 400 req/day
 * account-wide free tier — the only free pool in this file with enough daily
 * headroom to run the full harness in one sitting.
 *
 * Groq's own docs call the endpoint "mostly compatible, not feature-complete",
 * so `supportsStructuredOutputs` stays `false` here too: whether a given model
 * actually honours JSON mode is an empirical question, answered by
 * `probe-models.ts`, not by the vendor's claim.
 */
export function buildGroqCandidates(
  env: NodeJS.ProcessEnv = process.env,
): PoolCandidate[] {
  const keys = [
    ...split(env.GROQ_API_KEYS),
    ...(env.GROQ_API_KEY ? [env.GROQ_API_KEY] : []),
  ];
  if (keys.length === 0) return [];

  const models = split(env.GROQ_MODELS).length
    ? split(env.GROQ_MODELS)
    : [...GROQ_FREE_MODELS];

  const candidates: PoolCandidate[] = [];
  for (const model of models) {
    for (const [keyIndex, apiKey] of keys.entries()) {
      candidates.push({
        id: `groq#${keyIndex + 1}:${model}`,
        vendor: "openai-compatible" as AiSdkVendor,
        model,
        apiKey,
        baseUrl: env.GROQ_BASE_URL ?? GROQ_BASE_URL,
        supportsStructuredOutputs: false,
        // llama-3.3-70b-versatile sits on an 12k TPM window on the free tier;
        // a short cap keeps one call from eating most of that budget.
        maxOutputTokens: 1500,
      });
    }
  }

  return candidates;
}

/**
 * Gemini candidates via its OpenAI-compatible endpoint.
 *
 * The free tier is metered per model, not per account (Flash-Lite and Flash
 * have separate daily allowances), so each model gets its own `quotaGroup` —
 * exhausting Flash-Lite must not cool down Flash on the same key.
 */
export function buildGeminiCandidates(
  env: NodeJS.ProcessEnv = process.env,
): PoolCandidate[] {
  const keys = [
    ...split(env.GEMINI_API_KEYS),
    ...(env.GEMINI_API_KEY ? [env.GEMINI_API_KEY] : []),
  ];
  if (keys.length === 0) return [];

  const models = split(env.GEMINI_MODELS).length
    ? split(env.GEMINI_MODELS)
    : [...GEMINI_FREE_MODELS];

  const baseUrl = env.GEMINI_BASE_URL ?? GEMINI_BASE_URL;
  const candidates: PoolCandidate[] = [];
  for (const model of models) {
    for (const [keyIndex, apiKey] of keys.entries()) {
      candidates.push({
        id: `gemini#${keyIndex + 1}:${model}`,
        vendor: "openai-compatible" as AiSdkVendor,
        model,
        apiKey,
        baseUrl,
        supportsStructuredOutputs: false,
        quotaGroup: `${baseUrl}|${apiKey}|${model}`,
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

  const baseUrl = env.ANTHROPIC_BASE_URL;

  return models.flatMap((model) =>
    keys.map((apiKey, keyIndex) => ({
      id: `anthropic#${keyIndex + 1}:${model}`,
      vendor: "anthropic" as AiSdkVendor,
      model,
      apiKey,
      baseUrl,
    })),
  );
}
