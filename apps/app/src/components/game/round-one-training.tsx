"use client";

import {
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
  const [checked, setChecked] = useState(false);

  const score = useMemo(
    () =>
      CASES.filter(
        (item) =>
          answers[`${item.id}:level`] === item.answer &&
          answers[`${item.id}:style`] === item.styleId,
      ).length,
    [answers],
  );
  const complete = Object.keys(answers).length === CASES.length * 2;

  function reset() {
    setAnswers({});
    setChecked(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconSchool />
            Раунд 1 · Определите уровень готовности
          </CardTitle>
          <CardDescription>
            В этом раунде ИИ не используется. Прочитайте описание сотрудника,
            выберите его уровень и сопоставьте с подходящим стилем руководства.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {CASES.map((item, index) => {
            const correct =
              answers[`${item.id}:level`] === item.answer &&
              answers[`${item.id}:style`] === item.styleId;
            return (
              <Card key={item.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">
                        {index + 1}. {item.name}
                      </CardTitle>
                      <CardDescription>{item.role}</CardDescription>
                    </div>
                    {checked ? (
                      <Badge variant={correct ? "default" : "destructive"}>
                        {correct ? "Верно" : "Нужно повторить"}
                      </Badge>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-[1fr_240px_240px] lg:items-center">
                  <p className="text-sm">{item.description}</p>
                  <Select
                    value={answers[`${item.id}:level`] ?? ""}
                    onValueChange={(value) => {
                      setAnswers({
                        ...answers,
                        [`${item.id}:level`]: value ?? "",
                      });
                      setChecked(false);
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
                  <Select
                    value={answers[`${item.id}:style`] ?? ""}
                    onValueChange={(value) => {
                      setAnswers({
                        ...answers,
                        [`${item.id}:style`]: value ?? "",
                      });
                      setChecked(false);
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
                  {checked ? (
                    <p className="text-muted-foreground text-sm lg:col-span-3">
                      Правильная связка: {item.answer} · {item.style} стиль.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}

          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={!complete} onClick={() => setChecked(true)}>
              <IconCheck data-icon="inline-start" />
              Проверить ответы
            </Button>
            <Button variant="outline" onClick={reset}>
              <IconRefresh data-icon="inline-start" />
              Начать заново
            </Button>
            {checked ? (
              <span className="text-sm font-medium">
                Результат: {score} из {CASES.length}
              </span>
            ) : null}
          </div>
          {checked ? <Progress value={(score / CASES.length) * 100} /> : null}
        </CardContent>
      </Card>
    </div>
  );
}
