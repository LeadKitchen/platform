import { GameOrganizationConfigure } from "@acme/db";
import { z } from "zod";
import { requireFacilitatorOrgId } from "../../game/organizations";
import { protectedProcedure } from "../../orpc";

const input = z.object({
  context: z.record(z.string(), z.string().max(1000)).default({}),
  scorecard: z.object({ name: z.string().min(1).max(128), criterionIds: z.array(z.string().min(1)).max(32) }),
  automation: z.object({ enabled: z.boolean(), threshold: z.number().int().min(0).max(100) }),
});

export const orgConfigureRouter = {
  get: protectedProcedure.handler(async ({ context }) => {
    const orgId = await requireFacilitatorOrgId(context.db, context.session.user.id);
    return context.db.query.GameOrganizationConfigure.findFirst({ where: (table, { eq }) => eq(table.orgId, orgId) });
  }),
  save: protectedProcedure.input(input).handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(context.db, context.session.user.id);
    await context.db.insert(GameOrganizationConfigure).values({ orgId, ...input }).onConflictDoUpdate({ target: GameOrganizationConfigure.orgId, set: input });
    return { orgId, ...input };
  }),
};
