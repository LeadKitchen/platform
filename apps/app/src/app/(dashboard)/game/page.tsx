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
  IconArrowRight,
  IconChefHat,
  IconMessages,
  IconSchool,
  IconUser,
} from "@tabler/icons-react";
import Link from "next/link";
import { CreateSessionForm } from "~/components/game";
import { SiteHeader } from "~/components/layout";
import { api } from "~/orpc/server";

export const dynamic = "force-dynamic";

const SESSION_STATUS_LABELS: Record<string, string> = {
  active: "идёт",
  completed: "завершена",
  finished: "завершена",
  archived: "в архиве",
};

export default async function GamePage() {
  const [sessions, catalog] = await Promise.all([
    api.game.session.list({ limit: 20, offset: 0 }),
    api.game.catalog.variants(),
  ]);

  return (
    <>
      <SiteHeader />
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
        <div>
          <p className="text-muted-foreground text-sm">Учебный симулятор</p>
          <h1 className="text-2xl font-semibold">Ситуационное руководство</h1>
          <p className="text-muted-foreground max-w-3xl text-sm">
            Управляйте командой ресторана: определяйте готовность сотрудников,
            выбирайте стиль руководства и отрабатывайте разговор с
            сотрудником-ИИ голосом или текстом.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <Badge variant="outline" className="w-fit">
                Без ИИ
              </Badge>
              <CardTitle className="flex items-center gap-2">
                <IconSchool />
                Раунд 1
              </CardTitle>
              <CardDescription>
                Познакомьтесь с уровнями готовности и стилями руководства.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                render={<Link href="/game/round-1" />}
                nativeButton={false}
              >
                Пройти теоретический раунд
                <IconArrowRight data-icon="inline-end" />
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Badge className="w-fit">Чат с ИИ</Badge>
              <CardTitle className="flex items-center gap-2">
                <IconMessages />
                Раунд 2
              </CardTitle>
              <CardDescription>
                Распределите заказ и поставьте задачу сотруднику голосом или
                текстом, используя подходящий стиль.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Badge className="w-fit">Чат с ИИ</Badge>
              <CardTitle className="flex items-center gap-2">
                <IconUser />
                Раунд 3
              </CardTitle>
              <CardDescription>
                Повар остался один в смене. Управляйте приоритетами и нагрузкой,
                не теряя мотивацию сотрудника.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconChefHat />
              Начать практику с ИИ
            </CardTitle>
            <CardDescription>
              Создайте игровую смену для второго или третьего раунда. После
              выбора заказа вы сразу перейдёте к разговору с сотрудником.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateSessionForm
              defaults={{
                defaultVariantId: catalog.settings.defaultVariantId,
                defaultRound: catalog.settings.defaultRound,
                allowRoundThree: catalog.settings.allowRoundThree,
              }}
              variants={catalog.variants.map((variant) => ({
                id: variant.id,
                name: variant.name,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Сессии</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {sessions.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Сессий пока нет — создайте первую.
              </p>
            ) : null}

            {sessions.map((session) => (
              <Link
                key={session.id}
                href={`/game/${session.id}`}
                className="hover:bg-muted flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <span className="font-medium">{session.title}</span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Раунд {session.round}</Badge>
                  <Badge variant="secondary">
                    {session.variantId ?? "по умолчанию"}
                  </Badge>
                  <Badge variant="outline">
                    {SESSION_STATUS_LABELS[session.status] ?? session.status}
                  </Badge>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
