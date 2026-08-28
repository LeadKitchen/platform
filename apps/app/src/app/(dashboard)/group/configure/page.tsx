import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acme/ui";
import {
  IconAdjustments,
  IconBrain,
  IconChecklist,
  IconWand,
} from "@tabler/icons-react";
import { redirect } from "next/navigation";
import { SiteHeader } from "~/components/layout";
import { api } from "~/orpc/server";

export const dynamic = "force-dynamic";

/** Workspace-level Configure hub, mirroring Kendo's useful setup layers. */
export default async function ConfigurePage() {
  const [mine, methodology] = await Promise.all([
    api.org.mine(),
    api.game.catalog.methodology(),
  ]);
  if (!mine.isFacilitator) redirect("/game");

  return (
    <>
      <SiteHeader
        breadcrumbs={[
          { label: "Моя группа", href: "/group" },
          { label: "Configure" },
        ]}
      />
      <main className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge variant="accent">Configure</Badge>
            <h1 className="mt-3 text-2xl font-semibold">Настройка команды</h1>
            <p className="text-muted-foreground text-sm">
              Рубрика, контекст и правила практики для{" "}
              {mine.orgName ?? "вашей команды"}.
            </p>
          </div>
          <Button variant="outline" render={<a href="/group" />}>
            Вернуться к группе
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconChecklist /> Рубрика оценки
              </CardTitle>
              <CardDescription>
                Активная рубрика определяет, какие действия видны в разборе
                каждого диалога.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {methodology.criteria.map((criterion) => (
                <div
                  key={criterion.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <span className="text-sm font-medium">{criterion.title}</span>
                  <Badge variant="outline">Вес {criterion.weight}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconBrain /> Контекст команды
              </CardTitle>
              <CardDescription>
                Добавит в сценарии вашу роль, правила и терминологию.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="outline" disabled>
                <IconWand data-icon="inline-start" />
                Скоро: заполнить контекст
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconAdjustments /> Правила практики
              </CardTitle>
              <CardDescription>
                Автоматически назначат повторную попытку по слабому критерию.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="secondary">Сейчас: ручное назначение</Badge>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
