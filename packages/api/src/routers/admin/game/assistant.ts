import { createProviderFromEnv, describeStrategies } from "@acme/ai";
import { asc, GameEmployee, GameTask, GameVariant } from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { loadGameSettings } from "../../../game/settings";
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

/**
 * Turns an administrator's plain-language request into a validated draft.
 * Nothing is persisted here: applying the proposal stays an explicit action
 * in the corresponding editor, which keeps LLM mistakes reversible.
 */
export const draftConfiguration = adminProcedure
  .input(z.object({ request: z.string().trim().min(10).max(4000) }))
  .handler(async ({ context, input }) => {
    const [settings, employees, tasks, variants] = await Promise.all([
      loadGameSettings(context.db),
      context.db.select().from(GameEmployee).orderBy(asc(GameEmployee.name)),
      context.db.select().from(GameTask).orderBy(asc(GameTask.title)),
      context.db.select().from(GameVariant).orderBy(asc(GameVariant.id)),
    ]);

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

      return {
        draft: result.value,
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
