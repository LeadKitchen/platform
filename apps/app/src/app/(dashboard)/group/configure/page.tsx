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
import Link from "next/link";
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
            <h1 className="text-3xl font-medium tracking-[-0.035em]">
              Настройка команды
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Рубрика, контекст и правила практики для{" "}
              {mine.orgName ?? "вашей команды"}.
            </p>
          </div>
          <Button variant="outline" render={<a href="/group" />}>
            Вернуться к группе
          </Button>
        </div>

        <div className="grid overflow-hidden rounded-xl border sm:grid-cols-3">
          <div className="border-b p-4 sm:border-r sm:border-b-0">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Критериев
            </p>
            <p className="mt-1 text-2xl font-medium tabular-nums">
              {methodology.criteria.length}
            </p>
          </div>
          <div className="border-b p-4 sm:border-r sm:border-b-0">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Рубрика
            </p>
            <p className="mt-1 text-sm font-medium">Активная</p>
          </div>
          <div className="p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Назначения
            </p>
            <p className="mt-1 text-sm font-medium">Вручную</p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.7fr)]">
          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="border-b py-5">
              <CardTitle className="flex items-center gap-2">
                <IconChecklist /> Рубрика оценки
              </CardTitle>
              <CardDescription>
                Активная рубрика определяет, какие действия видны в разборе
                каждого диалога.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 py-5 sm:grid-cols-2 xl:grid-cols-3">
              {methodology.criteria.map((criterion) => (
                <div
                  key={criterion.id}
                  className="flex min-h-28 flex-col justify-between gap-4 rounded-xl border p-4 transition-colors hover:border-foreground/20 hover:bg-muted/40"
                >
                  <span className="text-sm font-medium leading-snug">
                    {criterion.title}
                  </span>
                  <Badge variant="outline" className="w-fit">
                    Вес {criterion.weight}
                  </Badge>
                </div>
              ))}
            </CardContent>
            <div className="border-t p-5">
              <Button
                render={<Link href="/game/scorecards" />}
                nativeButton={false}
              >
                Управлять Scorecards
              </Button>
            </div>
          </Card>
          <div className="flex flex-col gap-4">
            <Card className="gap-0 overflow-hidden py-0">
              <CardHeader className="border-b py-5">
                <CardTitle className="flex items-center gap-2">
                  <IconBrain /> Контекст команды
                </CardTitle>
                <CardDescription>
                  Добавит в сценарии вашу роль, правила и терминологию.
                </CardDescription>
              </CardHeader>
              <CardContent className="py-5">
                <Button className="w-full" variant="outline" disabled>
                  <IconWand data-icon="inline-start" />
                  Скоро: заполнить контекст
                </Button>
              </CardContent>
            </Card>
            <Card className="gap-0 overflow-hidden py-0">
              <CardHeader className="border-b py-5">
                <CardTitle className="flex items-center gap-2">
                  <IconAdjustments /> Правила практики
                </CardTitle>
                <CardDescription>
                  Автоматически назначат повторную попытку по слабому критерию.
                </CardDescription>
              </CardHeader>
              <CardContent className="py-5">
                <Badge variant="secondary">Сейчас: ручное назначение</Badge>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}
