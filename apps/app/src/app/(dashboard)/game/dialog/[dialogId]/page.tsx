import { getSession } from "~/auth/server";
import {
  DialogRoom,
  type EvaluationView,
  GameSectionHeader,
  VoiceDialogRoom,
} from "~/components/game";
import { SiteHeader } from "~/components/layout";
import { api } from "~/orpc/server";

export const dynamic = "force-dynamic";

export default async function DialogPage({
  params,
  searchParams,
}: {
  params: Promise<{ dialogId: string }>;
  searchParams: Promise<{ voice?: string | string[] }>;
}) {
  const { dialogId } = await params;
  const { voice } = await searchParams;
  const voiceParam = Array.isArray(voice) ? voice[0] : voice;
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

  const commonProps = {
    dialogId: data.dialog.id,
    employee: {
      name: data.employee.name,
      role: data.employee.role,
      gender: data.employee.gender,
    },
    task: { title: data.task.title },
    shift: {
      round: data.shift.round,
      activeOrders: data.shift.activeOrders,
      soloOnShift: data.shift.soloOnShift,
    },
    initialTurns: data.turns.map((turn) => ({
      role: turn.role,
      text: turn.text,
    })),
    initialFinished: data.dialog.status !== "active",
    variantName: data.variantName,
    userAvatarSeed: session?.user.email,
    uploadedAvatarUrl: session?.user.image ?? undefined,
  };

  if (voiceParam === "1") {
    return (
      <>
        <SiteHeader title="Ролевой диалог с ИИ" />
        <main className="flex flex-1 flex-col p-4 lg:p-6">
          <VoiceDialogRoom {...commonProps} />
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader title="Ролевой диалог" />
      <main className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <GameSectionHeader
          eyebrow={`Практика · Раунд ${data.shift.round}`}
          title={`Разговор с ${data.employee.name}`}
          description="Сотрудник отвечает в своей роли. Ведите естественный диалог и завершите его, когда договоритесь о результате, сроке и контроле."
        />
        <DialogRoom
          {...commonProps}
          variantId={data.dialog.variantId}
          initialEvaluation={evaluation}
        />
      </main>
    </>
  );
}
