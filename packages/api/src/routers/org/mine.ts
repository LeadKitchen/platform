import { eq, GameOrganization } from "@acme/db";
import { getFacilitatorOrgId, getMemberOrgId } from "../../game/organizations";
import { protectedProcedure } from "../../orpc";

/**
 * The current user's organization membership, if any, and whether they
 * facilitate it. The client uses this to decide whether to show the group
 * dashboard at all — most participants belong to no org.
 *
 * @example client.org.mine()
 */
export const mine = protectedProcedure.handler(async ({ context }) => {
  const userId = context.session.user.id;
  const [memberOrgId, facilitatorOrgId] = await Promise.all([
    getMemberOrgId(context.db, userId),
    getFacilitatorOrgId(context.db, userId),
  ]);

  const orgId = facilitatorOrgId ?? memberOrgId;
  if (!orgId) return { orgId: null, orgName: null, isFacilitator: false };

  const [org] = await context.db
    .select({ name: GameOrganization.name })
    .from(GameOrganization)
    .where(eq(GameOrganization.id, orgId))
    .limit(1);

  return {
    orgId,
    orgName: org?.name ?? null,
    isFacilitator: facilitatorOrgId !== null,
  };
});
