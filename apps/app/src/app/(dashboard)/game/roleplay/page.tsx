import {
  type RoleplayAttemptView,
  RoleplayCatalog,
  type RoleplayScenarioView,
} from "~/components/game";
import { SiteHeader } from "~/components/layout";
import { api } from "~/orpc/server";

export const dynamic = "force-dynamic";

export default async function RoleplayPage() {
  const data = await api.game.roleplay.list();

  return (
    <>
      <SiteHeader
        title="AI Roleplay"
        breadcrumbs={[
          { label: "Деловая игра", href: "/game" },
          { label: "AI Roleplay" },
        ]}
      />
      <main className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <RoleplayCatalog
          initialScenarios={data.scenarios as RoleplayScenarioView[]}
          attempts={data.attempts as RoleplayAttemptView[]}
          reference={data.reference}
        />
      </main>
    </>
  );
}
