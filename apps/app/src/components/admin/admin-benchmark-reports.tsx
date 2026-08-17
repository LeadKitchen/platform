"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@acme/ui";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";

interface MetricComparison {
  metric: string;
  label: string;
  direction: "lower" | "higher";
  delta: number;
  ciLow: number;
  ciHigh: number;
  pValue: number;
  pairs: number;
  significant: boolean;
}

interface VariantComparison {
  variantId: string;
  metrics: MetricComparison[];
}

interface VariantSummary {
  variantId: string;
  items: number;
  scoreMae: number;
  scoreStdDev: number;
  actualStyleAccuracy: number;
  styleKappa: number;
  criteriaF1: number;
  personaAdherence: number;
  personaDriftRate: number;
  silenceAccuracy: number;
  avgLatencyMs: number;
  avgCostUsd: number;
  modelMix: Record<string, number>;
}

interface RunFailure {
  fixtureId: string;
  variantId: string;
  message: string;
}

interface RunResult {
  startedAt: string;
  finishedAt: string;
  providerId: string;
  model: string;
  epochs: number;
  runsPerFixture: number;
  fixtures: number;
  expertLabelledFixtures: number;
  referenceVariantId: string;
  variants: VariantSummary[];
  comparisons: VariantComparison[];
  failures: RunFailure[];
  poolStats?: {
    servedBy: Record<string, number>;
    availabilityFailures: Record<string, number>;
    capabilityFailures: Record<string, number>;
  };
  /** Absent on reports published before this field existed. */
  unpricedModels?: string[];
  /** Absent on reports published before this field existed. */
  evaluationStrategyMismatch?: string[];
}

export interface BenchmarkRun {
  id: string;
  label: string;
  createdAt: Date | string;
  result: RunResult;
}

const EXTERNAL_FAILURE_PATTERN =
  /额度|quota|rate.?limit|429|5\d\d|insufficient|balance|credit|overload|ECONNRESET|ETIMEDOUT|fetch failed|квот|лимит|остаток|баланс|предвычет|таймаут|сеть/i;

function dateLabel(value: Date | string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function verdict(metric: MetricComparison): {
  text: string;
  variant: "default" | "destructive" | "outline" | "secondary";
} {
  if (metric.pairs === 0) return { text: "нет данных", variant: "secondary" };
  if (!metric.significant) return { text: "не доказано", variant: "outline" };
  return metric.delta > 0
    ? { text: "лучше", variant: "default" }
    : { text: "хуже", variant: "destructive" };
}

function signed(value: number, digits = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

/**
 * Отчёты офлайн-замера подходов ИИ-модуля.
 *
 * Показывает то, что харнесс `@acme/eval` уже посчитал — ни цифры, ни выводы
 * здесь не пересчитываются: страница только форматирует `RunResult` так,
 * чтобы его можно было изучить без доступа к консоли и markdown-файлам.
 */
export function AdminBenchmarkReports({ runs }: { runs: BenchmarkRun[] }) {
  const [selectedId, setSelectedId] = useState(runs[0]?.id);
  const run = runs.find((item) => item.id === selectedId) ?? runs[0];

  const chartData = useMemo(() => {
    if (!run) return [];
    return run.result.variants
      .filter((variant) => variant.items > 0)
      .map((variant) => ({
        variantId: variant.variantId,
        mae: variant.scoreMae,
      }))
      .sort((a, b) => a.mae - b.mae);
  }, [run]);

  if (!run) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Отчёты о качестве</CardTitle>
          <CardDescription>
            Пока не опубликовано ни одного офлайн-замера.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Прогоните харнесс и опубликуйте результат:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            bun --filter @acme/eval eval --provider env --out reports/run.md
            --json reports/run.json
          </code>{" "}
          затем{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            bun --filter @acme/eval publish reports/run.json
          </code>
          .
        </CardContent>
      </Card>
    );
  }

  const { result } = run;
  const emptyArms = result.variants.filter((variant) => variant.items === 0);
  const mixedArms = result.variants.filter(
    (variant) => Object.keys(variant.modelMix).length > 1,
  );
  const servedModels = new Set(
    result.variants.flatMap((variant) => Object.keys(variant.modelMix)),
  );
  const totalPairs = result.comparisons[0]?.metrics[0]?.pairs ?? 0;
  const externalFailures = result.failures.filter((failure) =>
    EXTERNAL_FAILURE_PATTERN.test(failure.message),
  );
  const failuresByVariant = new Map<string, number>();
  for (const failure of result.failures) {
    failuresByVariant.set(
      failure.variantId,
      (failuresByVariant.get(failure.variantId) ?? 0) + 1,
    );
  }

  const ranked = [
    ...result.variants
      .filter((variant) => variant.items > 0)
      .sort((a, b) => a.scoreMae - b.scoreMae),
    ...emptyArms,
  ];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>Отчёт офлайн-замера</CardTitle>
              <CardDescription>
                Сравнение подходов ИИ-модуля на размеченных сценариях, вне живых
                игр.
              </CardDescription>
            </div>
            {runs.length > 1 ? (
              <Select
                value={selectedId}
                onValueChange={(value) => setSelectedId(value ?? runs[0]?.id)}
              >
                <SelectTrigger className="w-auto min-w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {runs.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label} — {dateLabel(item.createdAt)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-muted-foreground">Провайдер / модель</div>
              <div className="font-medium">
                {result.providerId} · {result.model}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Сценариев</div>
              <div className="font-medium">
                {result.fixtures} · прогонов на сценарий {result.runsPerFixture}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Размечено экспертом</div>
              <div className="font-medium">
                {result.expertLabelledFixtures} из {result.fixtures}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Прогон</div>
              <div className="font-medium">{dateLabel(result.startedAt)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {result.expertLabelledFixtures < result.fixtures ? (
        <Alert>
          <IconAlertTriangle />
          <AlertTitle>Часть сценариев без экспертной разметки</AlertTitle>
          <AlertDescription>
            Экспертными метками подписано {result.expertLabelledFixtures} из{" "}
            {result.fixtures} сценариев. «MAE к эксперту» для остальных —
            расхождение с временной калибровкой: годится ловить регрессии, но не
            годится как основание внедрять подход.
          </AlertDescription>
        </Alert>
      ) : null}

      {totalPairs > 0 && totalPairs < 30 ? (
        <Alert>
          <IconAlertTriangle />
          <AlertTitle>Мало парных наблюдений: {totalPairs}</AlertTitle>
          <AlertDescription>
            Доверительные интервалы будут широкими, и почти любой результат
            окажется статистически недоказанным. Для решения о внедрении нужно
            60+ размеченных сценариев.
          </AlertDescription>
        </Alert>
      ) : null}

      {mixedArms.length > 0 || servedModels.size > 1 ? (
        <Alert variant="destructive">
          <IconAlertTriangle />
          <AlertTitle>Диалоги обслужены разными моделями</AlertTitle>
          <AlertDescription>
            Сработало переключение пула провайдеров — сравнение вариантов между
            собой некорректно: разница может объясняться моделью, а не подходом.
            <ul className="mt-1 list-inside list-disc">
              {result.variants
                .filter((variant) => variant.items > 0)
                .map((variant) => (
                  <li key={variant.variantId}>
                    <code>{variant.variantId}</code>:{" "}
                    {Object.entries(variant.modelMix)
                      .map(([model, count]) => `${model} × ${count}`)
                      .join(", ")}
                  </li>
                ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {emptyArms.length > 0 ? (
        <Alert variant="destructive">
          <IconAlertTriangle />
          <AlertTitle>Варианты без успешных диалогов</AlertTitle>
          <AlertDescription>
            {emptyArms.map((v) => v.variantId).join(", ")} — по ним нет данных,
            а не нулевая ошибка. Смотрите «Несостоявшиеся сценарии» ниже: если
            причина внешняя (лимит провайдера, сеть), прогон надо повторить.
          </AlertDescription>
        </Alert>
      ) : null}

      {result.evaluationStrategyMismatch &&
      result.evaluationStrategyMismatch.length > 0 ? (
        <Alert variant="destructive">
          <IconAlertTriangle />
          <AlertTitle>
            Разная стратегия оценки против{" "}
            <code>{result.referenceVariantId}</code>
          </AlertTitle>
          <AlertDescription>
            {result.evaluationStrategyMismatch.map((id) => (
              <code key={id} className="mr-1">
                {id}
              </code>
            ))}
            — сценарии размечены (близко к) правилами, а эти варианты судит LLM.
            «F1 критериев» и «точность стиля» для них меряют в основном шум
            судьи против источника разметки, а не эффект знания/персоны.
          </AlertDescription>
        </Alert>
      ) : null}

      {result.unpricedModels && result.unpricedModels.length > 0 ? (
        <Alert>
          <IconAlertTriangle />
          <AlertTitle>
            Цена неизвестна: {result.unpricedModels.join(", ")}
          </AlertTitle>
          <AlertDescription>
            «$/диалог» показывает 0 для этих моделей — это отсутствующая цена в
            прайс-листе, а не подтверждённо бесплатный вызов.
          </AlertDescription>
        </Alert>
      ) : null}

      {chartData.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Расхождение с эталоном (MAE) по вариантам</CardTitle>
            <CardDescription>
              Ниже — ближе к эталонной оценке. Только варианты с успешными
              диалогами.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{ mae: { label: "MAE", color: "var(--chart-1)" } }}
              className="aspect-auto h-[220px] w-full"
            >
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ left: 8, right: 24 }}
              >
                <CartesianGrid horizontal={false} />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="variantId"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={110}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="mae" fill="var(--color-mae)" radius={4}>
                  <LabelList
                    dataKey="mae"
                    position="right"
                    className="fill-foreground"
                    fontSize={12}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      ) : null}

      {result.comparisons.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Значимость против контрольного варианта</CardTitle>
            <CardDescription>
              Контрольный вариант: <code>{result.referenceVariantId}</code>.
              Парный бутстрап по сценариям, 95% доверительный интервал.
              Положительная Δ — вариант лучше контрольного.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {result.comparisons.map((comparison) => (
              <div key={comparison.variantId}>
                <h4 className="mb-2 font-medium">
                  <code>{comparison.variantId}</code>
                </h4>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Метрика</TableHead>
                        <TableHead className="text-right">Δ</TableHead>
                        <TableHead className="text-right">95% ДИ</TableHead>
                        <TableHead className="text-right">p</TableHead>
                        <TableHead className="text-right">Вывод</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comparison.metrics.map((metric) => {
                        const digits = metric.metric === "costUsd" ? 4 : 2;
                        const badge = verdict(metric);
                        return (
                          <TableRow key={metric.metric}>
                            <TableCell>{metric.label}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {signed(metric.delta, digits)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              [{metric.ciLow.toFixed(digits)};{" "}
                              {metric.ciHigh.toFixed(digits)}]
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {metric.pValue.toFixed(3)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant={badge.variant}>
                                {badge.text}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Сырые показатели</CardTitle>
          <CardDescription>
            По всем вариантам, включая те, что не сравнивались.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Вариант</TableHead>
                  <TableHead className="text-right">MAE</TableHead>
                  <TableHead className="text-right">κ по стилю</TableHead>
                  <TableHead className="text-right">F1 критериев</TableHead>
                  <TableHead className="text-right">Роль</TableHead>
                  <TableHead className="text-right">Дрейф</TableHead>
                  <TableHead className="text-right">Задержка</TableHead>
                  <TableHead className="text-right">$/диалог</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranked.map((variant) => (
                  <TableRow key={variant.variantId}>
                    <TableCell className="font-medium">
                      <code>{variant.variantId}</code>
                    </TableCell>
                    {variant.items === 0 ? (
                      <TableCell colSpan={7} className="text-muted-foreground">
                        нет данных
                      </TableCell>
                    ) : (
                      <>
                        <TableCell className="text-right tabular-nums">
                          {variant.scoreMae.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {variant.styleKappa.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {variant.criteriaF1.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Math.round(variant.personaAdherence * 100)}%
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Math.round(variant.personaDriftRate * 100)}%
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {variant.avgLatencyMs} мс
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          ${variant.avgCostUsd.toFixed(4)}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {result.poolStats && Object.keys(result.poolStats.servedBy).length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Кто обслуживал запросы</CardTitle>
            <CardDescription>
              Провайдеры и модели, которые реально отвечали во время прогона.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Кандидат</TableHead>
                    <TableHead className="text-right">Успешно</TableHead>
                    <TableHead className="text-right">
                      Отказы по лимиту
                    </TableHead>
                    <TableHead className="text-right">
                      Не осилил схему
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    ...new Set([
                      ...Object.keys(result.poolStats.servedBy),
                      ...Object.keys(result.poolStats.availabilityFailures),
                      ...Object.keys(result.poolStats.capabilityFailures),
                    ]),
                  ]
                    .sort()
                    .map((id) => (
                      <TableRow key={id}>
                        <TableCell className="font-mono text-xs">
                          {id}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {result.poolStats?.servedBy[id] ?? 0}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {result.poolStats?.availabilityFailures[id] ?? 0}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {result.poolStats?.capabilityFailures[id] ?? 0}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {result.failures.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Несостоявшиеся сценарии</CardTitle>
            <CardDescription>
              Не дошли до оценки и исключены из всех метрик выше.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {externalFailures.length > 0 ? (
              <Alert variant="destructive">
                <IconAlertTriangle />
                <AlertTitle>
                  {externalFailures.length} — внешние отказы провайдера
                </AlertTitle>
                <AlertDescription>
                  Лимит, квота или сеть, а не свойство варианта. Сравнивать по
                  таким результатам нельзя, порядок вариантов в очереди решает
                  исход.
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {[...failuresByVariant].map(([variantId, count]) => (
                <Badge key={variantId} variant="outline">
                  <code>{variantId}</code>: {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
