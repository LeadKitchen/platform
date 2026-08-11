import {
  describeStrategies,
  engagementRegistry,
  evaluationRegistry,
  knowledgeRegistry,
  personaRegistry,
  variantConfigSchema,
} from "@acme/ai";
import { asc, eq, GameVariant } from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

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

    const [variant] = await context.db
      .insert(GameVariant)
      .values(values)
      .onConflictDoUpdate({ target: GameVariant.id, set: values })
      .returning();

    return variant;
  });

/**
 * Switch an arm on or off without deleting its history.
 *
 * @example client.admin.game.variants.setActive({ id: "graph-rag", isActive: false })
 */
export const setActive = adminProcedure
  .input(z.object({ id: z.string().max(64), isActive: z.boolean() }))
  .handler(async ({ context, input }) => {
    const [variant] = await context.db
      .update(GameVariant)
      .set({ isActive: input.isActive })
      .where(eq(GameVariant.id, input.id))
      .returning();

    if (!variant) {
      throw new ORPCError("NOT_FOUND", { message: "Вариант не найден" });
    }
    return variant;
  });

export const adminGameVariantsRouter = { list, upsert, setActive };
