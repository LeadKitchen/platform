import {
  describeStrategies,
  engagementRegistry,
  evaluationRegistry,
  knowledgeRegistry,
  personaRegistry,
  variantCategorySchema,
  variantConfigSchema,
} from "@acme/ai";
import { asc, eq, GameSettings, GameVariant } from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { mutateConfig } from "../../../game/config-version";
import { adminProcedure } from "../../../orpc";

/**
 * Every experiment arm, active or not, plus the strategies available to build
 * new ones from.
 *
 * @example client.admin.game.variants.list()
 */
export const list = adminProcedure.handler(async ({ context }) => ({
  variants: await context.db
    .select()
    .from(GameVariant)
    .orderBy(asc(GameVariant.id)),
  strategies: describeStrategies(),
}));

/**
 * Create or update an arm.
 *
 * Stage ids are validated against the registries here rather than at the first
 * dialog, so a typo cannot take a live session down.
 *
 * @example client.admin.game.variants.upsert({ id: "rag-v2", knowledge: "rag-lexical", ... })
 */
export const upsert = adminProcedure
  .input(
    variantConfigSchema.extend({
      isActive: z.boolean().default(true),
      weight: z.number().int().min(0).max(100).default(1),
    }),
  )
  .handler(async ({ context, input }) => {
    if (!input.isActive) {
      const settings = await context.db.query.GameSettings.findFirst({
        where: eq(GameSettings.id, "global"),
        columns: { defaultVariantId: true, categoryVariantIds: true },
      });
      if (
        settings?.defaultVariantId === input.id ||
        Object.values(settings?.categoryVariantIds ?? {}).includes(input.id)
      ) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "Сначала уберите этот вариант из живых по категориям или выберите другой вариант ИИ по умолчанию",
        });
      }
    }

    for (const [registry, id] of [
      [engagementRegistry, input.engagement],
      [knowledgeRegistry, input.knowledge],
      [personaRegistry, input.persona],
      [evaluationRegistry, input.evaluation],
    ] as const) {
      if (!registry.has(id)) {
        throw new ORPCError("BAD_REQUEST", {
          message: `Неизвестная стратегия «${id}» для этапа ${registry.kind}. Доступны: ${registry.ids().join(", ")}`,
        });
      }
    }

    const values = {
      id: input.id,
      name: input.name,
      description: input.description,
      category: input.category,
      engagement: input.engagement,
      knowledge: input.knowledge,
      persona: input.persona,
      evaluation: input.evaluation,
      model: input.model ?? null,
      effort: input.effort ?? null,
      params: input.params,
      isActive: input.isActive,
      weight: input.weight,
    };

    const audit = await mutateConfig(
      context.db,
      {
        actorId: context.session.user.id,
        source: "form",
        summary: `Вариант ИИ: ${input.name}`,
      },
      async (tx, before) => {
        if (
          !values.isActive &&
          (before.settings.defaultVariantId === values.id ||
            Object.values(before.settings.categoryVariantIds).includes(
              values.id,
            ))
        ) {
          throw new ORPCError("BAD_REQUEST", {
            message:
              "Сначала уберите этот вариант из живых по категориям или выберите другой вариант ИИ по умолчанию",
          });
        }
        const [variant] = await tx
          .insert(GameVariant)
          .values(values)
          .onConflictDoUpdate({ target: GameVariant.id, set: values })
          .returning();
        return variant;
      },
    );
    return audit.result;
  });

/**
 * Switch an arm on or off without deleting its history.
 *
 * @example client.admin.game.variants.setActive({ id: "graph-rag", isActive: false })
 */
export const setActive = adminProcedure
  .input(z.object({ id: z.string().max(64), isActive: z.boolean() }))
  .handler(async ({ context, input }) => {
    const audit = await mutateConfig(
      context.db,
      {
        actorId: context.session.user.id,
        source: "form",
        summary: `${input.isActive ? "Включён" : "Выключен"} вариант ${input.id}`,
      },
      async (tx, before) => {
        if (
          !input.isActive &&
          (before.settings.defaultVariantId === input.id ||
            Object.values(before.settings.categoryVariantIds).includes(
              input.id,
            ))
        ) {
          throw new ORPCError("BAD_REQUEST", {
            message:
              "Сначала уберите этот вариант из живых по категориям или выберите другой вариант ИИ по умолчанию",
          });
        }
        const [variant] = await tx
          .update(GameVariant)
          .set({ isActive: input.isActive })
          .where(eq(GameVariant.id, input.id))
          .returning();
        return variant;
      },
    );
    const variant = audit.result;

    if (!variant) {
      throw new ORPCError("NOT_FOUND", { message: "Вариант не найден" });
    }
    return variant;
  });

/**
 * Set (or clear) the one variant live in the game for a category. Each
 * category holds at most one live variant — setting a new one replaces
 * whatever was live for that category before.
 *
 * @example client.admin.game.variants.setCategoryVariant({ category: "retrieval", variantId: "hybrid-rag" })
 */
export const setCategoryVariant = adminProcedure
  .input(
    z.object({
      category: variantCategorySchema,
      variantId: z.string().max(64).nullable(),
    }),
  )
  .handler(async ({ context, input }) => {
    const audit = await mutateConfig(
      context.db,
      {
        actorId: context.session.user.id,
        source: "form",
        summary: input.variantId
          ? `Живой вариант категории «${input.category}»: ${input.variantId}`
          : `Категория «${input.category}» осталась без живого варианта`,
      },
      async (tx, before) => {
        if (input.variantId) {
          const variant = await tx.query.GameVariant.findFirst({
            where: eq(GameVariant.id, input.variantId),
            columns: { category: true, isActive: true },
          });
          if (!variant) {
            throw new ORPCError("NOT_FOUND", { message: "Вариант не найден" });
          }
          if (!variant.isActive) {
            throw new ORPCError("BAD_REQUEST", {
              message: "Сначала включите вариант",
            });
          }
          if (variant.category !== input.category) {
            throw new ORPCError("BAD_REQUEST", {
              message: "Вариант относится к другой категории",
            });
          }
        }
        const categoryVariantIds = { ...before.settings.categoryVariantIds };
        if (input.variantId) {
          categoryVariantIds[input.category] = input.variantId;
        } else {
          delete categoryVariantIds[input.category];
        }
        const [settings] = await tx
          .insert(GameSettings)
          .values({ id: "global", categoryVariantIds })
          .onConflictDoUpdate({
            target: GameSettings.id,
            set: { categoryVariantIds },
          })
          .returning();
        return settings;
      },
    );
    return audit.result;
  });

export const adminGameVariantsRouter = {
  list,
  upsert,
  setActive,
  setCategoryVariant,
};
