import { getSession } from "~/auth/server";
import { DialogRoom, type EvaluationView } from "~/components/game";
import { SiteHeader } from "~/components/layout";
import { api } from "~/orpc/server";

export const dynamic = "force-dynamic";

export default async function DialogPage({
  params,
}: {
  params: Promise<{ dialogId: string }>;
}) {
  const { dialogId } = await params;
  const [data, session] = await Promise.all([
    api.game.dialog.byId({ dialogId }),
    getSession(),
  ]);

  const evaluation: EvaluationView | null = data.evaluation
    ? {
        scorePercent: data.evaluation.scorePercent,
        expectedStyle: data.evaluation.expectedStyle,
        actualStyle: data.evaluation.actualStyle,
        styleDistribution: data.evaluation.styleDistribution,
        criteria: data.evaluation.criteria as EvaluationView["criteria"],
        outcome: data.evaluation
          .outcome as unknown as EvaluationView["outcome"],
        breakdown: data.evaluation
          .breakdown as unknown as EvaluationView["breakdown"],
        summary: data.evaluation.summary,
      }
    : null;

  return (
    <>
      <SiteHeader
        breadcrumbs={[
          { label: "Деловая игра", href: "/game" },
          { label: `Раунд ${data.shift.round}` },
          { label: `Разговор с ${data.employee.name}` },
        ]}
      />
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
        <div>
          <p className="text-muted-foreground text-sm">
            Тренировка управленческого разговора
          </p>
          <h1 className="text-2xl font-semibold">
            Разговор с {data.employee.name}
          </h1>
          <p className="text-muted-foreground text-sm">
            Сотрудник отвечает в своей роли. Ведите естественный диалог и
            завершите его, когда договоритесь о задаче.
          </p>
        </div>
        <DialogRoom
          dialogId={data.dialog.id}
          variantId={data.dialog.variantId}
          employee={{ name: data.employee.name, role: data.employee.role }}
          task={{ title: data.task.title }}
          shift={{
            round: data.shift.round,
            activeOrders: data.shift.activeOrders,
            soloOnShift: data.shift.soloOnShift,
          }}
          initialTurns={data.turns.map((turn) => ({
            role: turn.role,
            text: turn.text,
          }))}
          initialEvaluation={evaluation}
          initialFinished={data.dialog.status !== "active"}
          userAvatarSeed={session?.user.email}
        />
      </div>
    </>
  );
}
