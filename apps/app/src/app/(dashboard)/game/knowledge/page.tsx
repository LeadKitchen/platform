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

export default async function KnowledgePage() {
  const [mine, authSession] = await Promise.all([api.org.mine(), getSession()]);

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
  const documents = await api.org.knowledge.list();

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
        />
      </main>
    </>
  );
}
