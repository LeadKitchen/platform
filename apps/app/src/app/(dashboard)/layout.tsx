import { AppAdmin, db, eq, GameFacilitator } from "@acme/db";
import { SidebarInset, SidebarProvider } from "@acme/ui";
import type { ReactNode } from "react";
import { getSession } from "~/auth/server";
import { AppSidebar } from "~/components/sidebar";
import { userAvatarUri } from "~/lib/avatar";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSession();
  if (!session?.user) {
    return <>{children}</>;
  }
  const isBootstrapAdmin = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .some(
      (email) =>
        email.trim().toLowerCase() === session.user.email.toLowerCase(),
    );
  const persistedAdmin = isBootstrapAdmin
    ? undefined
    : await db.query.AppAdmin.findFirst({
        where: eq(AppAdmin.userId, session.user.id),
        columns: { userId: true },
      });
  const isAdmin = isBootstrapAdmin || persistedAdmin !== undefined;
  const facilitatorGrant = await db.query.GameFacilitator.findFirst({
    where: eq(GameFacilitator.userId, session.user.id),
    columns: { userId: true },
  });
  return (
    <SidebarProvider>
      <AppSidebar
        user={{
          name: session.user.name,
          email: session.user.email,
          avatar: session.user.image || userAvatarUri(session.user.email),
        }}
        isAdmin={isAdmin}
        isFacilitator={facilitatorGrant !== undefined}
      />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
