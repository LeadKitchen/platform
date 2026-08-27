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
import { IconDownload } from "@tabler/icons-react";
import { redirect } from "next/navigation";
import { SiteHeader } from "~/components/layout";
import { api } from "~/orpc/server";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  active: "идёт",
  completed: "завершена",
  archived: "в архиве",
};

function dateLabel(value: Date | string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function GroupPage() {
  const mine = await api.org.mine();
  if (!mine.isFacilitator) redirect("/game");

  const sessions = await api.org.sessions.list({ limit: 100, offset: 0 });
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
          <div>
            <p className="text-muted-foreground text-sm">
              {mine.orgName ?? "Организация"}
            </p>
            <h1 className="text-2xl font-semibold">Сессии вашей группы</h1>
            <p className="text-muted-foreground text-sm">
              Игры участников, которые состоят в вашей организации.
            </p>
          </div>
          <Button
            variant="outline"
            render={<a href="/api/export/org-sessions" />}
          >
            <IconDownload data-icon="inline-start" />
            Скачать CSV
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Сессий</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {sessions.length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Диалогов</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {dialogsTotal}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Средний балл</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {avgScore !== null ? `${avgScore}%` : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Сессии</CardTitle>
            <CardDescription>
              Новые сессии появляются здесь, как только участник открывает игру.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
