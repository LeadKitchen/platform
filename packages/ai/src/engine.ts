import { type Catalog, defaultCatalog } from "@acme/game";
import { createPipeline, type Pipeline } from "./pipeline";
import { type AiSdkVendor, createAiSdkProvider } from "./provider/ai-sdk";
import { createMockProvider } from "./provider/mock";
import type { LlmProvider } from "./provider/types";
import { personaReplySchema } from "./schemas";
import {
  BUILT_IN_VARIANTS,
  DEFAULT_VARIANT_ID,
  resolveVariant,
  type VariantConfig,
} from "./variants";

/**
 * Build the provider from the environment.
 *
 * `AI_PROVIDER=mock` gives a canned character with no network access — useful
 * for local demos, CI and anyone running the game without an API key.
 * `openai` covers any OpenAI-compatible endpoint (OpenAI, a gateway, vLLM),
 * which is what makes cross-model comparison an arm of the experiment rather
 * than a rewrite.
 */
export function createProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LlmProvider {
  const kind =
    env.AI_PROVIDER ??
    (env.ANTHROPIC_API_KEY
      ? "anthropic"
      : env.OPENAI_API_KEY
        ? "openai"
        : "mock");

  if (kind === "mock") {
    return createMockProvider(fallbackResponder);
  }

  if (kind === "anthropic") {
    return createAiSdkProvider({
      vendor: "anthropic",
      model: env.AI_MODEL ?? "claude-opus-5",
      apiKey: env.ANTHROPIC_API_KEY,
    });
  }

  // A custom base URL means a gateway, and gateways routinely accept
  // `response_format` while ignoring it — ask the SDK to state the schema in
  // the prompt instead of trusting native structured outputs.
  const baseUrl = env.OPENAI_BASE_URL;
  const isGateway =
    Boolean(baseUrl) && !baseUrl?.startsWith("https://api.openai.com");

  return createAiSdkProvider({
    vendor: (isGateway ? "openai-compatible" : "openai") as AiSdkVendor,
    model: env.AI_MODEL ?? env.OPENAI_MODEL ?? "gpt-4o-mini",
    apiKey: env.OPENAI_API_KEY,
    baseUrl,
    supportsStructuredOutputs: !isGateway,
  });
}

/**
 * Minimal stand-in character used by the mock provider: enough to exercise the
 * whole pipeline end to end without pretending to be a real role-play.
 */
export function fallbackResponder(request: {
  purpose: string;
  messages: { content: string }[];
}): unknown {
  if (request.purpose === "persona.reply") {
    return personaReplySchema.parse({
      reply:
        "Понял вас. Уточню детали, если что-то будет непонятно по ходу работы.",
      understood: null,
      readiness: "confident",
      requests: [],
      confirmsCheckpoints: false,
      emotionDelta: 0,
    });
  }

  if (request.purpose === "evaluation.style") {
    return {
      distribution: {
        directive: 0.25,
        coaching: 0.25,
        supporting: 0.25,
        delegating: 0.25,
      },
      evidence: [],
    };
  }

  return { criteria: [], toxicTurns: 0, toxicQuotes: [] };
}

export interface EngineOptions {
  provider?: LlmProvider;
  catalog?: Catalog;
  /** Variants stored in the database, merged over the built-in ones. */
  variants?: VariantConfig[];
  defaultVariantId?: string;
}

export interface Engine {
  readonly provider: LlmProvider;
  readonly catalog: Catalog;
  readonly defaultVariantId: string;
  variants(): VariantConfig[];
  pipeline(variantId?: string): Pipeline;
}

/**
 * Entry point used by the API layer and by the offline harness.
 *
 * Note that the engine is stateless with respect to dialogs: the caller owns
 * the `DialogContext` and persists it. That keeps the AI module usable both
 * from the web platform (state in Postgres) and from a batch replay (state in
 * memory).
 */
export function createEngine(options: EngineOptions = {}): Engine {
  const provider = options.provider ?? createProviderFromEnv();
  const catalog = options.catalog ?? defaultCatalog;
  const extra = options.variants ?? [];
  const defaultVariantId =
    options.defaultVariantId ??
    process.env.AI_DEFAULT_VARIANT ??
    DEFAULT_VARIANT_ID;

  return {
    provider,
    catalog,
    defaultVariantId,
    variants() {
      const merged = new Map<string, VariantConfig>();
      for (const variant of BUILT_IN_VARIANTS) merged.set(variant.id, variant);
      for (const variant of extra) merged.set(variant.id, variant);
      return [...merged.values()];
    },
    pipeline(variantId = defaultVariantId) {
      return createPipeline(resolveVariant(variantId, extra), {
        provider,
        catalog,
      });
    },
  };
}
