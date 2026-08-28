import { listWorkspaces } from "../../game/organizations";
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
  const { activeOrgId, workspaces } = await listWorkspaces(context.db, userId);
  const activeWorkspace = workspaces.find((item) => item.id === activeOrgId);

  return {
    orgId: activeWorkspace?.id ?? null,
    orgName: activeWorkspace?.name ?? null,
    isFacilitator: activeWorkspace?.isFacilitator ?? false,
    workspaces,
  };
});
