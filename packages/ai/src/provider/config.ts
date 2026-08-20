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
