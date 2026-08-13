import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Progress,
} from "@acme/ui";
import { IconBulb, IconCheck, IconMessages } from "@tabler/icons-react";
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
  const finishedDialogs = dialogs.filter((row) => row.evaluation).length;
  const progress =
    dialogs.length === 0 ? 0 : (finishedDialogs / dialogs.length) * 100;

  return (
    <>
      <SiteHeader title={session.title} />
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
        <Card className="bg-muted/30">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardDescription>Практическая смена</CardDescription>
                <CardTitle className="mt-1 text-2xl">{session.title}</CardTitle>
              </div>
              <Badge variant="outline">Раунд {session.round}</Badge>
            </div>
            <CardDescription>
              {session.round === 3
                ? "В смене остался один повар: очередь растёт, нужны приоритеты и поддержка."
                : "Распределяйте рабочие ситуации и тренируйте постановку задач разным сотрудникам."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">Прогресс смены</span>
              <span className="text-muted-foreground">
                {finishedDialogs} из {dialogs.length} разговоров завершено
              </span>
            </div>
            <Progress value={progress} />
          </CardContent>
        </Card>

        <Alert>
          <IconBulb />
          <AlertTitle>Как пройти практику</AlertTitle>
          <AlertDescription>
            Создайте ситуацию ниже, проведите разговор и завершите его, когда
            сотрудник понял задачу, срок и способ контроля. Затем попробуйте
            другую комбинацию сотрудника и задания.
          </AlertDescription>
        </Alert>

        <OrderQueue
          sessionId={session.id}
          defaultDeadlineMinutes={reference.settings.defaultDeadlineMinutes}
          employees={reference.employees}
          tasks={reference.tasks}
          orders={orders}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconMessages /> История разговоров
            </CardTitle>
            <CardDescription>
              Откройте разговор, чтобы продолжить или пересмотреть обратную
              связь.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {dialogs.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Здесь появятся разговоры этой смены.
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
                    <Badge>
                      <IconCheck /> {row.evaluation.scorePercent}%
                    </Badge>
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
