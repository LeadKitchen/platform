import {
  createProviderFromEnv,
  describeStrategies,
  engagementRegistry,
  evaluationRegistry,
  knowledgeRegistry,
  personaRegistry,
} from "@acme/ai";
import {
  eq,
  GameEmployee,
  GameProductEvent,
  GameSettings,
  GameTask,
  GameVariant,
} from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import {
  configRevision,
  loadConfigSnapshot,
  mutateConfig,
} from "../../../game/config-version";
import { adminProcedure } from "../../../orpc";

const settingsDraftSchema = z.object({
  defaultVariantId: z.string().min(1).max(64).nullable(),
  defaultRound: z.union([z.literal(2), z.literal(3)]),
  defaultDeadlineMinutes: z.number().int().min(5).max(600),
  allowRoundThree: z.boolean(),
  maxActiveSessions: z.number().int().min(1).max(100),
});

const employeeDraftSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1).max(128),
  role: z.string().min(1).max(128),
  level: z.enum(["L1", "L2", "L3", "L4"]),
  competences: z.record(z.string(), z.string()),
  personality: z.record(z.string(), z.unknown()),
  isActive: z.boolean(),
});

const taskDraftSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_-]+$/),
  title: z.string().min(1).max(256),
  type: z.string().min(1).max(64),
  complexity: z.number().int().min(1).max(5),
  timeCriticality: z.number().int().min(1).max(5),
  requiresCheckpoints: z.boolean(),
  failureModes: z.array(z.string().min(1).max(256)).max(20),
  isActive: z.boolean(),
});

const variantDraftSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1).max(128),
  description: z.string().max(1024),
  engagement: z.string().min(1),
  knowledge: z.string().min(1),
  persona: z.string().min(1),
  evaluation: z.string().min(1),
  model: z.string().nullable(),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]).nullable(),
  params: z.record(z.string(), z.unknown()),
  isActive: z.boolean(),
  weight: z.number().int().min(0).max(100),
});

export const configurationDraftSchema = z.object({
  summary: z.string().min(1).max(600),
  explanation: z.string().min(1).max(1200),
  settings: settingsDraftSchema.nullable(),
  employee: employeeDraftSchema.nullable(),
  task: taskDraftSchema.nullable(),
  variant: variantDraftSchema.nullable(),
  warnings: z.array(z.string().min(1).max(400)).max(8),
});

type ConfigurationDraft = z.infer<typeof configurationDraftSchema>;

function previewChanges(
  current: {
    settings: unknown;
    employees: Array<{ id: string }>;
    tasks: Array<{ id: string }>;
    variants: Array<{ id: string }>;
  },
  draft: ConfigurationDraft,
) {
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  if (draft.settings) {
    changes.push({
      path: "settings.global",
      before: current.settings,
      after: draft.settings,
    });
  }
  for (const [kind, value, rows] of [
    ["employees", draft.employee, current.employees],
    ["tasks", draft.task, current.tasks],
    ["variants", draft.variant, current.variants],
  ] as const) {
    if (!value) continue;
    changes.push({
      path: `${kind}.${value.id}`,
      before: rows.find((row) => row.id === value.id) ?? null,
      after: value,
    });
  }
  return changes;
}

function validateVariant(draft: ConfigurationDraft["variant"]): void {
  if (!draft) return;
  for (const [registry, id] of [
    [engagementRegistry, draft.engagement],
    [knowledgeRegistry, draft.knowledge],
    [personaRegistry, draft.persona],
    [evaluationRegistry, draft.evaluation],
  ] as const) {
    if (!registry.has(id)) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Неизвестная стратегия ${id} для этапа ${registry.kind}`,
      });
    }
  }
}

/**
 * Turns an administrator's plain-language request into a validated draft.
 * Nothing is persisted here: applying the proposal stays an explicit action
 * in the corresponding editor, which keeps LLM mistakes reversible.
 */
export const draftConfiguration = adminProcedure
  .input(z.object({ request: z.string().trim().min(10).max(4000) }))
  .handler(async ({ context, input }) => {
    const snapshot = await loadConfigSnapshot(context.db);
    const settings = snapshot.settings;
    const employees = [...snapshot.employees].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    const tasks = [...snapshot.tasks].sort((left, right) =>
      left.title.localeCompare(right.title),
    );
    const variants = [...snapshot.variants].sort((left, right) =>
      left.id.localeCompare(right.id),
    );

    const strategies = describeStrategies();
    const provider = createProviderFromEnv();

    try {
      const result = await provider.generate({
        purpose: "admin.configuration.draft",
        schemaName: "AdminConfigurationDraft",
        schema: configurationDraftSchema,
        effort: "medium",
        system: [
          "Ты помощник администратора учебного симулятора ситуационного руководства в ресторане.",
          "Преобразуй запрос администратора в безопасный структурированный черновик конфигурации.",
          "Отвечай по-русски. Меняй только сущности, которые действительно нужны для запроса; остальные поля верни null.",
          "Для обновления существующей сущности сохрани её id. Для новой придумай короткий стабильный id в lowercase-kebab-case.",
          "Не придумывай названия стратегий ИИ: используй только id из переданного списка.",
          "Если запрос неоднозначен, выбери консервативные значения и явно добавь предупреждение.",
          "Не обещай, что изменения уже применены: это только черновик для проверки человеком.",
        ].join("\n"),
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              request: input.request,
              current: {
                settings,
                employees,
                tasks,
                variants,
                strategies,
              },
            }),
          },
        ],
      });

      await context.db.insert(GameProductEvent).values({
        userId: context.session.user.id,
        name: "llm_draft_created",
        properties: { model: result.model },
      });

      return {
        draft: result.value,
        baseRevision: configRevision(snapshot),
        changes: previewChanges(
          { settings, employees, tasks, variants },
          result.value,
        ),
        meta: {
          model: result.model,
          latencyMs: result.latencyMs,
        },
      };
    } catch (cause) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message:
          cause instanceof Error
            ? `LLM-помощник не подготовил черновик: ${cause.message}`
            : "LLM-помощник временно недоступен",
      });
    }
  });

/** Apply every card from one reviewed draft atomically and write one audit version. */
export const applyConfiguration = adminProcedure
  .input(
    z.object({
      request: z.string().trim().min(10).max(4000),
      baseRevision: z.string().length(64),
      draft: configurationDraftSchema,
    }),
  )
  .handler(async ({ context, input }) => {
    validateVariant(input.draft.variant);
    const audit = await mutateConfig(
      context.db,
      {
        actorId: context.session.user.id,
        source: "llm",
        summary: input.draft.summary,
      },
      async (tx, before) => {
        if (configRevision(before) !== input.baseRevision) {
          throw new ORPCError("CONFLICT", {
            message:
              "Конфигурация изменилась после подготовки черновика. Создайте новый черновик и проверьте diff ещё раз.",
          });
        }
        if (input.draft.employee) {
          await tx
            .insert(GameEmployee)
            .values(input.draft.employee)
            .onConflictDoUpdate({
              target: GameEmployee.id,
              set: input.draft.employee,
            });
        }
        if (input.draft.task) {
          await tx
            .insert(GameTask)
            .values(input.draft.task)
            .onConflictDoUpdate({
              target: GameTask.id,
              set: input.draft.task,
            });
        }
        if (input.draft.variant) {
          await tx
            .insert(GameVariant)
            .values(input.draft.variant)
            .onConflictDoUpdate({
              target: GameVariant.id,
              set: input.draft.variant,
            });
        }
        if (input.draft.settings) {
          if (
            input.draft.settings.defaultRound === 3 &&
            !input.draft.settings.allowRoundThree
          ) {
            throw new ORPCError("BAD_REQUEST", {
              message: "Нельзя выбрать отключённый третий раунд",
            });
          }
          await tx
            .insert(GameSettings)
            .values({ id: "global", ...input.draft.settings })
            .onConflictDoUpdate({
              target: GameSettings.id,
              set: input.draft.settings,
            });
          const defaultId = input.draft.settings.defaultVariantId;
          if (defaultId) {
            const [variant] = await tx
              .select({ id: GameVariant.id, isActive: GameVariant.isActive })
              .from(GameVariant)
              .where(eq(GameVariant.id, defaultId))
              .limit(1);
            if (!variant?.isActive) {
              throw new ORPCError("BAD_REQUEST", {
                message: "Вариант по умолчанию должен быть активным",
              });
            }
          }
        }
        await tx.insert(GameProductEvent).values({
          userId: context.session.user.id,
          name: "llm_draft_applied",
          properties: {},
        });
        return { request: input.request };
      },
    );
    return { versionId: audit.versionId, changes: audit.changes };
  });

/** Record an explicit human rejection without allowing public event spoofing. */
export const rejectConfiguration = adminProcedure
  .input(z.object({ changes: z.number().int().min(0).max(100) }))
  .handler(async ({ context, input }) => {
    const [event] = await context.db
      .insert(GameProductEvent)
      .values({
        userId: context.session.user.id,
        name: "llm_draft_rejected",
        properties: { changes: input.changes },
      })
      .returning({ id: GameProductEvent.id });
    return event;
  });
