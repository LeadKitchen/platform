import type { ManagementStyle } from "@acme/game";
// Leaf import on purpose: the `@acme/game` barrel also re-exports the
// scoring heuristics (Unicode-lookbehind regexes) and the full restaurant
// catalog. This component runs inside a "use client" boundary
// (dialog-room.tsx), so pulling the barrel would ship all of that to the
// browser just for four label strings.
import { STYLE_LABELS } from "@acme/game/styles";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Progress,
  Separator,
} from "@acme/ui";
import {
  IconArrowRight,
  IconCheck,
  IconRefresh,
  IconTarget,
  IconTrendingUp,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";

export interface EvaluationView {
  scorePercent: number;
  expectedStyle: string;
  actualStyle: string;
  styleDistribution: Record<string, number>;
  criteria: {
    id: string;
    title: string;
    met: boolean;
    comment?: string | null;
  }[];
  outcome: {
    status: string;
    onTime: boolean;
    defects: string[];
    motivationDelta: number;
    summary: string;
  };
  breakdown: {
    style: number;
    actions: number;
    outcome: number;
    penalties: number;
  };
  summary: string;
}

const OUTCOME_LABELS: Record<string, string> = {
  success: "Заказ выполнен",
  partial: "Выполнен с замечаниями",
  failed: "Заказ испорчен",
};

function styleLabel(style: string): string {
  return STYLE_LABELS[style as ManagementStyle] ?? style;
}

/**
 * Разбор диалога для ведущего: итоговый процент, ожидаемый и фактический
 * стиль (с раскладкой s1 = x%, s2 = y%), список выполненных и невыполненных
 * критериев и результат заказа.
 */
export function EvaluationCard({
  evaluation,
  pending,
  onReplay,
}: {
  evaluation: EvaluationView;
  variantId?: string;
  pending?: boolean;
  onReplay?: () => void;
}) {
  const distribution = Object.entries(evaluation.styleDistribution)
    .filter(([, share]) => share > 0.01)
    .sort((a, b) => b[1] - a[1]);

  const outcomeTone =
    evaluation.outcome.status === "success"
      ? "success"
      : evaluation.outcome.status === "partial"
        ? "accent"
        : "destructive";
  const metCriteria = evaluation.criteria.filter((criterion) => criterion.met);
  const missedCriteria = evaluation.criteria.filter(
    (criterion) => !criterion.met,
  );
  const scoreLabel =
    evaluation.scorePercent >= 80
      ? "Сильный разговор"
      : evaluation.scorePercent >= 60
        ? "Хорошая основа"
        : "Есть точки роста";

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge variant="secondary" className="mb-3">
              Персональный разбор
            </Badge>
            <CardTitle className="text-2xl">{scoreLabel}</CardTitle>
          </div>
          <div className="text-right">
            <span className="font-display block text-5xl font-semibold tabular-nums">
              {evaluation.scorePercent}%
            </span>
            <span className="text-muted-foreground text-xs">общая оценка</span>
          </div>
        </div>
        <CardDescription>{evaluation.summary}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <Progress value={evaluation.scorePercent} />

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="border-success/30 bg-success/5 flex flex-col gap-3 rounded-lg border p-4">
            <div className="text-success flex items-center gap-2 font-semibold">
              <IconCheck /> Что уже получается
            </div>
            {metCriteria.length > 0 ? (
              <ul className="flex flex-col gap-2 text-sm">
                {metCriteria.slice(0, 4).map((criterion) => (
                  <li key={criterion.id} className="flex items-start gap-2">
                    <IconCheck className="text-success mt-0.5" />
                    <span>{criterion.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">
                Начните с чёткого результата и проверки понимания.
              </p>
            )}
          </div>

          <div className="border-accent-foreground/20 bg-accent/10 flex flex-col gap-3 rounded-lg border p-4">
            <div className="text-accent-foreground flex items-center gap-2 font-semibold">
              <IconTrendingUp /> Что попробовать в следующий раз
            </div>
            {missedCriteria.length > 0 ? (
              <ul className="flex flex-col gap-2 text-sm">
                {missedCriteria.slice(0, 4).map((criterion) => (
                  <li key={criterion.id} className="flex items-start gap-2">
                    <IconTarget className="text-accent-foreground mt-0.5" />
                    <span>
                      {criterion.title}
                      {criterion.comment ? ` — ${criterion.comment}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">
                Все ключевые действия выполнены — усложните следующую ситуацию.
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground text-sm">Ожидаемый стиль</p>
            <p className="font-medium">
              {styleLabel(evaluation.expectedStyle)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Фактический стиль</p>
            <p className="font-medium">{styleLabel(evaluation.actualStyle)}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">Раскладка по стилям</p>
          {distribution.map(([style, share]) => (
            <div key={style} className="flex items-center gap-3">
              <span className="w-40 text-sm">{styleLabel(style)}</span>
              <Progress value={share * 100} className="h-2 flex-1" />
              <span className="w-12 text-right text-sm tabular-nums">
                {Math.round(share * 100)}%
              </span>
            </div>
          ))}
        </div>

        <Separator />

        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">
            Полный чек-лист разговора
          </p>
          <ul className="flex flex-col gap-1">
            {evaluation.criteria.map((criterion) => (
              <li
                key={criterion.id}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <span>
                  {criterion.title}
                  {criterion.comment ? (
                    <span className="text-muted-foreground">
                      {" "}
                      — {criterion.comment}
                    </span>
                  ) : null}
                </span>
                <Badge variant={criterion.met ? "success" : "outline"}>
                  {criterion.met ? <IconCheck /> : <IconX />}
                  {criterion.met ? "выполнено" : "пропущено"}
                </Badge>
              </li>
            ))}
          </ul>
        </div>

        <Separator />

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Badge variant={outcomeTone}>
              {OUTCOME_LABELS[evaluation.outcome.status] ??
                evaluation.outcome.status}
            </Badge>
            <Badge variant="outline">
              {evaluation.outcome.onTime ? "в срок" : "с опозданием"}
            </Badge>
            <Badge variant="outline">
              мотивация {evaluation.outcome.motivationDelta > 0 ? "+" : ""}
              {evaluation.outcome.motivationDelta}
            </Badge>
          </div>
          <p className="text-sm">{evaluation.outcome.summary}</p>
        </div>

        <div className="text-muted-foreground grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <span>Стиль: {evaluation.breakdown.style} / 45</span>
          <span>Действия: {evaluation.breakdown.actions} / 35</span>
          <span>Результат: {evaluation.breakdown.outcome} / 20</span>
          <span>Штрафы: {evaluation.breakdown.penalties}</span>
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t">
        {onReplay ? (
          <Button disabled={pending} onClick={onReplay}>
            <IconRefresh data-icon="inline-start" />
            Повторить эту ситуацию
          </Button>
        ) : null}
        <Button
          variant="outline"
          render={<Link href="/game" />}
          nativeButton={false}
        >
          Выбрать следующую ситуацию
          <IconArrowRight data-icon="inline-end" />
        </Button>
      </CardFooter>
    </Card>
  );
}
