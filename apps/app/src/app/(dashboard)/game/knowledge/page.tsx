import { AppAdmin, db, eq } from "@acme/db";
import { redirect } from "next/navigation";
import { getSession } from "~/auth/server";
import {
  type KnowledgeDocumentView,
  KnowledgeLibrary,
} from "~/components/game";
import { SiteHeader } from "~/components/layout";
import { api } from "~/orpc/server";

export const dynamic = "force-dynamic";

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ orgId?: string }>;
}) {
  const [mine, authSession, { orgId: requestedOrgId }] = await Promise.all([
    api.org.mine(),
    getSession(),
    searchParams,
  ]);

  // Mirrors the check in `(dashboard)/layout.tsx` — there is no shared
  // helper across server components, only the oRPC `adminProcedure`
  // middleware, so the "am I admin" question is answered the same way here.
  const isBootstrapAdmin = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .some(
      (email) =>
        authSession?.user &&
        email.trim().toLowerCase() === authSession.user.email.toLowerCase(),
    );
  const persistedAdmin =
    isBootstrapAdmin || !authSession?.user
      ? undefined
      : await db.query.AppAdmin.findFirst({
          where: eq(AppAdmin.userId, authSession.user.id),
          columns: { userId: true },
        });
  const isAdmin = isBootstrapAdmin || persistedAdmin !== undefined;

  if (!mine.isFacilitator && !isAdmin) redirect("/game");

  // A facilitator only ever has their own team's knowledge base; an admin
  // instead picks any team, since `org.knowledge.*` accepts an explicit
  // `orgId` only for admins (see `resolveOrgId` in the knowledge router).
  const orgs = isAdmin ? await api.admin.game.organizations.list() : [];
  const orgId = isAdmin ? (requestedOrgId ?? orgs[0]?.id) : undefined;

  const documents =
    isAdmin && !orgId ? [] : await api.org.knowledge.list({ orgId });

  return (
    <>
      <SiteHeader
        title="База знаний"
        breadcrumbs={[
          { label: "Деловая игра", href: "/game" },
          { label: "База знаний" },
        ]}
      />
      <main className="flex flex-1 flex-col p-4 lg:p-6">
        <KnowledgeLibrary
          initialDocuments={documents as KnowledgeDocumentView[]}
          orgId={orgId}
          orgOptions={
            isAdmin
              ? orgs.map((org) => ({ id: org.id, name: org.name }))
              : undefined
          }
        />
      </main>
    </>
  );
}
