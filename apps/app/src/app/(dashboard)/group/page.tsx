import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@acme/ui";
import {
  IconArrowDown,
  IconArrowRight,
  IconArrowUp,
  IconDownload,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";
import { redirect } from "next/navigation";
import { AssignPracticeButton } from "~/components/group/assign-practice-button";
import { SiteHeader } from "~/components/layout";
import { api } from "~/orpc/server";

export const dynamic = "force-dynamic";

const SESSIONS_LIMIT = 100;

const STATUS_LABELS: Record<string, string> = {
  active: "идёт",
  completed: "завершена",
  archived: "в архиве",
};

const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  assigned: "ожидает практики",
  in_progress: "в работе",
};

function dateLabel(value: Date | string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function TrendBadge({ trend }: { trend: number | null }) {
  if (trend === null) {
    return <Badge variant="outline">мало данных</Badge>;
  }
  if (trend > 0) {
    return (
      <Badge variant="success">
        <IconArrowUp data-icon="inline-start" />+{trend}
      </Badge>
    );
  }
  if (trend < 0) {
    return (
      <Badge variant="destructive">
        <IconArrowDown data-icon="inline-start" />
        {trend}
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      <IconArrowRight data-icon="inline-start" />
      без изменений
    </Badge>
  );
}

export default async function GroupPage() {
  const mine = await api.org.mine();
  if (!mine.isFacilitator && !mine.isAdmin) redirect("/game");

  const [sessions, { people, topMissedOrg }, assignments] = await Promise.all([
    api.org.sessions.list({ limit: SESSIONS_LIMIT, offset: 0 }),
    api.org.people.list({}),
    api.org.training.list(),
  ]);
  const dialogsTotal = sessions.reduce((sum, row) => sum + row.dialogs, 0);
  const scored = sessions.filter((row) => row.avgScore !== null);
  const avgScore =
    scored.length > 0
      ? Math.round(
          scored.reduce((sum, row) => sum + (row.avgScore ?? 0), 0) /
            scored.length,
        )
      : null;

  return (
    <>
      <SiteHeader breadcrumbs={[{ label: "Моя группа" }]} />
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-muted-foreground text-sm">
              {mine.orgName ?? "Организация"}
            </p>
            <h1 className="text-3xl font-medium tracking-[-0.035em]">
              Эффективность команды
            </h1>
            <p className="text-muted-foreground text-sm">
              Сравнивайте активность, качество разговоров и динамику участников.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" render={<a href="/group/members" />}>
              <IconUsers data-icon="inline-start" />
              Участники
            </Button>
            <Button variant="outline" render={<a href="/group/configure" />}>
              <IconSettings data-icon="inline-start" />
              Настроить
            </Button>
            <Button
              variant="outline"
              render={<a href="/api/export/org-sessions" />}
            >
              <IconDownload data-icon="inline-start" />
              Скачать CSV
            </Button>
          </div>
        </div>

        <div className="bg-card grid overflow-hidden rounded-xl border sm:grid-cols-3 sm:divide-x">
          <div className="flex flex-col gap-1 border-b p-5 sm:border-b-0">
            <span className="text-muted-foreground text-xs font-medium uppercase tracking-[0.06em]">
              Сессии
            </span>
            <span className="text-3xl font-medium tracking-[-0.03em] tabular-nums">
              {sessions.length}
            </span>
            <span className="text-muted-foreground text-xs">
              До {SESSIONS_LIMIT} последних запусков
            </span>
          </div>
          <div className="flex flex-col gap-1 border-b p-5 sm:border-b-0">
            <span className="text-muted-foreground text-xs font-medium uppercase tracking-[0.06em]">
              Диалоги
            </span>
            <span className="text-3xl font-medium tracking-[-0.03em] tabular-nums">
              {dialogsTotal}
            </span>
            <span className="text-muted-foreground text-xs">
              В загруженных сессиях
            </span>
          </div>
          <div className="flex flex-col gap-1 p-5">
            <span className="text-muted-foreground text-xs font-medium uppercase tracking-[0.06em]">
              Средний балл
            </span>
            <span className="text-3xl font-medium tracking-[-0.03em] tabular-nums">
              {avgScore !== null ? `${avgScore}%` : "—"}
            </span>
            <span className="text-muted-foreground text-xs">
              По оценённым загруженным сессиям
            </span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>По участникам</CardTitle>
              <CardDescription>
                Динамика — разница среднего балла второй половины диалогов
                участника относительно первой.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Участник</TableHead>
                    <TableHead>Диалогов</TableHead>
                    <TableHead>Средний балл</TableHead>
                    <TableHead>Стиль в точку</TableHead>
                    <TableHead>Динамика</TableHead>
                    <TableHead>Чаще всего пропускает</TableHead>
                    <TableHead>Практика</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {people.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-muted-foreground text-center"
                      >
                        Пока никто из группы не играл.
                      </TableCell>
                    </TableRow>
                  ) : (
                    people.map((person) => (
                      <TableRow key={person.userId}>
                        <TableCell className="font-medium">
                          {person.name}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {person.dialogs}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {person.avgScore}%
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {Math.round(person.styleMatchRate * 100)}%
                        </TableCell>
                        <TableCell>
                          <TrendBadge trend={person.trend} />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {person.topMissed.length > 0
                            ? person.topMissed
                                .map((item) => `${item.title} ×${item.missed}`)
                                .join(", ")
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <AssignPracticeButton
                            participantId={person.userId}
                            participantName={person.name}
                            focus={person.topMissed[0]}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>Проблемные критерии</CardTitle>
              <CardDescription>
                Что чаще всего пропускает вся группа.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 py-5">
              {topMissedOrg.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Пока недостаточно данных.
                </p>
              ) : (
                topMissedOrg.map((item) => (
                  <div key={item.id} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span>{item.title}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {Math.round(item.share * 100)}%
                      </span>
                    </div>
                    <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                      <div
                        className="bg-destructive h-full rounded-full"
                        style={{ width: `${Math.round(item.share * 100)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b py-4">
            <CardTitle>Назначенная практика</CardTitle>
            <CardDescription>
              Ведущий назначает повторную попытку прямо из слабого критерия
              участника. Сессия автоматически закрывает назначение после
              завершения.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 py-5">
            {assignments.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Активных назначений пока нет.
              </p>
            ) : (
              assignments.map(({ assignment, participant }) => (
                <div
                  key={assignment.id}
                  className="hover:bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">{participant}</span>
                    <span className="text-muted-foreground text-sm">
                      {assignment.criterionTitle}
                    </span>
                  </span>
                  <Badge variant="outline">
                    {ASSIGNMENT_STATUS_LABELS[assignment.status] ??
                      assignment.status}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b py-4">
            <CardTitle>Сессии</CardTitle>
            <CardDescription>
              Новые сессии появляются здесь, как только участник открывает игру.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Сессия</TableHead>
                  <TableHead>Участник</TableHead>
                  <TableHead>Раунд</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Диалогов</TableHead>
                  <TableHead>Средний балл</TableHead>
                  <TableHead>Создана</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-muted-foreground text-center"
                    >
                      Пока никто из группы не играл.
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions.map((row) => (
                    <TableRow key={row.session.id}>
                      <TableCell className="font-medium">
                        {row.session.title}
                      </TableCell>
                      <TableCell>{row.participant ?? "—"}</TableCell>
                      <TableCell>{row.session.round}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {STATUS_LABELS[row.session.status] ??
                            row.session.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {row.dialogs}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {row.avgScore !== null ? `${row.avgScore}%` : "—"}
                      </TableCell>
                      <TableCell>{dateLabel(row.session.createdAt)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
