import {
  and,
  desc,
  eq,
  GameScorecard,
  type GameScorecardCategory,
} from "@acme/db";
import { CRITERION_IDS } from "@acme/game";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { requireFacilitatorOrgId } from "../../game/organizations";
import { SCORECARD_TEMPLATES, SYSTEM_SCORECARD } from "../../game/scorecards";
import { protectedProcedure } from "../../orpc";

const criterionSchema = z.object({
  criterionId: z.enum(CRITERION_IDS),
  title: z.string().trim().min(2).max(256),
  description: z.string().trim().max(1000).default(""),
  weight: z.number().int().min(1).max(100),
  required: z.boolean(),
  scoring: z.enum(["percent", "pass_fail"]),
  condition: z.string().trim().max(500).optional(),
});

const categorySchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(2).max(128),
  weight: z.number().int().min(1).max(100),
  criteria: z.array(criterionSchema).min(1).max(CRITERION_IDS.length),
});

const scorecardFields = z
  .object({
    name: z.string().trim().min(2).max(160),
    description: z.string().trim().max(1000).default(""),
    categories: z.array(categorySchema).min(1).max(6),
  })
  .superRefine((value, context) => {
    const categoryWeight = value.categories.reduce(
      (sum, item) => sum + item.weight,
      0,
    );
    if (categoryWeight !== 100) {
      context.addIssue({
        code: "custom",
        path: ["categories"],
        message: "Сумма весов категорий должна быть равна 100%",
      });
    }
    const ids = value.categories.flatMap((item) =>
      item.criteria.map((criterion) => criterion.criterionId),
    );
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["categories"],
        message: "Один критерий нельзя использовать дважды",
      });
    }
    const requiredCount = value.categories.reduce(
      (sum, item) =>
        sum + item.criteria.filter((criterion) => criterion.required).length,
      0,
    );
    if (requiredCount === 0) {
      context.addIssue({
        code: "custom",
        path: ["categories"],
        message: "Отметьте обязательным хотя бы один критерий",
      });
    }
  });

function response(row: typeof GameScorecard.$inferSelect) {
  return {
    ...row,
    source: "custom" as const,
    criteriaCount: row.categories.reduce(
      (sum, item) => sum + item.criteria.length,
      0,
    ),
  };
}

async function assertOwned(
  context: Parameters<typeof requireFacilitatorOrgId>[0],
  orgId: string,
  id: string,
) {
  const [row] = await context
    .select()
    .from(GameScorecard)
    .where(
      and(
        eq(GameScorecard.id, id),
        eq(GameScorecard.orgId, orgId),
        eq(GameScorecard.isArchived, false),
      ),
    )
    .limit(1);
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Scorecard не найден" });
  }
  return row;
}

export const list = protectedProcedure.handler(async ({ context }) => {
  const orgId = await requireFacilitatorOrgId(
    context.db,
    context.session.user.id,
  );
  const rows = await context.db
    .select()
    .from(GameScorecard)
    .where(
      and(eq(GameScorecard.orgId, orgId), eq(GameScorecard.isArchived, false)),
    )
    .orderBy(desc(GameScorecard.isActive), desc(GameScorecard.updatedAt));
  return {
    system: {
      ...SYSTEM_SCORECARD,
      isActive: !rows.some((row) => row.isActive),
    },
    templates: SCORECARD_TEMPLATES,
    scorecards: rows.map(response),
  };
});

export const create = protectedProcedure
  .input(scorecardFields.extend({ activate: z.boolean().default(false) }))
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );
    const { activate, ...values } = input;
    return context.db.transaction(async (tx) => {
      if (activate) {
        await tx
          .update(GameScorecard)
          .set({ isActive: false })
          .where(eq(GameScorecard.orgId, orgId));
      }
      const [created] = await tx
        .insert(GameScorecard)
        .values({
          ...values,
          categories: values.categories as GameScorecardCategory[],
          orgId,
          createdBy: context.session.user.id,
          isActive: activate,
        })
        .returning();
      if (!created) throw new Error("Не удалось создать Scorecard");
      return response(created);
    });
  });

export const update = protectedProcedure
  .input(scorecardFields.extend({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );
    await assertOwned(context.db, orgId, input.id);
    const { id, ...values } = input;
    const [updated] = await context.db
      .update(GameScorecard)
      .set({
        ...values,
        categories: values.categories as GameScorecardCategory[],
      })
      .where(eq(GameScorecard.id, id))
      .returning();
    if (!updated) throw new Error("Не удалось обновить Scorecard");
    return response(updated);
  });

export const activate = protectedProcedure
  .input(z.object({ id: z.union([z.literal("system"), z.uuid()]) }))
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );
    if (input.id !== "system") {
      await assertOwned(context.db, orgId, input.id);
    }
    await context.db.transaction(async (tx) => {
      await tx
        .update(GameScorecard)
        .set({ isActive: false })
        .where(eq(GameScorecard.orgId, orgId));
      if (input.id !== "system") {
        await tx
          .update(GameScorecard)
          .set({ isActive: true })
          .where(eq(GameScorecard.id, input.id));
      }
    });
    return { id: input.id };
  });

export const archive = protectedProcedure
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );
    await assertOwned(context.db, orgId, input.id);
    await context.db
      .update(GameScorecard)
      .set({ isArchived: true, isActive: false })
      .where(eq(GameScorecard.id, input.id));
    return { id: input.id };
  });

export const orgScorecardsRouter = { list, create, update, activate, archive };
