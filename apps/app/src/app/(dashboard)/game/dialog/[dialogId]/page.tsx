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
  const data = await api.game.dialog.byId({ dialogId });

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
      <SiteHeader title={`${data.employee.name} — ${data.task.title}`} />
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
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
        />
      </div>
    </>
  );
}
