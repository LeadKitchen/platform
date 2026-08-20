import { type Catalog, defaultCatalog } from "@acme/game";
import { createPipeline, type Pipeline } from "./pipeline";
import {
  buildAnthropicCandidates,
  buildOpenAiCandidates,
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
 * than a rewrite. `anthropic` is the other supported paid provider.
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

  // Every real provider goes through the pool, even with a single candidate:
  // one code path means failover behaviour is the same in a benchmark and in
  // production, instead of only being exercised when it is needed most.
  const candidates =
    kind === "anthropic"
      ? buildAnthropicCandidates(env)
      : kind === "pool"
        ? [...buildOpenAiCandidates(env), ...buildAnthropicCandidates(env)]
        : buildOpenAiCandidates(env);

  if (candidates.length === 0) {
    throw new Error(
      `Провайдер "${kind}" выбран, но ключей в окружении нет. Задайте OPENAI_API_KEY / ANTHROPIC_API_KEY.`,
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

  if (request.purpose === "admin.characters.simulate") {
    const payload = (() => {
      try {
        return JSON.parse(request.messages.at(-1)?.content ?? "{}") as {
          scenario?: string;
          mode?: "standard" | "peak" | "conflict";
          characters?: Array<{
            profile?: {
              id?: string;
              name?: string;
              personality?: {
                tone?: "confident" | "anxious" | "independent";
              };
            };
          }>;
        };
      } catch {
        return {};
      }
    })();
    const pressure = payload.mode === "peak" || payload.mode === "conflict";
    return {
      scenarioSummary:
        payload.scenario?.slice(0, 500) ??
        "Команда реагирует на изменение приоритета в рабочей смене.",
      responses: (payload.characters ?? []).map((character, index) => {
        const tone = character.profile?.personality?.tone;
        const reply =
          tone === "anxious"
            ? pressure
              ? "Я боюсь не успеть всё одновременно. Назовите один главный приоритет, и я начну с него."
              : "Я начну сейчас, но хочу свериться после первого шага, чтобы не допустить ошибку."
            : tone === "independent"
              ? pressure
                ? "Я перестрою очередь сама. Сообщите только крайний срок и не меняйте приоритет ещё раз."
                : "Задачу понял. Возьму ответственность и вернусь с готовым результатом к обозначенному сроку."
              : pressure
                ? "Вижу риск задержки. Зафиксируйте главный заказ, остальные я распределю по очереди."
                : "Принято. Сначала проверю ресурсы, затем выполню задачу и сообщу о результате.";
        return {
          characterId: character.profile?.id ?? `demo_character_${index + 1}`,
          reply,
          emotion: pressure ? "напряжён и сосредоточен" : "спокоен и собран",
          inferredNeed:
            tone === "anxious"
              ? "короткая контрольная точка и подтверждение приоритета"
              : "ясный ожидаемый результат и стабильный приоритет",
          behavioralRisk: pressure
            ? "при повторной смене приоритета может потерять темп"
            : "существенных рисков в стандартном режиме не показывает",
        };
      }),
    };
  }

  if (request.purpose === "admin.characters.judge") {
    const payload = (() => {
      try {
        return JSON.parse(request.messages.at(-1)?.content ?? "{}") as {
          simulation?: { responses?: Array<{ characterId?: string }> };
        };
      } catch {
        return {};
      }
    })();
    return {
      summary:
        "Демонстрационный судья подтвердил различимость реакций и соответствие профилям персонажей.",
      verdicts: (payload.simulation?.responses ?? []).map((response) => ({
        characterId: response.characterId ?? "unknown_character",
        personaConsistency: 92,
        scenarioFit: 90,
        naturalness: 88,
        safety: 100,
        evidence:
          "Реплика опирается на заданный характер, рабочий контекст и режим нагрузки.",
        recommendation:
          "Персонаж готов к игровому тесту; проверьте его ещё на альтернативном сценарии.",
      })),
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
