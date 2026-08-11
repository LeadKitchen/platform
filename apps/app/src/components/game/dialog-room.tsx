"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Textarea,
} from "@acme/ui";
import { useCallback, useState } from "react";
import { client } from "~/orpc/react";
import { EvaluationCard, type EvaluationView } from "./evaluation-card";
import { useSpeechRecognition } from "./use-speech-recognition";

interface Turn {
  role: "manager" | "employee";
  text: string;
}

export interface DialogRoomProps {
  dialogId: string;
  employee: { name: string; role: string };
  task: { title: string };
  shift: { round: number; activeOrders: number; soloOnShift: boolean };
  initialTurns: Turn[];
  initialEvaluation: EvaluationView | null;
  initialFinished: boolean;
  variantId: string;
}

/**
 * Комната диалога участника с ИИ-сотрудником.
 *
 * Голос распознаётся в браузере, в API уходит текст. Когда сотрудник молчит,
 * это не ошибка, а часть сценария: он включается в разговор только после того,
 * как руководитель к нему обратился.
 */
export function DialogRoom(props: DialogRoomProps) {
  const [turns, setTurns] = useState<Turn[]>(props.initialTurns);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [finished, setFinished] = useState(props.initialFinished);
  const [evaluation, setEvaluation] = useState<EvaluationView | null>(
    props.initialEvaluation,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const speech = useSpeechRecognition({
    onFinal: useCallback((text: string) => {
      setDraft((current) => (current ? `${current} ${text}` : text));
    }, []),
  });

  async function send() {
    const text = draft.trim();
    if (text.length === 0 || pending || finished) return;

    setPending(true);
    setError(null);
    setNotice(null);
    setDraft("");

    try {
      const result = await client.game.dialog.say({
        dialogId: props.dialogId,
        text,
      });

      setTurns((current) => [
        ...current,
        { role: "manager", text },
        ...(result.silent
          ? []
          : [{ role: "employee" as const, text: result.reply }]),
      ]);

      if (result.silent) {
        setNotice(
          `${props.employee.name} не реагирует: сотрудник включается в диалог, только когда руководитель обращается к нему напрямую.`,
        );
      }
      if (result.managerToxic) {
        setNotice(
          "Реплика распознана как грубая — это снизит итоговую оценку и мотивацию сотрудника.",
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось отправить");
      setDraft(text);
    } finally {
      setPending(false);
    }
  }

  async function finish() {
    if (pending || finished) return;
    setPending(true);
    setError(null);

    try {
      const result = await client.game.dialog.finish({
        dialogId: props.dialogId,
      });
      setEvaluation(result.evaluation as unknown as EvaluationView);
      setFinished(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось завершить");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {props.employee.name}
            <span className="text-muted-foreground text-sm font-normal">
              {props.employee.role}
            </span>
            <Badge variant="outline">Раунд {props.shift.round}</Badge>
            {props.shift.soloOnShift ? (
              <Badge variant="secondary">Один в смене</Badge>
            ) : null}
            <Badge variant="outline">
              Заказов в работе: {props.shift.activeOrders}
            </Badge>
          </CardTitle>
          <CardDescription>
            Заказ: {props.task.title}. Вариант ИИ: {props.variantId}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto">
            {turns.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Обратитесь к сотруднику: назовите по имени и поставьте задачу.
              </p>
            ) : null}

            {turns.map((turn, index) => (
              <div
                // Реплики неизменяемы и только добавляются в конец.
                key={`${index}-${turn.role}`}
                className={
                  turn.role === "manager"
                    ? "bg-primary/10 ml-auto max-w-[80%] rounded-lg px-3 py-2"
                    : "bg-muted mr-auto max-w-[80%] rounded-lg px-3 py-2"
                }
              >
                <p className="text-muted-foreground mb-1 text-xs">
                  {turn.role === "manager" ? "Вы" : props.employee.name}
                </p>
                <p className="text-sm whitespace-pre-wrap">{turn.text}</p>
              </div>
            ))}

            {speech.interim ? (
              <p className="text-muted-foreground ml-auto text-sm italic">
                {speech.interim}…
              </p>
            ) : null}
          </div>

          {notice ? (
            <p className="bg-muted rounded-md px-3 py-2 text-sm">{notice}</p>
          ) : null}
          {error ? (
            <p className="text-destructive border-destructive/40 rounded-md border px-3 py-2 text-sm">
              {error}
            </p>
          ) : null}
          {speech.error ? (
            <p className="text-destructive border-destructive/40 rounded-md border px-3 py-2 text-sm">
              {speech.error}
            </p>
          ) : null}

          {finished ? (
            <p className="text-muted-foreground text-sm">
              Диалог завершён, оценка отправлена администратору.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Что вы говорите сотруднику?"
                rows={3}
                disabled={pending}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={send}
                  disabled={pending || draft.trim() === ""}
                >
                  Отправить
                </Button>

                {speech.supported ? (
                  <Button
                    type="button"
                    variant={speech.listening ? "destructive" : "outline"}
                    onClick={speech.listening ? speech.stop : speech.start}
                  >
                    {speech.listening ? "Остановить запись" : "Говорить"}
                  </Button>
                ) : (
                  <span className="text-muted-foreground self-center text-xs">
                    Голосовой ввод не поддерживается этим браузером — введите
                    текст
                  </span>
                )}

                <Button
                  type="button"
                  variant="secondary"
                  onClick={finish}
                  disabled={pending || turns.length === 0}
                >
                  Завершить и оценить
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {evaluation ? (
        <EvaluationCard evaluation={evaluation} variantId={props.variantId} />
      ) : null}
    </div>
  );
}
