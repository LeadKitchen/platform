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
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis } from "recharts";

const scoreConfig = {
  score: { label: "Оценка", color: "var(--chart-1)" },
} satisfies ChartConfig;

const activityConfig = {
  dialogs: { label: "Разговоры", color: "var(--chart-1)" },
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

function buildWeeklyActivity(
  dailyActivity: { date: string; dialogs: number }[],
  weeks: number,
) {
  const byDate = new Map(
    dailyActivity.map((item) => [item.date, item.dialogs]),
  );
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const weekday = (today.getUTCDay() + 6) % 7; // Monday = 0
  const currentWeekStart = new Date(today);
  currentWeekStart.setUTCDate(today.getUTCDate() - weekday);
  const firstWeekStart = new Date(currentWeekStart);
  firstWeekStart.setUTCDate(currentWeekStart.getUTCDate() - (weeks - 1) * 7);

  return Array.from({ length: weeks }, (_, index) => {
    const weekStart = new Date(firstWeekStart);
    weekStart.setUTCDate(firstWeekStart.getUTCDate() + index * 7);
    let weekDialogs = 0;
    for (let day = 0; day < 7; day++) {
      const date = new Date(weekStart);
      date.setUTCDate(weekStart.getUTCDate() + day);
      weekDialogs += byDate.get(date.toISOString().slice(0, 10)) ?? 0;
    }
    return {
      label: formatDate(weekStart.toISOString().slice(0, 10)),
      dialogs: weekDialogs,
    };
  });
}

/** Плотная сводка активности и коучинга для страницы «Обзор» сотрудника. */
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
  const weeklyActivity = buildWeeklyActivity(dailyActivity, 12);
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
              Практика по неделям
            </CardTitle>
            <CardDescription className="mt-1">
              Сколько разговоров вы провели за последние 12 недель
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
        <CardContent className="py-5">
          <ChartContainer config={activityConfig} className="h-40 w-full">
            <BarChart accessibilityLayer data={weeklyActivity}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="dialogs" fill="var(--color-dialogs)" radius={4} />
            </BarChart>
          </ChartContainer>
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
