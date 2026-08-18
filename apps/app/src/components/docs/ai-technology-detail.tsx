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
  Separator,
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
  IconTarget,
} from "@tabler/icons-react";
import Link from "next/link";
import { AI_TECHNOLOGIES, type AiTechnology } from "~/content/ai-technologies";

interface AiTechnologyDetailProps {
  technology: AiTechnology;
}

export function AiTechnologyDetail({ technology }: AiTechnologyDetailProps) {
  const technologyIndex = AI_TECHNOLOGIES.findIndex(
    (item) => item.slug === technology.slug,
  );
  const previousTechnology =
    technologyIndex > 0 ? AI_TECHNOLOGIES[technologyIndex - 1] : undefined;
  const nextTechnology =
    technologyIndex < AI_TECHNOLOGIES.length - 1
      ? AI_TECHNOLOGIES[technologyIndex + 1]
      : undefined;
  const TechnologyIcon = technology.icon;

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 lg:p-6">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card">
        <CardContent className="grid gap-8 px-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)] lg:px-10">
          <div className="flex flex-col items-start gap-5 py-2 lg:py-6">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{technology.stageLabel}</Badge>
              <Badge variant="outline">Вариант: {technology.variantId}</Badge>
              <Badge variant="outline">
                Контроль: {technology.referenceVariantId}
              </Badge>
            </div>
            <div className="flex max-w-3xl flex-col gap-3">
              <p className="text-primary text-sm font-semibold">
                {technology.eyebrow}
              </p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {technology.name}
              </h1>
              <p className="text-muted-foreground text-base leading-relaxed sm:text-lg">
                {technology.summary}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                render={<a href="#how-it-works" />}
                nativeButton={false}
              >
                Как это работает
                <IconArrowRight data-icon="inline-end" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                render={<Link href="/admin/game/benchmarks" />}
                nativeButton={false}
              >
                <IconChartBar data-icon="inline-start" />
                Результаты измерений
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-center py-4">
            <div className="bg-background/80 flex w-full max-w-sm flex-col gap-5 rounded-2xl border p-6 shadow-sm backdrop-blur-sm">
              <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-2xl">
                <TechnologyIcon />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Вычислительный профиль
                </span>
                <span className="text-lg font-semibold">
                  {technology.computeLabel}
                </span>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {technology.computeDescription}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Суть и польза">
        <Card className="h-full">
          <CardHeader>
            <Badge variant="outline" className="w-fit">
              Простыми словами
            </Badge>
            <CardTitle>
              <h2>Что это такое</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="leading-relaxed">{technology.plainLanguage}</p>
          </CardContent>
        </Card>
        <Card className="h-full border-primary/20">
          <CardHeader>
            <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
              <IconTarget />
            </div>
            <CardTitle>
              <h2>Что получает заказчик</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="leading-relaxed">{technology.customerOutcome}</p>
          </CardContent>
        </Card>
      </section>

      <section
        id="how-it-works"
        className="flex scroll-mt-20 flex-col gap-4"
        aria-labelledby="flow-title"
      >
        <div className="flex max-w-3xl flex-col gap-2">
          <Badge variant="outline" className="w-fit">
            Механика
          </Badge>
          <h2 id="flow-title" className="text-2xl font-semibold">
            Как это работает по шагам
          </h2>
          <p className="text-muted-foreground">
            Технология встроена как ограниченный и наблюдаемый этап, а не как
            автономный агент с непредсказуемым числом действий.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {technology.flow.map((step, index) => (
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
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="benefits-title">
        <div className="flex max-w-3xl flex-col gap-2">
          <Badge variant="outline" className="w-fit">
            Практическая польза
          </Badge>
          <h2 id="benefits-title" className="text-2xl font-semibold">
            Чем помогает продукту
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {technology.benefits.map((benefit) => (
            <Card key={benefit.title} className="h-full">
              <CardHeader>
                <IconCheck className="text-primary" />
                <CardTitle>
                  <h3>{benefit.title}</h3>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm leading-relaxed">
                {benefit.description}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Применимость">
        <Card className="h-full">
          <CardHeader>
            <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
              <IconSparkles />
            </div>
            <CardTitle>
              <h2>Когда применять</h2>
            </CardTitle>
            <CardDescription>
              Ситуации, в которых ожидаемый эффект наиболее реалистичен.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {technology.useWhen.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm">
                  <IconCheck className="mt-0.5 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="h-full">
          <CardHeader>
            <div className="bg-muted flex size-10 items-center justify-center rounded-lg">
              <IconAlertTriangle />
            </div>
            <CardTitle>
              <h2>Ограничения</h2>
            </CardTitle>
            <CardDescription>
              Цена и риски, которые учитываются перед промышленным включением.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {technology.limits.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm">
                  <IconAlertTriangle className="mt-0.5 shrink-0 text-muted-foreground" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section
        className="flex flex-col gap-4"
        aria-labelledby="measurement-title"
      >
        <div className="flex max-w-3xl flex-col gap-2">
          <Badge variant="outline" className="w-fit">
            Измерение результата
          </Badge>
          <h2 id="measurement-title" className="text-2xl font-semibold">
            Как доказать, что технология помогает
          </h2>
          <p className="text-muted-foreground">
            Вариант{" "}
            <code className="bg-muted rounded px-1.5 py-1 text-xs">
              {technology.variantId}
            </code>{" "}
            сравнивается с{" "}
            <code className="bg-muted rounded px-1.5 py-1 text-xs">
              {technology.referenceVariantId}
            </code>{" "}
            на одинаковых сценариях и моделях.
          </p>
        </div>
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Метрика</TableHead>
                  <TableHead>На какой вопрос отвечает</TableHead>
                  <TableHead>Сигнал успеха</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {technology.measurements.map((measurement) => (
                  <TableRow key={measurement.metric}>
                    <TableCell className="min-w-44 whitespace-normal font-medium">
                      {measurement.metric}
                    </TableCell>
                    <TableCell className="min-w-64 whitespace-normal">
                      {measurement.question}
                    </TableCell>
                    <TableCell className="min-w-64 whitespace-normal">
                      {measurement.successSignal}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Alert>
          <IconFlask />
          <AlertTitle>Оцениваем качество вместе с экономикой</AlertTitle>
          <AlertDescription>
            <p>
              Рост одной метрики недостаточен: benchmark также проверяет
              повторяемость, failure rate, задержку и стоимость. Решение о
              запуске принимается по совокупному эффекту.
            </p>
          </AlertDescription>
        </Alert>
      </section>

      <section
        className="flex flex-col gap-4"
        aria-labelledby="operations-title"
      >
        <div className="flex max-w-3xl flex-col gap-2">
          <Badge variant="outline" className="w-fit">
            Эксплуатация
          </Badge>
          <h2 id="operations-title" className="text-2xl font-semibold">
            Стоимость, fallback и настройки
          </h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>
                <h3>Вычислительная цена</h3>
              </CardTitle>
              <CardDescription>{technology.computeLabel}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed">
              {technology.computeDescription}
            </CardContent>
          </Card>
          <Card className="h-full lg:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <IconShieldCheck className="text-primary" />
                <CardTitle>
                  <h3>Безопасная деградация</h3>
                </CardTitle>
              </div>
              <CardDescription>
                Что произойдёт при ошибке дополнительного этапа.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed">
              {technology.fallback}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              <h3>Ключевые параметры</h3>
            </CardTitle>
            <CardDescription>
              Значения по умолчанию можно менять в конфигурации варианта без
              изменения базового конвейера.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {technology.parameters.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Параметр</TableHead>
                    <TableHead>По умолчанию</TableHead>
                    <TableHead>Назначение</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {technology.parameters.map((parameter) => (
                    <TableRow key={parameter.name}>
                      <TableCell>
                        <code className="bg-muted rounded px-1.5 py-1 text-xs">
                          {parameter.name}
                        </code>
                      </TableCell>
                      <TableCell>{parameter.defaultValue}</TableCell>
                      <TableCell className="min-w-64 whitespace-normal">
                        {parameter.meaning}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="bg-muted/40 rounded-lg border border-dashed p-5 text-sm">
                Для этой технологии нет отдельных пользовательских параметров:
                безопасный контур зафиксирован в реализации.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <Badge variant="outline" className="w-fit">
            Исследовательская основа
          </Badge>
          <CardTitle>
            <h2>{technology.source.label}</h2>
          </CardTitle>
          <CardDescription className="max-w-3xl leading-relaxed">
            {technology.source.note}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button
            variant="outline"
            render={
              <a
                href={technology.source.url}
                target="_blank"
                rel="noreferrer"
              />
            }
            nativeButton={false}
          >
            Открыть источник
            <IconArrowRight data-icon="inline-end" />
          </Button>
        </CardFooter>
      </Card>

      <Separator />

      <nav className="grid gap-3 sm:grid-cols-2" aria-label="Другие технологии">
        {previousTechnology ? (
          <Button
            className="h-auto justify-start px-4 py-3"
            variant="outline"
            render={<Link href={`/docs/ai/${previousTechnology.slug}`} />}
            nativeButton={false}
          >
            <IconArrowRight data-icon="inline-start" className="rotate-180" />
            <span className="flex flex-col items-start gap-0.5">
              <span className="text-muted-foreground text-xs">Предыдущая</span>
              <span>{previousTechnology.shortName}</span>
            </span>
          </Button>
        ) : (
          <Button
            className="h-auto justify-start px-4 py-3"
            variant="outline"
            render={<Link href="/docs/ai" />}
            nativeButton={false}
          >
            <IconArrowRight data-icon="inline-start" className="rotate-180" />
            <span className="flex flex-col items-start gap-0.5">
              <span className="text-muted-foreground text-xs">К обзору</span>
              <span>Все технологии</span>
            </span>
          </Button>
        )}

        {nextTechnology ? (
          <Button
            className="h-auto justify-end px-4 py-3 sm:text-right"
            variant="outline"
            render={<Link href={`/docs/ai/${nextTechnology.slug}`} />}
            nativeButton={false}
          >
            <span className="flex flex-col items-end gap-0.5">
              <span className="text-muted-foreground text-xs">Следующая</span>
              <span>{nextTechnology.shortName}</span>
            </span>
            <IconArrowRight data-icon="inline-end" />
          </Button>
        ) : (
          <Button
            className="h-auto justify-end px-4 py-3 sm:text-right"
            variant="outline"
            render={<Link href="/docs/ai" />}
            nativeButton={false}
          >
            <span className="flex flex-col items-end gap-0.5">
              <span className="text-muted-foreground text-xs">Завершить</span>
              <span>Вернуться к обзору</span>
            </span>
            <IconArrowRight data-icon="inline-end" />
          </Button>
        )}
      </nav>
    </div>
  );
}
