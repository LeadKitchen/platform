"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Progress,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@acme/ui";
import { IconCheck, IconRefresh, IconSchool } from "@tabler/icons-react";
import { useMemo, useState } from "react";

const LEVELS = [
  { id: "L1", label: "L1 — не умеет и не уверен" },
  { id: "L2", label: "L2 — учится, нужна поддержка" },
  { id: "L3", label: "L3 — умеет, но не всегда уверен" },
  { id: "L4", label: "L4 — умеет и берёт ответственность" },
] as const;

const STYLES = [
  { id: "directive", label: "Директивный" },
  { id: "coaching", label: "Наставнический" },
  { id: "supporting", label: "Поддерживающий" },
  { id: "delegating", label: "Делегирующий" },
] as const;

const CASES = [
  {
    id: "timur",
    name: "Тимур",
    role: "Стажёр",
    description:
      "Впервые вышел на кухню, ждёт подробных инструкций и боится сообщать об ошибках.",
    answer: "L1",
    styleId: "directive",
    style: "Директивный",
  },
  {
    id: "marina",
    name: "Марина",
    role: "Помощник повара",
    description:
      "Уже знает базовые операции, но путается в граммовках и нуждается в объяснении и поддержке.",
    answer: "L2",
    styleId: "coaching",
    style: "Наставнический",
  },
  {
    id: "igor",
    name: "Игорь",
    role: "Повар горячего цеха",
    description:
      "Уверенно готовит знакомые блюда, но теряет темп при нескольких заказах и сомневается в приоритетах.",
    answer: "L3",
    styleId: "supporting",
    style: "Поддерживающий",
  },
  {
    id: "anna",
    name: "Анна",
    role: "Повар десертов",
    description:
      "Самостоятельно отвечает за привычную выпечку, контролирует качество и не нуждается в постоянном надзоре.",
    answer: "L4",
    styleId: "delegating",
    style: "Делегирующий",
  },
] as const;

export function RoundOneTraining() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [currentIndex, setCurrentIndex] = useState(0);

  const score = useMemo(
    () => Object.values(results).filter(Boolean).length,
    [results],
  );
  const item = CASES[currentIndex] ?? CASES[0];
  const currentComplete = Boolean(
    answers[`${item.id}:level`] && answers[`${item.id}:style`],
  );
  const checked = Object.hasOwn(results, item.id);
  const finished = Object.keys(results).length === CASES.length;

  function reset() {
    setAnswers({});
    setResults({});
    setCurrentIndex(0);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <IconSchool />
                Разминка: выберите подход руководителя
              </CardTitle>
              <CardDescription>
                По одной ситуации за раз. Сначала оцените готовность, затем
                выберите стиль руководства.
              </CardDescription>
            </div>
            <Badge variant="secondary">
              {currentIndex + 1} из {CASES.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <Progress
            value={((currentIndex + (checked ? 1 : 0)) / CASES.length) * 100}
          />

          <Card className="bg-muted/30">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>{item.name}</CardTitle>
                  <CardDescription>{item.role}</CardDescription>
                </div>
                {checked ? (
                  <Badge variant={results[item.id] ? "default" : "destructive"}>
                    {results[item.id] ? "Верно" : "Есть что улучшить"}
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <p className="max-w-3xl text-base leading-relaxed">
                {item.description}
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">1. Уровень готовности</p>
                  <Select
                    value={answers[`${item.id}:level`] ?? ""}
                    onValueChange={(value) => {
                      setAnswers({
                        ...answers,
                        [`${item.id}:level`]: value ?? "",
                      });
                      setResults((current) => {
                        const next = { ...current };
                        delete next[item.id];
                        return next;
                      });
                    }}
                  >
                    <SelectTrigger
                      aria-label={`Уровень сотрудника ${item.name}`}
                    >
                      <SelectValue placeholder="Выберите уровень" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {LEVELS.map((level) => (
                          <SelectItem key={level.id} value={level.id}>
                            {level.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">2. Стиль руководства</p>
                  <Select
                    value={answers[`${item.id}:style`] ?? ""}
                    onValueChange={(value) => {
                      setAnswers({
                        ...answers,
                        [`${item.id}:style`]: value ?? "",
                      });
                      setResults((current) => {
                        const next = { ...current };
                        delete next[item.id];
                        return next;
                      });
                    }}
                  >
                    <SelectTrigger
                      aria-label={`Стиль руководства для ${item.name}`}
                    >
                      <SelectValue placeholder="Выберите стиль" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {STYLES.map((style) => (
                          <SelectItem key={style.id} value={style.id}>
                            {style.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {checked ? (
                <Alert>
                  <IconCheck />
                  <AlertTitle>
                    Правильная связка: {item.answer} · {item.style}
                  </AlertTitle>
                  <AlertDescription>
                    {results[item.id]
                      ? "Отлично: оценка готовности и выбранный стиль совпали."
                      : "Сравните связку со своим ответом. В практике важно оценивать готовность именно к конкретной задаче."}
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            {!checked ? (
              <Button
                disabled={!currentComplete}
                onClick={() =>
                  setResults({
                    ...results,
                    [item.id]:
                      answers[`${item.id}:level`] === item.answer &&
                      answers[`${item.id}:style`] === item.styleId,
                  })
                }
              >
                <IconCheck data-icon="inline-start" />
                Проверить
              </Button>
            ) : currentIndex < CASES.length - 1 ? (
              <Button onClick={() => setCurrentIndex(currentIndex + 1)}>
                Следующая ситуация
              </Button>
            ) : null}

            {currentIndex > 0 ? (
              <Button
                variant="outline"
                onClick={() => setCurrentIndex(currentIndex - 1)}
              >
                Назад
              </Button>
            ) : null}

            <Button variant="ghost" onClick={reset}>
              <IconRefresh data-icon="inline-start" />
              Начать заново
            </Button>
          </div>

          {finished ? (
            <Alert>
              <IconSchool />
              <AlertTitle>
                Разминка завершена: {score} из {CASES.length}
              </AlertTitle>
              <AlertDescription>
                Теперь переходите к практике: там готовность зависит от
                сочетания сотрудника и конкретного заказа.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
