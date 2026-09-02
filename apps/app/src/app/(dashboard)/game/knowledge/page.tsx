import { redirect } from "next/navigation";
import {
  type KnowledgeDocumentView,
  KnowledgeLibrary,
} from "~/components/game";
import { SiteHeader } from "~/components/layout";
import { api } from "~/orpc/server";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const mine = await api.org.mine();
  if (!mine.isFacilitator) redirect("/game");
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
