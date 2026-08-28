"use client";

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@acme/ui";
import {
  IconCalendarCheck,
  IconChartLine,
  IconInfoCircle,
  IconMessages,
  IconTarget,
} from "@tabler/icons-react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

const scoreConfig = {
  score: { label: "Оценка", color: "var(--chart-1)" },
} satisfies ChartConfig;

interface PracticeOverviewProps {
  dialogs: number;
  averageScore: number;
  improvement: number;
  activeDays: number;
  styleMatchRate: number;
  dailyActivity: { date: string; dialogs: number }[];
  scoreTrend: { date: string; score: number }[];
  criteria: { id: string; title: string; rate: number }[];
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function activityTone(value: number) {
  if (value >= 4) return "bg-primary";
  if (value >= 3) return "bg-primary/75";
  if (value >= 2) return "bg-primary/50";
  if (value >= 1) return "bg-primary/25";
  return "bg-muted";
}

/** Dense activity and coaching overview inspired by Kendo's Overview page. */
export function PracticeOverview({
  dialogs,
  averageScore,
  improvement,
  activeDays,
  styleMatchRate,
  dailyActivity,
  scoreTrend,
  criteria,
}: PracticeOverviewProps) {
  const activityByDate = new Map(
    dailyActivity.map((item) => [item.date, item.dialogs]),
  );
  const lastDate = new Date();
  lastDate.setUTCHours(0, 0, 0, 0);
  const activityCells = Array.from({ length: 364 }, (_, index) => {
    const date = new Date(lastDate);
    date.setUTCDate(lastDate.getUTCDate() - (363 - index));
    const key = date.toISOString().slice(0, 10);
    return { date: key, dialogs: activityByDate.get(key) ?? 0 };
  });
  const scoreChart = scoreTrend.map((item) => ({
    ...item,
    label: formatDate(item.date),
  }));
  const weakestCriterion = criteria[0];

  return (
    <section className="flex flex-col gap-4" aria-labelledby="activity-title">
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b py-5">
          <div>
            <p className="text-muted-foreground text-xs font-medium">
              Активность
            </p>
            <CardTitle id="activity-title" className="mt-1">
              Ежедневная практика
            </CardTitle>
            <CardDescription className="mt-1">
              Тренировочная активность за последние 12 месяцев
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs sm:justify-end">
            <span>
              <strong className="font-semibold tabular-nums">{dialogs}</strong>{" "}
              разборов
            </span>
            <span>
              <strong className="font-semibold tabular-nums">
                {activeDays}
              </strong>{" "}
              активных дней
            </span>
            <Badge variant="outline">Мои данные</Badge>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto py-5">
          <div className="mx-auto w-[828px]">
            <div className="text-muted-foreground mb-2 grid grid-cols-3 text-xs">
              <span>12 месяцев назад</span>
              <span className="text-center">6 месяцев назад</span>
              <span className="text-right">Сегодня</span>
            </div>
            <ul className="sr-only">
              {activityCells.map((item) => (
                <li key={item.date}>
                  {item.date}: {item.dialogs} разборов
                </li>
              ))}
            </ul>
            <div
              className="grid grid-flow-col grid-rows-7 gap-1"
              aria-hidden="true"
            >
              {activityCells.map((item) => (
                <div
                  key={item.date}
                  title={`${formatDate(item.date)}: ${item.dialogs} разборов`}
                  className={`size-3 rounded-[3px] border border-black/[0.03] ${activityTone(item.dialogs)}`}
                />
              ))}
            </div>
            <div className="text-muted-foreground mt-3 flex items-center justify-end gap-1.5 text-xs">
              <span className="mr-1">Меньше</span>
              {[0, 1, 2, 3, 4].map((value) => (
                <span
                  key={value}
                  className={`size-3 rounded-[3px] ${activityTone(value)}`}
                />
              ))}
              <span className="ml-1">Больше</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Средняя оценка"
          description="Качество управленческих разговоров"
          value={`${averageScore}%`}
          detail={`${improvement >= 0 ? "+" : ""}${improvement} п.п. к старту`}
          icon={IconChartLine}
        />
        <MetricCard
          title="Всего разговоров"
          description="Завершённые попытки с разбором"
          value={String(dialogs)}
          detail={`${activeDays} активных дней`}
          icon={IconMessages}
        />
        <MetricCard
          title="Подходящий стиль"
          description="Совпадение цели и стиля руководства"
          value={`${styleMatchRate}%`}
          detail="По завершённым диалогам"
          icon={IconTarget}
        />
        <MetricCard
          title="Следующий фокус"
          description={
            weakestCriterion?.title ?? "Появится после первого разбора"
          }
          value={
            weakestCriterion
              ? `${Math.round(weakestCriterion.rate * 100)}%`
              : "—"
          }
          detail="Точка роста"
          icon={IconCalendarCheck}
        />
      </div>

      {scoreChart.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Динамика оценки</CardTitle>
            <CardDescription>
              Как меняется качество разговоров от попытки к попытке
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={scoreConfig} className="h-56 w-full">
              <AreaChart accessibilityLayer data={scoreChart}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  dataKey="score"
                  type="monotone"
                  fill="var(--color-score)"
                  fillOpacity={0.14}
                  stroke="var(--color-score)"
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}

function MetricCard({
  title,
  description,
  value,
  detail,
  icon: Icon,
}: {
  title: string;
  description: string;
  value: string;
  detail: string;
  icon: typeof IconChartLine;
}) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm">{title}</CardTitle>
          <IconInfoCircle className="text-muted-foreground size-4" />
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-3">
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {value}
          </p>
          <Icon className="text-muted-foreground size-5" />
        </div>
        <p className="text-muted-foreground mt-3 text-xs">{detail}</p>
      </CardContent>
    </Card>
  );
}
