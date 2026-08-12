"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ScrollArea,
  Textarea,
} from "@acme/ui";
import {
  IconAlertTriangle,
  IconCheck,
  IconMicrophone,
  IconPlayerStop,
  IconSend,
  IconSparkles,
  IconUser,
} from "@tabler/icons-react";
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
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Avatar className="size-12">
                <AvatarFallback>
                  {props.employee.name.slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle>{props.employee.name}</CardTitle>
                <CardDescription>{props.employee.role}</CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>Сотрудник · ИИ</Badge>
              <Badge variant="outline">Раунд {props.shift.round}</Badge>
              {props.shift.soloOnShift ? (
                <Badge variant="secondary">Один в смене</Badge>
              ) : null}
              <Badge variant="outline">
                Заказов в работе: {props.shift.activeOrders}
              </Badge>
            </div>
          </div>
          <CardDescription>
            Ситуация: {props.task.title}. Обратитесь к сотруднику по имени,
            поставьте задачу и продолжайте разговор, реагируя на его ответы.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <Alert>
            <IconSparkles />
            <AlertTitle>Ваша цель</AlertTitle>
            <AlertDescription>
              Выберите подходящий стиль руководства, договоритесь о результате и
              сроке. Для сложной или новой задачи могут понадобиться шаги,
              контрольные точки и проверка понимания.
            </AlertDescription>
          </Alert>

          <ScrollArea className="h-[420px] rounded-lg border p-4">
            <div className="flex flex-col gap-4">
              {turns.length === 0 ? (
                <Empty className="border-0 py-16">
                  <EmptyHeader>
                    <EmptyMedia>
                      <Avatar className="size-14">
                        <AvatarFallback>
                          <IconUser />
                        </AvatarFallback>
                      </Avatar>
                    </EmptyMedia>
                    <EmptyTitle>
                      {props.employee.name} ждёт вашего обращения
                    </EmptyTitle>
                    <EmptyDescription>
                      Нажмите «Говорить» или напишите первую реплику. Начните с
                      имени сотрудника, чтобы включить его в разговор.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : null}

              {turns.map((turn, index) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: Реплики неизменяемы и только добавляются в конец.
                  key={`${index}-${turn.role}`}
                  className={
                    turn.role === "manager"
                      ? "bg-primary/10 ml-auto max-w-[80%] rounded-lg px-3 py-2"
                      : "bg-muted mr-auto max-w-[80%] rounded-lg px-3 py-2"
                  }
                >
                  <div className="mb-1 flex items-center gap-2">
                    <Avatar className="size-6">
                      <AvatarFallback>
                        {turn.role === "manager"
                          ? "ВЫ"
                          : props.employee.name.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <p className="text-muted-foreground text-xs">
                      {turn.role === "manager" ? "Вы" : props.employee.name}
                    </p>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{turn.text}</p>
                </div>
              ))}

              {speech.interim ? (
                <p className="text-muted-foreground ml-auto text-sm italic">
                  {speech.interim}…
                </p>
              ) : null}
            </div>
          </ScrollArea>

          {notice ? (
            <Alert>
              <IconAlertTriangle />
              <AlertTitle>Обратите внимание</AlertTitle>
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <IconAlertTriangle />
              <AlertTitle>Не удалось продолжить разговор</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {speech.error ? (
            <Alert variant="destructive">
              <IconAlertTriangle />
              <AlertTitle>Голосовой ввод недоступен</AlertTitle>
              <AlertDescription>{speech.error}</AlertDescription>
            </Alert>
          ) : null}

          {finished ? (
            <p className="text-muted-foreground text-sm">
              Диалог завершён, оценка отправлена администратору.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <Textarea
                aria-label="Сообщение сотруднику"
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
                  <IconSend data-icon="inline-start" />
                  Отправить
                </Button>

                {speech.supported ? (
                  <Button
                    type="button"
                    variant={speech.listening ? "destructive" : "outline"}
                    onClick={speech.listening ? speech.stop : speech.start}
                  >
                    {speech.listening ? (
                      <IconPlayerStop data-icon="inline-start" />
                    ) : (
                      <IconMicrophone data-icon="inline-start" />
                    )}
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
                  <IconCheck data-icon="inline-start" />
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
