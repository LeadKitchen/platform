import { eq, GameFacilitator, GameOrganization, GameOrgMember } from "@acme/db";
import { z } from "zod";

import {
  listWorkspaces,
  setActiveWorkspace,
  slugifyOrgId,
} from "../../game/organizations";
import { protectedProcedure } from "../../orpc";

/** Workspace picker and self-service team creation used by the app sidebar. */
export const orgWorkspaceRouter = {
  list: protectedProcedure.handler(async ({ context }) =>
    listWorkspaces(context.db, context.session.user.id),
  ),

  select: protectedProcedure
    .input(z.object({ orgId: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      await setActiveWorkspace(
        context.db,
        context.session.user.id,
        input.orgId,
      );
      return { orgId: input.orgId };
    }),

  create: protectedProcedure
    .input(z.object({ name: z.string().trim().min(2).max(128) }))
    .handler(async ({ context, input }) => {
      const base = slugifyOrgId(input.name);
      let id = base;
      for (let suffix = 2; ; suffix++) {
        const [existing] = await context.db
          .select({ id: GameOrganization.id })
          .from(GameOrganization)
          .where(eq(GameOrganization.id, id))
          .limit(1);
        if (!existing) break;
        id = `${base}-${suffix}`;
      }

      await context.db.transaction(async (tx) => {
        await tx.insert(GameOrganization).values({ id, name: input.name });
        await tx.insert(GameOrgMember).values({
          userId: context.session.user.id,
          orgId: id,
        });
        await tx.insert(GameFacilitator).values({
          userId: context.session.user.id,
          orgId: id,
          grantedBy: context.session.user.id,
        });
        await setActiveWorkspace(tx, context.session.user.id, id);
      });

      return { id, name: input.name, isFacilitator: true };
    }),
};
