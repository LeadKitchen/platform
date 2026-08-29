import {
  type CoachingAssignmentView,
  CoachingPaths,
  type CoachingPathView,
  type RoleplayScenarioView,
} from "~/components/game";
import { SiteHeader } from "~/components/layout";
import { api } from "~/orpc/server";

export const dynamic = "force-dynamic";

export default async function CoachingPathsPage() {
  const mine = await api.org.mine();
  const paths = mine.isFacilitator ? await api.org.coachingPaths.list() : [];
  const roleplay = mine.isFacilitator ? await api.game.roleplay.list() : null;
  const assignments = mine.isFacilitator
    ? []
    : await api.game.coachingPaths.listMine();
  return (
    <>
      <SiteHeader
        title="Coaching Paths"
        breadcrumbs={[
          { label: "Деловая игра", href: "/game" },
          { label: "Coaching Paths" },
        ]}
      />
      <main className="flex flex-1 flex-col gap-5 p-4 lg:p-6">
        <CoachingPaths
          isFacilitator={mine.isFacilitator}
          initialPaths={paths as unknown as CoachingPathView[]}
          assignments={assignments as unknown as CoachingAssignmentView[]}
          scenarios={(roleplay?.scenarios ?? []) as RoleplayScenarioView[]}
        />
      </main>
    </>
  );
}
