import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@acme/ui";
import {
  IconArrowRight,
  IconMessages,
  IconSchool,
  IconSettings,
} from "@tabler/icons-react";
import Link from "next/link";
import { Suspense } from "react";
import { DemoTour, GameSectionHeader } from "~/components/game";
import { SiteHeader } from "~/components/layout";

const STYLE_ROWS = [
  {
    level: "L1 — не умеет, не уверен",
    style: "Директивный",
    when: "Пошаговая инструкция, что и как делать, без права выбора",
  },
  {
    level: "L2 — учится, нужна поддержка",
    style: "Наставнический",
    when: "Даёте ориентир и контрольную точку, но объясняете «почему»",
  },
  {
    level: "L3 — умеет, но не всегда уверен",
    style: "Поддерживающий",
    when: "Спрашиваете мнение, поддерживаете решение, не диктуете шаги",
  },
  {
    level: "L4 — умеет и берёт ответственность",
    style: "Делегирующий",
    when: "Отдаёте задачу целиком, обозначаете срок и результат",
  },
] as const;

function DemoTourFallback() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-9 w-full max-w-sm" />
      <Skeleton className="h-9 w-full max-w-md" />
      <Card>
        <CardContent className="py-10">
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function GameDemoPage() {
  return (
    <>
      <SiteHeader
        breadcrumbs={[
          { label: "Деловая игра", href: "/game" },
          { label: "Демо" },
        ]}
      />
      <main className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <GameSectionHeader
          eyebrow="Обзор · AI roleplay"
          title="Примеры управленческих разговоров"
          description="Выберите готовый сценарий, посмотрите разговор целиком и сравните разбор с другими подходами."
          action={
            <Button
              render={<Link href="/game#start-practice" />}
              nativeButton={false}
            >
              Начать практику
              <IconArrowRight data-icon="inline-end" />
            </Button>
          }
        />

        <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
          <Badge variant="outline">9 сценариев</Badge>
          <span className="text-muted-foreground text-sm">
            Правильные примеры, типичные ошибки и усложнённая смена
          </span>
        </div>

        <Suspense fallback={<DemoTourFallback />}>
          <DemoTour />
        </Suspense>

        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconSchool />
              Четыре стиля руководства
            </CardTitle>
            <CardDescription>
              Правильный стиль зависит не от характера сотрудника, а от его
              готовности к конкретной задаче — поэтому один и тот же человек на
              разных задачах может требовать разного подхода.
            </CardDescription>
          </CardHeader>
          <CardContent className="border-t py-5">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Готовность сотрудника</TableHead>
                    <TableHead>Ожидаемый стиль</TableHead>
                    <TableHead>Что это значит на практике</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {STYLE_ROWS.map((row) => (
                    <TableRow key={row.level}>
                      <TableCell className="font-medium">{row.level}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.style}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.when}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-muted-foreground mt-4 text-sm">
              Ошибиться можно в обе стороны: делегировать задачу новичку —
              рискованнее, чем лишний раз проинструктировать опытного
              сотрудника, поэтому недоуправление наказывается в оценке сильнее.
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconMessages />
                Как строится смена
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <p>
                <span className="font-medium">Раунд 1</span> — разминка без ИИ:
                несколько ситуаций, где нужно самому определить готовность
                сотрудника и подходящий стиль. Занимает около 5 минут.
              </p>
              <p>
                <span className="font-medium">Раунд 2</span> — практика с
                командой: заказы поступают один за другим, сотрудников
                несколько, разговор с каждым — как в примере выше.
              </p>
              <p>
                <span className="font-medium">Раунд 3</span> — усложнённая
                смена: сотрудник работает один и без подстраховки, поэтому
                нагрузка и цена ошибки выше.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconSettings />
                Что можно настроить
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <p>
                При создании смены вы выбираете только{" "}
                <span className="font-medium">название команды</span> и{" "}
                <span className="font-medium">раунд</span> — остальные
                технические настройки тренажёр подбирает сам.
              </p>
              <p>
                Ведущий игры может сравнивать разные варианты ИИ-конвейера (как
                сотрудник получает знания и как оценивается диалог) в
                административной панели — на сам разговор игрока это не влияет,
                оценка считается одинаково для всех.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="gap-4">
          <CardHeader>
            <CardTitle>Готовы попробовать сами?</CardTitle>
            <CardDescription>
              Начните с разминки, если хотите сначала потренироваться без ИИ,
              или сразу переходите к настоящей смене.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button render={<Link href="/game/round-1" />} nativeButton={false}>
              Пройти разминку
              <IconArrowRight data-icon="inline-end" />
            </Button>
            <Button
              variant="outline"
              render={<Link href="/game#start-practice" />}
              nativeButton={false}
            >
              Начать настоящую смену
            </Button>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
