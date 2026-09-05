import { eq, GameFacilitator, GameOrganization, GameOrgMember } from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import {
  listWorkspaces,
  requireFacilitatorOrgId,
  setActiveWorkspace,
  slugifyOrgId,
} from "../../game/organizations";
import { protectedProcedure, resolveIsAdmin } from "../../orpc";

/** Workspace picker and self-service team creation used by the app sidebar. */
export const orgWorkspaceRouter = {
  list: protectedProcedure.handler(async ({ context }) => {
    const isAdmin = await resolveIsAdmin(context.db, context.session.user);
    return listWorkspaces(context.db, context.session.user.id, isAdmin);
  }),

  select: protectedProcedure
    .input(z.object({ orgId: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const isAdmin = await resolveIsAdmin(context.db, context.session.user);
      await setActiveWorkspace(
        context.db,
        context.session.user.id,
        input.orgId,
        isAdmin,
      );
      return { orgId: input.orgId };
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(128),
        description: z.string().trim().max(256).optional().default(""),
      }),
    )
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
        await tx.insert(GameOrganization).values({
          id,
          name: input.name,
          description: input.description,
        });
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

      return {
        id,
        name: input.name,
        description: input.description,
        isFacilitator: true,
      };
    }),

  rename: protectedProcedure
    .input(z.object({ name: z.string().trim().min(2).max(128) }))
    .handler(async ({ context, input }) => {
      const orgId = await requireFacilitatorOrgId(
        context.db,
        context.session.user.id,
      );
      await context.db
        .update(GameOrganization)
        .set({ name: input.name })
        .where(eq(GameOrganization.id, orgId));
      return { id: orgId, name: input.name };
    }),

  /** Permanently deletes the active workspace. Refuses a user's only team. */
  remove: protectedProcedure.handler(async ({ context }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );
    const { workspaces } = await listWorkspaces(
      context.db,
      context.session.user.id,
    );
    if (workspaces.length <= 1) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "Нельзя удалить единственную команду. Сначала создайте другую.",
      });
    }

    await context.db
      .delete(GameOrganization)
      .where(eq(GameOrganization.id, orgId));

    return { id: orgId };
  }),
};
