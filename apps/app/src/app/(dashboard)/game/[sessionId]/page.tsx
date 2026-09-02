import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Progress,
} from "@acme/ui";
import { IconActivity } from "@tabler/icons-react";
import { GameSectionHeader, OrderQueue } from "~/components/game";
import { SiteHeader } from "~/components/layout";
import { api } from "~/orpc/server";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  const [{ session, orders, variantName }, reference, dialogs] =
    await Promise.all([
      api.game.session.byId({ id: sessionId }),
      api.game.catalog.reference(),
      api.game.dialog.list({ sessionId }),
    ]);

  const finishedDialogs = dialogs.filter((row) => row.evaluation).length;
  const progress =
    dialogs.length === 0 ? 0 : (finishedDialogs / dialogs.length) * 100;

  return (
    <>
      <SiteHeader title={session.title} />
      <main className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <GameSectionHeader
          eyebrow={`Практика · Раунд ${session.round}`}
          title={session.title}
          description={
            session.round === 3
              ? "Один сотрудник остаётся в смене: расставляйте приоритеты и поддерживайте темп."
              : "Выбирайте рабочую ситуацию, сотрудника и отрабатывайте постановку задачи."
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">ИИ: {variantName}</Badge>
              <Badge variant="outline">Активная смена</Badge>
            </div>
          }
        />

        <Card className="gap-3 py-4">
          <CardHeader className="items-center sm:grid-cols-[1fr_auto]">
            <CardTitle className="flex items-center gap-2 text-sm">
              <IconActivity className="size-4" /> Прогресс смены
            </CardTitle>
            <span className="text-muted-foreground text-xs tabular-nums sm:col-start-2 sm:row-start-1">
              {finishedDialogs} из {dialogs.length} разговоров завершено
            </span>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-3 text-sm">
              <Progress value={progress} className="h-2 flex-1" />
              <Badge variant="secondary">{Math.round(progress)}%</Badge>
            </div>
          </CardContent>
        </Card>

        <OrderQueue
          sessionId={session.id}
          defaultDeadlineMinutes={reference.settings.defaultDeadlineMinutes}
          employees={reference.employees}
          tasks={reference.tasks}
          orders={orders.map((order) => ({
            ...order,
            dialogId: dialogs.find((row) => row.dialog.orderId === order.id)
              ?.dialog.id,
            scorePercent: dialogs.find((row) => row.dialog.orderId === order.id)
              ?.evaluation?.scorePercent,
          }))}
        />
      </main>
    </>
  );
}
