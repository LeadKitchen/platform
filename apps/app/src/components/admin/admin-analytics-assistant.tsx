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
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Textarea,
} from "@acme/ui";
import { IconBulb, IconChartBar, IconSparkles } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";
import { client } from "~/orpc/react";

const QUESTIONS = [
  "Почему в третьем раунде оценки ниже?",
  "Какие управленческие действия чаще всего пропускают?",
  "Где игроки прерывают прохождение?",
] as const;

interface Insight {
  answer: string;
  findings: Array<{
    title: string;
    evidence: string;
    recommendation: string;
  }>;
  suggestedQuestions: string[];
}

export function AdminAnalyticsAssistant() {
  const [question, setQuestion] = useState<string>(QUESTIONS[0]);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function analyze() {
    if (pending || question.trim().length < 5) return;
    setPending(true);
    try {
      const result = await client.admin.game.insights.analyze({ question });
      setInsight(result.insight);
      setModel(result.model);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Анализ недоступен");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <IconSparkles /> Спросить об аналитике
            </CardTitle>
            <CardDescription>
              LLM получает только обезличенные агрегаты и отделяет факты от
              гипотез.
            </CardDescription>
          </div>
          {model ? <Badge variant="secondary">{model}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="analytics-question">Вопрос</FieldLabel>
            <Textarea
              id="analytics-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={3}
            />
            <FieldDescription>
              Персональные данные и тексты разговоров модели не передаются.
            </FieldDescription>
          </Field>
        </FieldGroup>
        <div className="flex flex-wrap gap-2">
          {QUESTIONS.map((item) => (
            <Button
              key={item}
              size="sm"
              variant="outline"
              onClick={() => setQuestion(item)}
            >
              {item}
            </Button>
          ))}
        </div>
        <Button className="self-start" disabled={pending} onClick={analyze}>
          <IconChartBar data-icon="inline-start" />
          {pending ? "Анализируем…" : "Получить объяснение"}
        </Button>

        {insight ? (
          <div className="flex flex-col gap-3">
            <Alert>
              <IconBulb />
              <AlertTitle>Ответ</AlertTitle>
              <AlertDescription>{insight.answer}</AlertDescription>
            </Alert>
            <div className="grid gap-3 lg:grid-cols-2">
              {insight.findings.map((finding) => (
                <Card key={finding.title}>
                  <CardHeader>
                    <CardTitle>{finding.title}</CardTitle>
                    <CardDescription>{finding.evidence}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm">
                    {finding.recommendation}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
