import { redirect } from "next/navigation";
import {
  ScorecardLibrary,
  type ScorecardTemplateView,
  type ScorecardView,
} from "~/components/game";
import { SiteHeader } from "~/components/layout";
import { api } from "~/orpc/server";

export const dynamic = "force-dynamic";

export default async function ScorecardsPage() {
  const mine = await api.org.mine();
  if (!mine.isFacilitator) redirect("/game");
  const data = await api.org.scorecards.list();

  return (
    <>
      <SiteHeader
        title="Рубрики оценки"
        breadcrumbs={[
          { label: "Деловая игра", href: "/game" },
          { label: "Рубрики оценки" },
        ]}
      />
      <main className="flex flex-1 flex-col p-4 lg:p-6">
        <ScorecardLibrary
          initialSystem={data.system}
          initialTemplates={data.templates as ScorecardTemplateView[]}
          initialScorecards={data.scorecards as ScorecardView[]}
        />
      </main>
    </>
  );
}
