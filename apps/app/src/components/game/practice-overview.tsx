"use client";

import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@acme/ui";
import {
  IconActivityHeartbeat,
  IconCalendarCheck,
  IconChartLine,
  IconMessages,
  IconTarget,
} from "@tabler/icons-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

const scoreConfig = {
  score: { label: "Оценка", color: "var(--chart-1)" },
} satisfies ChartConfig;

const activityConfig = {
  dialogs: { label: "Разборы", color: "var(--chart-2)" },
} satisfies ChartConfig;

const criteriaConfig = {
  rate: { label: "Выполнение", color: "var(--chart-3)" },
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

/** Overview modelled after the useful parts of a coaching dashboard. */
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
  const activityChart = dailyActivity.map((item) => ({
    ...item,
    label: formatDate(item.date),
  }));
  const scoreChart = scoreTrend.map((item) => ({
    ...item,
    label: formatDate(item.date),
  }));
  const criteriaChart = criteria.slice(0, 6).map((item) => ({
    ...item,
    rate: Math.round(item.rate * 100),
  }));

  return (
    <section className="flex flex-col gap-4" aria-labelledby="overview-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Badge variant="accent" className="w-fit">
            Overview
          </Badge>
          <h1 id="overview-title" className="text-2xl font-semibold">
            Обзор практики
          </h1>
          <p className="text-muted-foreground text-sm">
            Результаты вашей игры за последние 28 дней.
          </p>
        </div>
        <Badge variant="outline">Последние 28 дней</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Средняя оценка"
          description={`По ${dialogs} ${dialogs === 1 ? "разбору" : "разборам"}`}
          value={`${averageScore}%`}
          icon={IconChartLine}
          trend={`${improvement >= 0 ? "+" : ""}${improvement} п.п.`}
        />
        <MetricCard
          title="Разговоров с разбором"
          description="Завершённые управленческие попытки"
          value={String(dialogs)}
          icon={IconMessages}
        />
        <MetricCard
          title="Активных дней"
          description="Дни с хотя бы одним разбором"
          value={String(activeDays)}
          icon={IconCalendarCheck}
        />
        <MetricCard
          title="Стиль руководства"
          description="Совпадение цели и выбранного стиля"
          value={`${styleMatchRate}%`}
          icon={IconTarget}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Динамика навыка</CardTitle>
          <CardDescription>
            Переключайте срез, чтобы увидеть связь регулярности и качества.
          </CardDescription>
          <CardAction>
            <Badge variant="secondary">28 дней</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="score">
            <TabsList>
              <TabsTrigger value="score">Оценка</TabsTrigger>
              <TabsTrigger value="activity">Активность</TabsTrigger>
              <TabsTrigger value="criteria">Критерии</TabsTrigger>
            </TabsList>
            <TabsContent value="score" className="pt-4">
              {scoreChart.length > 0 ? (
                <ChartContainer config={scoreConfig} className="h-64 w-full">
                  <AreaChart accessibilityLayer data={scoreChart}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      dataKey="score"
                      type="monotone"
                      fill="var(--color-score)"
                      fillOpacity={0.2}
                      stroke="var(--color-score)"
                    />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <OverviewEmpty text="Оценки появятся после первого завершённого разбора." />
              )}
            </TabsContent>
            <TabsContent value="activity" className="pt-4">
              <ChartContainer config={activityConfig} className="h-64 w-full">
                <BarChart accessibilityLayer data={activityChart}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="dialogs"
                    fill="var(--color-dialogs)"
                    radius={4}
                  />
                </BarChart>
              </ChartContainer>
            </TabsContent>
            <TabsContent value="criteria" className="pt-4">
              {criteriaChart.length > 0 ? (
                <ChartContainer config={criteriaConfig} className="h-64 w-full">
                  <BarChart
                    accessibilityLayer
                    data={criteriaChart}
                    layout="vertical"
                  >
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} hide />
                    <YAxis
                      dataKey="title"
                      type="category"
                      tickLine={false}
                      axisLine={false}
                      width={120}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="rate" fill="var(--color-rate)" radius={4} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <OverviewEmpty text="Критерии станут доступны после первого разбора." />
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </section>
  );
}

function MetricCard({
  title,
  description,
  value,
  icon: Icon,
  trend,
}: {
  title: string;
  description: string;
  value: string;
  icon: typeof IconChartLine;
  trend?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-end justify-between gap-3">
        <p className="text-3xl font-semibold tabular-nums">{value}</p>
        {trend ? <Badge variant="secondary">{trend}</Badge> : null}
      </CardContent>
    </Card>
  );
}

function OverviewEmpty({ text }: { text: string }) {
  return (
    <Empty className="min-h-64">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconActivityHeartbeat />
        </EmptyMedia>
        <EmptyTitle>Пока недостаточно данных</EmptyTitle>
        <EmptyDescription>{text}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
