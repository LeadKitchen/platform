import { type Catalog, defaultCatalog } from "@acme/game";
import { createPipeline, type Pipeline } from "./pipeline";
import { createAnthropicProvider } from "./provider/anthropic";
import { createMockProvider } from "./provider/mock";
import type { LlmEffort, LlmProvider } from "./provider/types";
import { personaReplySchema } from "./schemas";
import {
  BUILT_IN_VARIANTS,
  DEFAULT_VARIANT_ID,
  resolveVariant,
  type VariantConfig,
} from "./variants";

const EFFORTS: LlmEffort[] = ["low", "medium", "high", "xhigh", "max"];

function readEffort(value: string | undefined): LlmEffort | undefined {
  return EFFORTS.find((effort) => effort === value);
}

/**
 * Build the provider from the environment.
 *
 * `AI_PROVIDER=mock` gives a canned character with no network access — useful
 * for local demos, CI and anyone running the game without an API key.
 */
export function createProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LlmProvider {
  const kind =
    env.AI_PROVIDER ?? (env.ANTHROPIC_API_KEY ? "anthropic" : "mock");

  if (kind === "mock") {
    return createMockProvider(fallbackResponder);
  }

  return createAnthropicProvider({
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.AI_MODEL,
    effort: readEffort(env.AI_EFFORT),
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
