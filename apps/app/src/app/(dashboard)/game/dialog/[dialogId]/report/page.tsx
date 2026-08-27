import type { ManagementStyle } from "@acme/game";
import { STYLE_LABELS } from "@acme/game/styles";
import { Badge, Separator } from "@acme/ui";
import { redirect } from "next/navigation";
import { getSession } from "~/auth/server";
import { PrintButton } from "~/components/game";
import { api } from "~/orpc/server";

export const dynamic = "force-dynamic";

interface CriterionRow {
  id: string;
  title: string;
  met: boolean;
  comment?: string | null;
}

interface OutcomeView {
  status: string;
  onTime: boolean;
  defects: string[];
  motivationDelta: number;
  summary: string;
}

const OUTCOME_LABELS: Record<string, string> = {
  success: "Заказ выполнен",
  partial: "Выполнен с замечаниями",
  failed: "Заказ испорчен",
};

function styleLabel(style: string): string {
  return STYLE_LABELS[style as ManagementStyle] ?? style;
}

function dateLabel(value: Date | string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function DialogReportPage({
  params,
}: {
  params: Promise<{ dialogId: string }>;
}) {
  const { dialogId } = await params;
  const [data, session] = await Promise.all([
    api.game.dialog.byId({ dialogId }),
    getSession(),
  ]);

  if (!data.evaluation) redirect(`/game/dialog/${dialogId}`);

  const evaluation = data.evaluation;
  const criteria = evaluation.criteria as CriterionRow[];
  const outcome = evaluation.outcome as unknown as OutcomeView;
  const breakdown = evaluation.breakdown as Record<string, number>;
  const distribution = Object.entries(
    evaluation.styleDistribution as Record<string, number>,
  )
    .filter(([, share]) => share > 0.01)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <div className="no-print">
        <PrintButton />
      </div>

      <div className="print-area mx-auto flex w-full max-w-2xl flex-col gap-6 text-sm text-black print:max-w-none">
        <header className="flex flex-col gap-1 border-b border-black/20 pb-4">
          <p className="text-xs uppercase tracking-wide text-black/60">
            Разбор управленческого разговора
          </p>
          <h1 className="text-2xl font-semibold">
            {session?.user.name ?? "Участник"} — раунд {data.dialog.round}
          </h1>
          <p className="text-black/70">
            Сотрудник: {data.employee.name} ({data.employee.role}) · Задача:{" "}
            {data.task.title}
          </p>
          <p className="text-black/50 text-xs">
            {dateLabel(evaluation.createdAt)}
          </p>
        </header>

        <section className="flex items-baseline justify-between">
          <span className="text-black/70">Итоговая оценка</span>
          <span className="text-4xl font-semibold tabular-nums">
            {evaluation.scorePercent}%
          </span>
        </section>
        <p>{evaluation.summary}</p>

        <Separator />

        <section className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-black/60">Ожидаемый стиль</p>
            <p className="font-medium">
              {styleLabel(evaluation.expectedStyle)}
            </p>
          </div>
          <div>
            <p className="text-black/60">Фактический стиль</p>
            <p className="font-medium">{styleLabel(evaluation.actualStyle)}</p>
          </div>
        </section>

        <section className="flex flex-col gap-1.5">
          <p className="text-black/60">Раскладка по стилям</p>
          {distribution.map(([style, share]) => (
            <div key={style} className="flex items-center justify-between">
              <span>{styleLabel(style)}</span>
              <span className="tabular-nums">{Math.round(share * 100)}%</span>
            </div>
          ))}
        </section>

        <Separator />

        <section className="flex flex-col gap-1.5">
          <p className="text-black/60">Чек-лист разговора</p>
          <ul className="flex flex-col gap-1">
            {criteria.map((criterion) => (
              <li
                key={criterion.id}
                className="flex items-start justify-between gap-3"
              >
                <span>
                  {criterion.title}
                  {criterion.comment ? (
                    <span className="text-black/60">
                      {" "}
                      — {criterion.comment}
                    </span>
                  ) : null}
                </span>
                <Badge
                  variant={criterion.met ? "success" : "outline"}
                  className="shrink-0"
                >
                  {criterion.met ? "выполнено" : "пропущено"}
                </Badge>
              </li>
            ))}
          </ul>
        </section>

        <Separator />

        <section className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {OUTCOME_LABELS[outcome.status] ?? outcome.status}
            </Badge>
            <Badge variant="outline">
              {outcome.onTime ? "в срок" : "с опозданием"}
            </Badge>
            <Badge variant="outline">
              мотивация {outcome.motivationDelta > 0 ? "+" : ""}
              {outcome.motivationDelta}
            </Badge>
          </div>
          <p>{outcome.summary}</p>
        </section>

        <div className="text-black/60 grid grid-cols-4 gap-2 text-xs">
          <span>Стиль: {breakdown.style} / 45</span>
          <span>Действия: {breakdown.actions} / 35</span>
          <span>Результат: {breakdown.outcome} / 20</span>
          <span>Штрафы: {breakdown.penalties}</span>
        </div>

        <footer className="text-black/40 border-t border-black/20 pt-3 text-xs">
          Сформировано в тренажёре «Ситуационное руководство» ·{" "}
          {dateLabel(new Date())}
        </footer>
      </div>
    </div>
  );
}
