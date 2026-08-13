import { AppAdmin, db, eq } from "@acme/db";
import { SidebarInset, SidebarProvider } from "@acme/ui";
import type { ReactNode } from "react";
import { getSession } from "~/auth/server";
import { AppSidebar } from "~/components/sidebar";

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
        columns: { userId: true, role: true },
      });
  const adminRole = isBootstrapAdmin
    ? "admin"
    : (persistedAdmin?.role as
        | "admin"
        | "methodologist"
        | "facilitator"
        | undefined);
  return (
    <SidebarProvider>
      <AppSidebar
        user={{
          name: session.user.name,
          email: session.user.email,
          avatar: session.user.image || "",
        }}
        adminRole={adminRole}
      />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
