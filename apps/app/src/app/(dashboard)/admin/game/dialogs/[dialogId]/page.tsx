import type { ManagementStyle } from "@acme/game";
import { STYLE_LABELS } from "@acme/game/styles";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
} from "@acme/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "~/components/layout";
import { api } from "~/orpc/server";

function styleLabel(style: string): string {
  return STYLE_LABELS[style as ManagementStyle] ?? style;
}

function eventText(event: {
  type: string;
  payload: Record<string, unknown>;
}): string {
  if (event.type === "manager_utterance" || event.type === "employee_reply") {
    return String(event.payload.text ?? "");
  }
  if (event.type === "employee_silent") {
    return String(event.payload.reason ?? "Сотрудник не ответил");
  }
  if (event.type === "error") {
    return String(event.payload.message ?? "Ошибка этапа AI-конвейера");
  }
  return JSON.stringify(event.payload, null, 2);
}

export default async function AdminDialogPage({
  params,
}: {
  params: Promise<{ dialogId: string }>;
}) {
  const { dialogId } = await params;
  const row = await api.admin.game.dialogDetail({ id: dialogId });
  if (!row) notFound();

  return (
    <>
      <SiteHeader title="Разбор диалога" />
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link
              href="/admin/game"
              className="text-muted-foreground text-sm hover:underline"
            >
              ← Назад в админ-панель
            </Link>
            <h1 className="mt-2 text-2xl font-semibold">{row.sessionTitle}</h1>
            <p className="text-muted-foreground">
              {row.employeeName} · {row.taskTitle}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Раунд {row.dialog.round}</Badge>
            <Badge variant="secondary">{row.dialog.variantId}</Badge>
            <Badge>{row.dialog.status}</Badge>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>Хронология</CardTitle>
              <CardDescription>
                Полный журнал событий, сохранённый в базе данных.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {row.events.map((event) => {
                const manager = event.type === "manager_utterance";
                return (
                  <div
                    key={event.id}
                    className={
                      manager
                        ? "bg-primary/10 ml-auto max-w-[85%] rounded-lg p-3"
                        : "bg-muted mr-auto max-w-[85%] rounded-lg p-3"
                    }
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="outline">#{event.seq}</Badge>
                      <span className="text-muted-foreground text-xs">
                        {event.type}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">
                      {eventText(event)}
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Итоговая оценка</CardTitle>
              <CardDescription>
                Управленческий стиль, результат и телеметрия.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {row.evaluation ? (
                <>
                  <div className="text-4xl font-semibold tabular-nums">
                    {row.evaluation.scorePercent}%
                  </div>
                  <p className="text-sm">{row.evaluation.summary}</p>
                  <Separator />
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Стиль</span>
                    <span className="font-medium">
                      {styleLabel(row.evaluation.expectedStyle)} →{" "}
                      {styleLabel(row.evaluation.actualStyle)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Задержка</span>
                    <span>{row.evaluation.latencyMs} мс</span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Токены</span>
                    <span>
                      {row.evaluation.inputTokens + row.evaluation.outputTokens}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Стоимость</span>
                    <span>${row.evaluation.costUsd.toFixed(5)}</span>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Диалог ещё не завершён и не оценён.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
