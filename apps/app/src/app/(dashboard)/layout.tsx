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
  const isAdmin = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .some(
      (email) =>
        email.trim().toLowerCase() === session.user.email.toLowerCase(),
    );
  return (
    <SidebarProvider>
      <AppSidebar
        user={{
          name: session.user.name,
          email: session.user.email,
          avatar: session.user.image || "",
        }}
        isAdmin={isAdmin}
      />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
