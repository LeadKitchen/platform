import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
  IconAlertTriangle,
  IconArrowRight,
  IconChartBar,
  IconCheck,
  IconFlask,
  IconShieldCheck,
  IconSparkles,
} from "@tabler/icons-react";
import Link from "next/link";
import {
  AI_BENCHMARK_FULL_RUN_COMMAND,
  AI_BENCHMARK_METHODOLOGY,
  AI_BENCHMARK_RUNS,
  AI_STAGE_COPY,
  AI_TECHNOLOGIES,
  type AiTechnologyStage,
} from "~/content/ai-technologies";

const STAGES: AiTechnologyStage[] = ["knowledge", "persona", "evaluation"];

const PROOF_STEPS = [
  {
    title: "Фиксируем контроль",
    description:
      "Сравниваем новую технологию с вариантом, где изменён только один этап AI-конвейера.",
  },
  {
    title: "Повторяем сценарии",
    description:
      "Одинаковые экспертно размеченные ситуации прогоняются несколько раз для учёта случайности LLM.",
  },
  {
    title: "Считаем качество и цену",
    description:
      "Одновременно измеряем точность, стабильность, задержку, токены и стоимость полного диалога.",
  },
  {
    title: "Проверяем значимость",
    description:
      "Технология считается полезной только при устойчивом выигрыше, а не по одному удачному примеру.",
  },
] as const;

const STAGE_ACCENTS: Record<AiTechnologyStage, string> = {
  knowledge: "bg-primary/10 text-primary",
  persona: "bg-secondary text-secondary-foreground",
  evaluation: "bg-muted text-foreground",
};

export function AiDocsOverview() {
  return (
    <div className="flex flex-1 flex-col gap-8 p-4 lg:p-6">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card">
        <CardContent className="grid gap-8 px-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.7fr)] lg:px-10">
          <div className="flex flex-col items-start justify-center gap-5 py-2 lg:py-6">
            <Badge variant="secondary">
              <IconSparkles />
              Технологии качества ИИ
            </Badge>
            <div className="flex max-w-3xl flex-col gap-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
                Шесть способов сделать тренажёр точнее и надёжнее
              </h1>
              <p className="text-muted-foreground max-w-2xl text-base leading-relaxed sm:text-lg">
                Эти технологии улучшают три звена системы: поиск внутренних
                знаний, поведение игрового персонажа и оценку диалога. Здесь —
                простое объяснение пользы и способ доказать эффект цифрами.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                render={<a href="#technologies" />}
                nativeButton={false}
              >
                Посмотреть технологии
                <IconArrowRight data-icon="inline-end" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                render={<a href="#benchmarks" />}
                nativeButton={false}
              >
                <IconChartBar data-icon="inline-start" />
                Отчёты о тестах
              </Button>
              <Button
                size="lg"
                variant="ghost"
                render={<Link href="/admin/game/benchmarks" />}
                nativeButton={false}
              >
                <IconFlask data-icon="inline-start" />
                Открыть измерения
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {STAGES.map((stage, index) => {
              const copy = AI_STAGE_COPY[stage];
              const count = AI_TECHNOLOGIES.filter(
                (technology) => technology.stage === stage,
              ).length;

              return (
                <div
                  key={stage}
                  className="bg-background/80 flex items-center gap-4 rounded-xl border p-4 shadow-sm backdrop-blur-sm"
                >
                  <div
                    className={`flex size-10 shrink-0 items-center justify-center rounded-lg font-semibold ${STAGE_ACCENTS[stage]}`}
                  >
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{copy.title}</p>
                    <p className="text-muted-foreground text-sm">
                      {count} {count === 1 ? "технология" : "технологии"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-4" aria-labelledby="pipeline-title">
        <div className="flex max-w-3xl flex-col gap-2">
          <Badge variant="outline" className="w-fit">
            Единый конвейер
          </Badge>
          <h2 id="pipeline-title" className="text-2xl font-semibold">
            Где каждая технология помогает
          </h2>
          <p className="text-muted-foreground">
            Решения не заменяют друг друга: они страхуют разные этапы — от
            выбора факта до итогового методического разбора.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {STAGES.map((stage, index) => {
            const copy = AI_STAGE_COPY[stage];
            const technologies = AI_TECHNOLOGIES.filter(
              (technology) => technology.stage === stage,
            );

            return (
              <Card key={stage} className="h-full">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant="outline">{copy.label}</Badge>
                    <span className="text-muted-foreground text-sm">
                      {technologies.length} из 6
                    </span>
                  </div>
                  <CardTitle>
                    <h3>{copy.title}</h3>
                  </CardTitle>
                  <CardDescription className="leading-relaxed">
                    {copy.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {technologies.map((technology) => (
                    <Badge key={technology.slug} variant="secondary">
                      {technology.shortName}
                    </Badge>
                  ))}
                </CardContent>
                <CardFooter className="mt-auto text-sm">
                  <span className="text-muted-foreground">
                    {index < STAGES.length - 1
                      ? "Результат передаётся на следующий этап"
                      : "Завершает контур контроля качества"}
                  </span>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </section>

      <section
        id="technologies"
        className="flex scroll-mt-20 flex-col gap-4"
        aria-labelledby="technologies-title"
      >
        <div className="flex max-w-3xl flex-col gap-2">
          <Badge variant="outline" className="w-fit">
            6 технологий
          </Badge>
          <h2 id="technologies-title" className="text-2xl font-semibold">
            Что именно внедрено
          </h2>
          <p className="text-muted-foreground">
            Откройте карточку, чтобы увидеть аналогию, схему работы, технический
            разбор реализации (промпты, схемы вывода, формулы ранжирования,
            телеметрия) и отчёт замера против классического подхода.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {AI_TECHNOLOGIES.map((technology) => {
            const TechnologyIcon = technology.icon;

            return (
              <Card
                key={technology.slug}
                className="group h-full transition-colors hover:border-primary/40"
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-xl">
                      <TechnologyIcon />
                    </div>
                    <Badge variant="outline">{technology.stageLabel}</Badge>
                  </div>
                  <CardTitle>
                    <h3>{technology.shortName}</h3>
                  </CardTitle>
                  <CardDescription>{technology.eyebrow}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <p className="text-sm leading-relaxed">
                    {technology.summary}
                  </p>
                  <div className="bg-muted/50 mt-auto rounded-lg p-3">
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                      Вычислительная цена
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {technology.computeLabel}
                    </p>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant="outline"
                    render={<Link href={`/docs/ai/${technology.slug}`} />}
                    nativeButton={false}
                  >
                    Подробнее
                    <IconArrowRight data-icon="inline-end" />
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="compare-title">
        <div className="flex max-w-3xl flex-col gap-2">
          <Badge variant="outline" className="w-fit">
            Быстрое сравнение
          </Badge>
          <h2 id="compare-title" className="text-2xl font-semibold">
            Как выбрать подходящий эксперимент
          </h2>
          <p className="text-muted-foreground">
            Начинайте не с названия технологии, а с наблюдаемой проблемы и
            заранее выбранной метрики успеха.
          </p>
        </div>
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Технология</TableHead>
                  <TableHead>Улучшает</TableHead>
                  <TableHead>Главная метрика</TableHead>
                  <TableHead>Цена</TableHead>
                  <TableHead>Контроль</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {AI_TECHNOLOGIES.map((technology) => (
                  <TableRow key={technology.slug}>
                    <TableCell className="whitespace-normal">
                      <Link
                        href={`/docs/ai/${technology.slug}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {technology.shortName}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {technology.stageLabel}
                    </TableCell>
                    <TableCell className="min-w-52 whitespace-normal">
                      {technology.measurements.at(0)?.metric ??
                        "Комплексная оценка"}
                    </TableCell>
                    <TableCell className="min-w-48 whitespace-normal">
                      {technology.computeLabel}
                    </TableCell>
                    <TableCell>
                      <code className="bg-muted rounded px-1.5 py-1 text-xs">
                        {technology.referenceVariantId}
                      </code>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section
        id="benchmarks"
        className="flex scroll-mt-20 flex-col gap-4"
        aria-labelledby="benchmarks-title"
      >
        <div className="flex max-w-3xl flex-col gap-2">
          <Badge variant="outline" className="w-fit">
            Отчёты о тестах
          </Badge>
          <h2 id="benchmarks-title" className="text-2xl font-semibold">
            Что уже измерено против классических подходов
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Три изолированных прогона: в каждом меняется ровно один этап
            конвейера. Ниже — их фактическое состояние, без округления в
            благоприятную сторону.
          </p>
        </div>

        <Alert variant="destructive">
          <IconAlertTriangle />
          <AlertTitle>
            Ни одна из шести технологий пока не подтверждена статистически
          </AlertTitle>
          <AlertDescription>
            <p>
              В прогоне 18 августа 2026 полноценные данные получил только HyDE —
              и выигрыша против hybrid-rag не показал. Contextual Retrieval
              выжил на 28 диалогах из 210, а reranking, CRAG, self-consistency и
              debate-judge не дали ни одного успешного диалога из-за внешних
              отказов провайдера. Нулевые Δ в таких отчётах означают отсутствие
              замера, а не отсутствие эффекта.
            </p>
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 lg:grid-cols-3">
          {AI_BENCHMARK_RUNS.map((run) => (
            <Card key={run.label} className="h-full">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <Badge
                    variant={
                      run.status === "no-data" ? "destructive" : "secondary"
                    }
                  >
                    {run.status === "no-data" ? "нет данных" : "есть данные"}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {run.runAt}
                  </span>
                </div>
                <CardTitle>
                  <h3 className="text-base">{run.label}</h3>
                </CardTitle>
                <CardDescription>
                  Контроль:{" "}
                  <code className="bg-muted rounded px-1.5 py-0.5 text-xs">
                    {run.control}
                  </code>
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3 text-sm leading-relaxed">
                <p>{run.outcome}</p>
                <code className="bg-muted mt-auto block overflow-x-auto rounded px-1.5 py-1 text-xs">
                  {run.reportPath}
                </code>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              <h3>Итог по каждой технологии</h3>
            </CardTitle>
            <CardDescription>
              Головная метрика прогона — MAE к эксперту; «нет данных» означает,
              что диалоги варианта не доехали до оценки.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Технология</TableHead>
                  <TableHead>Классический контроль</TableHead>
                  <TableHead className="text-right">
                    Диалогов в замере
                  </TableHead>
                  <TableHead>Вывод по MAE</TableHead>
                  <TableHead>Что дальше</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {AI_TECHNOLOGIES.map((technology) => {
                  const candidate = technology.benchmark.arms.find(
                    (arm) => arm.role === "candidate",
                  );
                  const maeVerdict =
                    technology.benchmark.metrics.find((metric) =>
                      metric.metric.startsWith("MAE"),
                    )?.verdict ?? "нет данных";

                  return (
                    <TableRow key={technology.slug}>
                      <TableCell className="whitespace-normal">
                        <Link
                          href={`/docs/ai/${technology.slug}#benchmark`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {technology.shortName}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <code className="bg-muted rounded px-1.5 py-1 text-xs">
                          {technology.referenceVariantId}
                        </code>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {candidate?.dialogs ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            maeVerdict === "нет данных"
                              ? "destructive"
                              : "outline"
                          }
                        >
                          {maeVerdict}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-56 whitespace-normal text-sm">
                        {technology.benchmark.status === "no-data"
                          ? "Повторить прогон при живой квоте провайдера"
                          : "Нужна экспертная разметка сценариев"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h3>Как считаются цифры</h3>
            </CardTitle>
            <CardDescription className="max-w-3xl leading-relaxed">
              Правила статистики зафиксированы в коде стенда, а не выбираются
              под результат. Без них таблица со Δ и p читается как «выиграл тот,
              у кого число больше».
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {AI_BENCHMARK_METHODOLOGY.map((rule) => (
              <div
                key={rule.title}
                className="bg-muted/40 flex flex-col gap-1.5 rounded-lg border p-4"
              >
                <p className="font-medium">{rule.title}</p>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {rule.detail}
                </p>
              </div>
            ))}
          </CardContent>
          <CardFooter className="flex-col items-start gap-2">
            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Полный прогон всех трёх сравнений с публикацией в админку
            </span>
            <pre className="bg-muted w-full overflow-x-auto rounded-lg p-3 text-xs">
              <code>{AI_BENCHMARK_FULL_RUN_COMMAND}</code>
            </pre>
          </CardFooter>
        </Card>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="proof-title">
        <div className="flex max-w-3xl flex-col gap-2">
          <Badge variant="outline" className="w-fit">
            Доказательство эффекта
          </Badge>
          <h2 id="proof-title" className="text-2xl font-semibold">
            От гипотезы до решения о запуске
          </h2>
          <p className="text-muted-foreground">
            Каждая технология проходит одинаковый измеримый путь — без
            субъективного «стало казаться лучше».
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PROOF_STEPS.map((step, index) => (
            <Card key={step.title} className="h-full">
              <CardHeader>
                <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-full text-sm font-semibold">
                  {index + 1}
                </div>
                <CardTitle>
                  <h3>{step.title}</h3>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm leading-relaxed">
                {step.description}
              </CardContent>
            </Card>
          ))}
        </div>
        <Alert>
          <IconAlertTriangle />
          <AlertTitle>Внедрение ещё не доказывает улучшение</AlertTitle>
          <AlertDescription>
            <p>
              Выигрыш подтверждается только benchmark-сравнением на одинаковых
              сценариях. До получения статистически устойчивого результата
              каждая технология остаётся проверяемой гипотезой.
            </p>
          </AlertDescription>
        </Alert>
      </section>

      <Card className="overflow-hidden border-primary/20">
        <CardContent className="grid gap-6 px-6 md:grid-cols-[1fr_auto] md:items-center lg:px-10">
          <div className="flex max-w-3xl flex-col gap-3">
            <div className="flex items-center gap-2 text-primary">
              <IconFlask />
              <span className="text-sm font-semibold">Следующий шаг</span>
            </div>
            <h2 className="text-2xl font-semibold">
              Сравните варианты на собственных сценариях
            </h2>
            <p className="text-muted-foreground">
              Настройте эксперимент, запустите benchmark и примите решение по
              качеству, стоимости и задержке — все варианты уже изолированы от
              своих контрольных групп.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row md:flex-col lg:flex-row">
            <Button
              render={<Link href="/admin/game/benchmarks" />}
              nativeButton={false}
            >
              <IconChartBar data-icon="inline-start" />
              Отчёты о качестве
            </Button>
            <Button
              variant="outline"
              render={<Link href="/admin/game/variants" />}
              nativeButton={false}
            >
              <IconShieldCheck data-icon="inline-start" />
              Варианты ИИ
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="text-muted-foreground flex items-center justify-center gap-2 pb-2 text-center text-sm">
        <IconCheck />
        Все технологии имеют безопасный fallback и отдельную контрольную группу
      </div>
    </div>
  );
}
