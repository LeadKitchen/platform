import { Button } from "@acme/ui";
import { redirect } from "next/navigation";
import { DeleteTeamCard } from "~/components/group/delete-team-card";
import { MembersWorkspace } from "~/components/group/members-workspace";
import { TeamNameForm } from "~/components/group/team-name-form";
import { SiteHeader } from "~/components/layout";
import { api } from "~/orpc/server";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const mine = await api.org.mine();
  if (!mine.isFacilitator && !mine.isAdmin) redirect("/game");

  const { members } = await api.org.members.list();
  const teamName = mine.orgName ?? "Команда";
  const canDeleteTeam = mine.workspaces.length > 1;

  return (
    <>
      <SiteHeader
        breadcrumbs={[
          { label: "Моя группа", href: "/group" },
          { label: "Участники" },
        ]}
      />
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
        <div>
          <h1 className="text-3xl font-medium tracking-[-0.035em]">
            Участники
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Управляйте участниками команды, ролями и составом «{teamName}».
          </p>
        </div>

        <MembersWorkspace members={members} />

        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-medium tracking-[-0.02em]">Настройки</h2>

          <TeamNameForm initialName={teamName} />

          <div className="bg-card flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5">
            <div>
              <p className="font-medium">Места и оплата</p>
              <p className="text-muted-foreground mt-1 max-w-lg text-sm">
                Подключение тарифа и оплаты за место скоро появится в этом
                разделе.
              </p>
            </div>
            <Button variant="outline" disabled className="shrink-0">
              Скоро
            </Button>
          </div>

          <DeleteTeamCard teamName={teamName} canDelete={canDeleteTeam} />
        </div>
      </div>
    </>
  );
}
