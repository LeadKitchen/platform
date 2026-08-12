import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acme/ui";
import Link from "next/link";
import { OrderQueue } from "~/components/game";
import { SiteHeader } from "~/components/layout";
import { api } from "~/orpc/server";

export const dynamic = "force-dynamic";

const DIALOG_STATUS_LABELS: Record<string, string> = {
  active: "идёт",
  finished: "завершён",
};

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  const [{ session, orders }, reference, dialogs] = await Promise.all([
    api.game.session.byId({ id: sessionId }),
    api.game.catalog.reference(),
    api.game.dialog.list({ sessionId }),
  ]);

  const employeeName = (id: string) =>
    reference.employees.find((employee) => employee.id === id)?.name ?? id;
  const taskTitle = (id: string) =>
    reference.tasks.find((task) => task.id === id)?.title ?? id;

  return (
    <>
      <SiteHeader title={session.title} />
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {session.title}
              <Badge variant="outline">Раунд {session.round}</Badge>
              <Badge variant="secondary">
                {session.variantId ?? "вариант по умолчанию"}
              </Badge>
            </CardTitle>
            <CardDescription>
              {session.round === 3
                ? "В смене остался один повар: очередь растёт, нужны приоритеты и поддержка."
                : "Распределите заказы по сотрудникам и поставьте задачи."}
            </CardDescription>
          </CardHeader>
        </Card>

        <OrderQueue
          sessionId={session.id}
          defaultDeadlineMinutes={reference.settings.defaultDeadlineMinutes}
          employees={reference.employees}
          tasks={reference.tasks}
          orders={orders}
        />

        <Card>
          <CardHeader>
            <CardTitle>Диалоги</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {dialogs.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Диалогов пока нет.
              </p>
            ) : null}

            {dialogs.map((row) => (
              <Link
                key={row.dialog.id}
                href={`/game/dialog/${row.dialog.id}`}
                className="hover:bg-muted flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <span>
                  {employeeName(row.dialog.employeeId)} ·{" "}
                  {taskTitle(row.dialog.taskId)}
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant="outline">
                    {DIALOG_STATUS_LABELS[row.dialog.status] ??
                      row.dialog.status}
                  </Badge>
                  {row.evaluation ? (
                    <Badge>{row.evaluation.scorePercent}%</Badge>
                  ) : null}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
