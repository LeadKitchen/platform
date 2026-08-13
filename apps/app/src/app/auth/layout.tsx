import { paths } from "@acme/config";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getSession } from "~/auth/server";

export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Keep the sign-in screen available during a temporary database outage.
  // The actual sign-in request will still report the infrastructure error.
  const session = await getSession().catch(() => null);

  // If user is already authenticated, redirect to dashboard
  if (session?.user) {
    redirect(paths.dashboard.root);
  }

  return <>{children}</>;
}
