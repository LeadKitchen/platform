import { type Catalog, defaultCatalog } from "@acme/game";
import { createPipeline, type Pipeline } from "./pipeline";
import {
  buildAnthropicCandidates,
  buildGeminiCandidates,
  buildGroqCandidates,
  buildOpenAiCandidates,
  buildOpenRouterCandidates,
} from "./provider/config";
import { createMockProvider } from "./provider/mock";
import { createPoolProvider } from "./provider/pool";
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
 * than a rewrite. `groq` and `gemini` are the same shape, added because their
 * free tiers have far more daily headroom than OpenRouter's shared pool.
 */
export function createProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LlmProvider {
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

  if (kind === "mock") {
    return createMockProvider(fallbackResponder);
  }

  // Every real provider goes through the pool, even with a single candidate:
  // one code path means failover behaviour is the same in a benchmark and in
  // production, instead of only being exercised when it is needed most.
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
                  ...buildOpenRouterCandidates({ env }),
                  ...buildGroqCandidates(env),
                  ...buildGeminiCandidates(env),
                  ...buildOpenAiCandidates(env),
                  ...buildAnthropicCandidates(env),
                ]
              : buildOpenAiCandidates(env);

  if (candidates.length === 0) {
    throw new Error(
      `Провайдер "${kind}" выбран, но ключей в окружении нет. Задайте OPENROUTER_API_KEY / GROQ_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY.`,
    );
  }

  return createPoolProvider({
    candidates,
    cooldownMs: Number(env.AI_POOL_COOLDOWN_MS ?? 300_000),
    onEvent: (event) => {
      if (event.kind !== "availability") return;
      const firstLine = event.message.split("\n")[0] ?? event.message;
      console.warn(
        `[пул] ${event.candidateId} выведен из ротации: ${firstLine}`,
      );
    },
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
  if (request.purpose === "admin.characters.draft") {
    const payload = (() => {
      try {
        return JSON.parse(request.messages.at(-1)?.content ?? "{}") as {
          count?: number;
          activeTasks?: Array<{ type?: string }>;
          existingCharacters?: Array<{ id?: string }>;
        };
      } catch {
        return {};
      }
    })();
    const count = Math.max(1, Math.min(5, payload.count ?? 3));
    const taskTypes = [
      ...new Set(
        (payload.activeTasks ?? [])
          .map((task) => task.type)
          .filter((type): type is string => Boolean(type)),
      ),
    ];
    const availableTypes =
      taskTypes.length > 0 ? taskTypes : ["prep", "hot_line", "baking"];
    const existingIds = new Set(
      (payload.existingCharacters ?? []).flatMap((item) =>
        item.id ? [item.id] : [],
      ),
    );
    const archetypes = [
      { name: "Нина Волкова", role: "Повар смены", level: "L3" },
      { name: "Роман Беляев", role: "Стажёр горячего цеха", level: "L1" },
      { name: "Лейла Ахметова", role: "Су-шеф", level: "L4" },
      { name: "Виктор Цой", role: "Повар-заготовщик", level: "L2" },
      { name: "Софья Орлова", role: "Кондитер", level: "L3" },
    ] as const;
    const characters = archetypes.slice(0, count).map((archetype, index) => {
      let id = `demo_character_${index + 1}`;
      while (existingIds.has(id)) id = `${id}_new`;
      existingIds.add(id);
      const competences = Object.fromEntries(
        availableTypes.map((type, typeIndex) => [
          type,
          ["novice", "learning", "capable", "expert"][(index + typeIndex) % 4],
        ]),
      );
      return {
        profile: {
          id,
          name: archetype.name,
          role: archetype.role,
          level: archetype.level,
          competences,
          personality: {
            tone:
              index % 3 === 0
                ? "confident"
                : index % 3 === 1
                  ? "anxious"
                  : "independent",
            reactionToDirective: index % 2 === 0 ? "neutral" : "accepts",
            reactionToSupport: index % 2 === 0 ? "neutral" : "needs",
            typicalErrors: [
              "теряет приоритет при резкой смене задачи",
              "слишком поздно сообщает о риске",
            ],
            motivators: ["ясный результат", "признание прогресса"],
            demotivators: ["противоречивые указания", "публичное давление"],
            biography:
              "Работает в ресторане больше года, знает ритм смены и хочет расти через реальные сложные задачи.",
            communicationStyle:
              "Отвечает коротко и предметно, использует профессиональную кухонную лексику.",
            stressBehavior:
              "При перегрузке ускоряется, начинает перескакивать между заказами и просит расставить приоритеты.",
            speechPatterns: [
              "Давайте по порядку",
              "Скажите, что сейчас главное",
            ],
            boundaries: ["не принимает публичные замечания при всей команде"],
          },
        },
        designIntent:
          "Демонстрационный персонаж создаёт контраст между знакомыми и новыми задачами и меняет реакцию под нагрузкой.",
        preview: {
          normal:
            "Понял задачу. С чего лучше начать и какой результат нужен к выдаче?",
          underPressure:
            "У меня сейчас три заказа одновременно. Назовите главный, иначе начну терять темп.",
          afterSupport:
            "Спасибо, теперь спокойнее. Сделаю первый этап и подойду свериться через десять минут.",
        },
      };
    });
    return {
      teamName: "Демонстрационная команда",
      summary:
        "Набор контрастных персонажей для демонстрации масштабируемого LLM-конструирования игровых ролей.",
      characters,
      warnings: [
        "Использован mock-провайдер: подключите реальную модель для интерпретации свободного брифа.",
      ],
    };
  }

  if (request.purpose === "admin.configuration.draft") {
    return {
      summary: "Безопасный демонстрационный черновик",
      explanation:
        "Mock-провайдер не интерпретирует свободный текст, поэтому конфигурация оставлена без изменений.",
      settings: null,
      employee: null,
      task: null,
      variant: null,
      warnings: [
        "Подключите реальный LLM-провайдер, чтобы преобразовать запрос в изменения.",
      ],
    };
  }

  if (request.purpose === "admin.analytics.insights") {
    return {
      answer:
        "Mock-провайдер подтверждает доступность аналитического сценария, но не интерпретирует агрегаты.",
      findings: [],
      suggestedQuestions: [
        "Какие управленческие действия чаще всего пропускают?",
        "Чем отличаются результаты второго и третьего раундов?",
      ],
    };
  }

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
