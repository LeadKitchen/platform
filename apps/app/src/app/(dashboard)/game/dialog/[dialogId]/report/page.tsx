import type { ManagementStyle } from "@acme/game";
import { STYLE_LABELS } from "@acme/game/styles";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Progress,
} from "@acme/ui";
import { IconCheck, IconTarget, IconX } from "@tabler/icons-react";
import { redirect } from "next/navigation";
import { getSession } from "~/auth/server";
import { GameSectionHeader, PrintButton } from "~/components/game";
import { SiteHeader } from "~/components/layout";
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
  const metCriteria = criteria.filter((criterion) => criterion.met);

  return (
    <>
      <SiteHeader title="Разбор разговора" />
      <main className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <GameSectionHeader
          eyebrow="Результаты · AI roleplay"
          title={`Разговор с ${data.employee.name}`}
          description={`${data.employee.role} · ${data.task.title} · ${dateLabel(evaluation.createdAt)}`}
          action={
            <div className="no-print">
              <PrintButton />
            </div>
          }
        />

        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b py-5">
            <div>
              <CardTitle>{data.employee.name}</CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                Разговор провёл {session?.user.name ?? "Участник"}
              </p>
            </div>
            <Badge variant="outline">Раунд {data.dialog.round}</Badge>
          </CardHeader>
          <CardContent className="grid p-0 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Общая оценка"
              value={`${evaluation.scorePercent}%`}
            />
            <Metric
              label="Результат"
              value={OUTCOME_LABELS[outcome.status] ?? outcome.status}
            />
            <Metric
              label="Критерии"
              value={`${metCriteria.length} из ${criteria.length}`}
            />
            <Metric
              label="Мотивация"
              value={`${outcome.motivationDelta > 0 ? "+" : ""}${outcome.motivationDelta}`}
            />
          </CardContent>
        </Card>

        <nav className="no-print flex gap-7 overflow-x-auto border-b px-1 text-sm">
          <a
            href="#summary"
            className="border-foreground border-b-2 pb-3 font-medium"
          >
            Сводка
          </a>
          <a href="#criteria" className="text-muted-foreground pb-3">
            Критерии
          </a>
          <a href="#styles" className="text-muted-foreground pb-3">
            Стили
          </a>
          <a href="#outcome" className="text-muted-foreground pb-3">
            Результат
          </a>
        </nav>

        <div className="print-area grid items-start gap-4 text-sm xl:grid-cols-[minmax(0,1fr)_360px] print:block">
          <div className="flex flex-col gap-4">
            <Card id="summary">
              <CardHeader>
                <CardTitle>Сводка разговора</CardTitle>
              </CardHeader>
              <CardContent className="leading-6">
                {evaluation.summary}
              </CardContent>
            </Card>

            <Card id="criteria">
              <CardHeader>
                <CardTitle>Чек-лист разговора</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col">
                  {criteria.map((criterion) => (
                    <li
                      key={criterion.id}
                      className="flex items-start gap-3 border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
                    >
                      <span
                        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${criterion.met ? "border-primary text-primary" : "text-muted-foreground"}`}
                      >
                        {criterion.met ? (
                          <IconCheck className="size-3" />
                        ) : (
                          <IconX className="size-3" />
                        )}
                      </span>
                      <span>
                        <span className="font-medium">{criterion.title}</span>
                        {criterion.comment ? (
                          <span className="text-muted-foreground mt-1 block">
                            {criterion.comment}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <aside className="flex flex-col gap-4">
            <Card id="styles">
              <CardHeader>
                <CardTitle>Стиль руководства</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-muted-foreground text-xs">Ожидался</p>
                    <p className="mt-1 font-medium">
                      {styleLabel(evaluation.expectedStyle)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Проявился</p>
                    <p className="mt-1 font-medium">
                      {styleLabel(evaluation.actualStyle)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  {distribution.map(([style, share]) => (
                    <div key={style}>
                      <div className="mb-1.5 flex justify-between gap-3 text-xs">
                        <span>{styleLabel(style)}</span>
                        <span className="tabular-nums">
                          {Math.round(share * 100)}%
                        </span>
                      </div>
                      <Progress value={share * 100} className="h-1.5" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card id="outcome">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconTarget className="size-4" /> Итог ситуации
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {OUTCOME_LABELS[outcome.status] ?? outcome.status}
                  </Badge>
                  <Badge variant="outline">
                    {outcome.onTime ? "в срок" : "с опозданием"}
                  </Badge>
                </div>
                <p className="leading-6">{outcome.summary}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Структура оценки</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-xs">
                <ScorePart label="Стиль" value={`${breakdown.style} / 45`} />
                <ScorePart
                  label="Действия"
                  value={`${breakdown.actions} / 35`}
                />
                <ScorePart
                  label="Результат"
                  value={`${breakdown.outcome} / 20`}
                />
                <ScorePart label="Штрафы" value={String(breakdown.penalties)} />
              </CardContent>
            </Card>
          </aside>
        </div>

        <footer className="text-muted-foreground border-t pt-3 text-xs">
          Сформировано в тренажёре «Ситуационное руководство» ·{" "}
          {dateLabel(new Date())}
        </footer>
      </main>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b p-5 last:border-b-0 sm:border-r sm:[&:nth-child(2n)]:border-r-0 xl:border-b-0 xl:[&:nth-child(2n)]:border-r xl:last:border-r-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-2 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ScorePart({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
    </div>
  );
}
