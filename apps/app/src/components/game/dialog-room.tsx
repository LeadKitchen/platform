"use client";

import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Progress,
  ScrollArea,
  Separator,
  Textarea,
} from "@acme/ui";
import {
  IconAlertTriangle,
  IconBulb,
  IconCheck,
  IconChevronDown,
  IconLoader2,
  IconMicrophone,
  IconPlayerPause,
  IconPlayerStop,
  IconRefresh,
  IconSend,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { client } from "~/orpc/react";
import { EvaluationCard, type EvaluationView } from "./evaluation-card";
import { ChefHatIllustration, SteamWisps } from "./illustrations";
import { useSpeechRecognition } from "./use-speech-recognition";

interface Turn {
  role: "manager" | "employee";
  text: string;
}

const CONVERSATION_STARTERS = [
  "Обратиться по имени",
  "Объяснить ожидаемый результат",
  "Уточнить, всё ли понятно",
] as const;

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
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>(props.initialTurns);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [finished, setFinished] = useState(props.initialFinished);
  const [evaluation, setEvaluation] = useState<EvaluationView | null>(
    props.initialEvaluation,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failedDraft, setFailedDraft] = useState<string | null>(null);
  const [finishCheck, setFinishCheck] = useState<null | {
    missingCritical: Array<{ id: string; title: string; met: boolean }>;
  }>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const draftLoaded = useRef(false);
  const evaluationTracked = useRef(false);
  const requestController = useRef<AbortController | null>(null);
  const draftKey = `sitruk:dialog-draft:${props.dialogId}`;
  const latestActivity = `${turns.length}:${pending}`;
  const managerTurns = turns.filter((turn) => turn.role === "manager").length;
  const conversationStep = finished ? 3 : managerTurns >= 2 ? 2 : 1;
  const conversationProgress = finished ? 100 : conversationStep * 33;

  function stepClass(step: number) {
    if (step === conversationStep) {
      return "bg-primary text-primary-foreground flex items-center gap-3 rounded-lg p-3";
    }
    if (step < conversationStep) {
      return "bg-primary/5 flex items-center gap-3 rounded-lg border border-primary/20 p-3";
    }
    return "bg-muted flex items-center gap-3 rounded-lg border p-3";
  }

  const speech = useSpeechRecognition({
    onFinal: useCallback((text: string) => {
      setDraft((current) => (current ? `${current} ${text}` : text));
    }, []),
  });

  useEffect(() => {
    if (latestActivity) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [latestActivity]);

  useEffect(() => {
    const saved = window.localStorage.getItem(draftKey);
    if (saved) setDraft(saved);
    draftLoaded.current = true;
  }, [draftKey]);

  useEffect(() => {
    if (!draftLoaded.current) return;
    if (draft) window.localStorage.setItem(draftKey, draft);
    else window.localStorage.removeItem(draftKey);
  }, [draft, draftKey]);

  useEffect(() => {
    if (!speech.listening) {
      setRecordingSeconds(0);
      return;
    }
    const timer = window.setInterval(
      () => setRecordingSeconds((current) => current + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [speech.listening]);

  useEffect(() => {
    if (!evaluation || evaluationTracked.current) return;
    evaluationTracked.current = true;
    void client.game.activity
      .track({
        name: "evaluation_viewed",
        dialogId: props.dialogId,
        properties: {},
      })
      .catch(() => undefined);
  }, [evaluation, props.dialogId]);

  async function send(textOverride?: string) {
    const text = (textOverride ?? draft).trim();
    if (text.length === 0 || pending || finished) return;

    const controller = new AbortController();
    requestController.current = controller;
    setPending(true);
    setError(null);
    setNotice(null);
    setFailedDraft(null);
    setDraft("");

    try {
      const result = await client.game.dialog.say(
        {
          dialogId: props.dialogId,
          text,
        },
        { signal: controller.signal },
      );

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
      if (controller.signal.aborted) {
        try {
          const current = await client.game.dialog.byId({
            dialogId: props.dialogId,
          });
          setTurns(current.turns);
        } catch {
          setTurns((current) => [...current, { role: "manager", text }]);
        }
        setNotice(
          "Ответ сотрудника остановлен. Ваша отправленная реплика осталась в разговоре.",
        );
      } else {
        setDraft(text);
        setError(
          cause instanceof Error ? cause.message : "Не удалось отправить",
        );
        setFailedDraft(text);
      }
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
      }
      setPending(false);
    }
  }

  function cancelSend() {
    requestController.current?.abort();
  }

  async function completeFinish() {
    if (pending || finished) return;
    setPending(true);
    setError(null);

    try {
      const result = await client.game.dialog.finish({
        dialogId: props.dialogId,
      });
      setEvaluation(result.evaluation as unknown as EvaluationView);
      setFinished(true);
      window.localStorage.removeItem(draftKey);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось завершить");
    } finally {
      setPending(false);
    }
  }

  async function requestFinish() {
    if (pending || finished) return;
    setPending(true);
    setError(null);
    try {
      const check = await client.game.dialog.preflight({
        dialogId: props.dialogId,
      });
      if (check.ready) {
        setPending(false);
        await completeFinish();
      } else {
        setFinishCheck({ missingCritical: check.missingCritical });
        setPending(false);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось проверить");
      setPending(false);
    }
  }

  async function startSpeech() {
    await client.game.activity
      .track({
        name: "voice_used",
        dialogId: props.dialogId,
        properties: {},
      })
      .catch(() => undefined);
    speech.start();
  }

  async function replay() {
    setPending(true);
    try {
      const dialog = await client.game.dialog.replay({
        dialogId: props.dialogId,
      });
      if (!dialog?.id) throw new Error("Повторный разговор не открыт");
      router.push(`/game/dialog/${dialog.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось повторить");
      setPending(false);
    }
  }

  function insertStarter(starter: (typeof CONVERSATION_STARTERS)[number]) {
    const text =
      starter === "Обратиться по имени"
        ? `${props.employee.name}, давайте обсудим задачу «${props.task.title}».`
        : starter === "Объяснить ожидаемый результат"
          ? `Ожидаемый результат: задача «${props.task.title}» должна быть выполнена качественно и в согласованный срок.`
          : "Расскажите, пожалуйста, как вы поняли задачу и что вам нужно для её выполнения?";
    setDraft((current) => (current ? `${current} ${text}` : text));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Progress
          aria-label="Прогресс разговора"
          value={conversationProgress}
          className="flex-1"
        />
        <span className="text-muted-foreground min-w-10 text-right text-sm">
          {conversationProgress}%
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className={stepClass(1)}>
          <Badge variant={conversationStep === 1 ? "secondary" : "outline"}>
            {conversationStep > 1 ? <IconCheck /> : "1"}
          </Badge>
          <span className="text-sm font-medium">Поставьте задачу</span>
        </div>
        <div className={stepClass(2)}>
          <Badge variant={conversationStep === 2 ? "secondary" : "outline"}>
            {conversationStep > 2 ? <IconCheck /> : "2"}
          </Badge>
          <span className="text-sm font-medium">Проверьте понимание</span>
        </div>
        <div className={stepClass(3)}>
          <Badge variant={conversationStep === 3 ? "secondary" : "outline"}>
            3
          </Badge>
          <span className="text-sm font-medium">
            Завершите и получите разбор
          </span>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                {pending ? <SteamWisps /> : null}
                <Avatar className="size-12">
                  <AvatarFallback>
                    {props.employee.name.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div>
                <CardTitle>{props.employee.name}</CardTitle>
                <CardDescription>{props.employee.role}</CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>
                <span className="relative mr-1 flex size-2">
                  <span className="bg-primary-foreground absolute inline-flex size-full animate-ping rounded-full opacity-75" />
                  <span className="bg-primary-foreground relative inline-flex size-2 rounded-full" />
                </span>
                В роли · ИИ
              </Badge>
              <Badge variant="outline">Раунд {props.shift.round}</Badge>
              {props.shift.soloOnShift ? (
                <Badge variant="accent">Один в смене</Badge>
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
          <Collapsible>
            <Alert>
              <IconBulb />
              <AlertTitle>Цель разговора</AlertTitle>
              <AlertDescription>
                Договоритесь о результате, сроке и способе контроля.
                <CollapsibleTrigger
                  render={<Button variant="ghost" size="sm" />}
                >
                  Подсказка
                  <IconChevronDown data-icon="inline-end" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  Для новой или сложной задачи сотруднику могут понадобиться
                  пошаговая инструкция, контрольные точки и проверка понимания.
                </CollapsibleContent>
              </AlertDescription>
            </Alert>
          </Collapsible>

          <ScrollArea className="h-[420px] rounded-lg border p-4">
            <div className="flex flex-col gap-4">
              {turns.length === 0 ? (
                <Empty className="border-0 py-16">
                  <EmptyHeader>
                    <EmptyMedia>
                      <ChefHatIllustration className="text-muted-foreground size-16" />
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
                      ? "bg-primary/10 ml-auto max-w-[92%] rounded-lg px-3 py-2 sm:max-w-[80%]"
                      : "bg-muted mr-auto max-w-[92%] rounded-lg px-3 py-2 sm:max-w-[80%]"
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
              {pending ? (
                <div
                  aria-live="polite"
                  className="bg-muted mr-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
                >
                  <IconLoader2 className="animate-spin" />
                  {props.employee.name} отвечает…
                </div>
              ) : null}
              <div ref={endRef} />
            </div>
          </ScrollArea>

          {notice ? (
            <Alert aria-live="polite">
              <IconAlertTriangle />
              <AlertTitle>Обратите внимание</AlertTitle>
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert aria-live="assertive" variant="destructive">
              <IconAlertTriangle />
              <AlertTitle>Не удалось продолжить разговор</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
              {failedDraft ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void send(failedDraft)}
                >
                  <IconRefresh data-icon="inline-start" />
                  Повторить отправку
                </Button>
              ) : null}
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
            <Alert>
              <IconCheck />
              <AlertTitle>Разговор завершён</AlertTitle>
              <AlertDescription>
                Ниже — ваш персональный разбор. Он также доступен ведущему игры.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                {CONVERSATION_STARTERS.map((starter) => (
                  <Button
                    key={starter}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => insertStarter(starter)}
                  >
                    {starter}
                  </Button>
                ))}
              </div>
              <Textarea
                aria-label="Сообщение сотруднику"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Что вы говорите сотруднику?"
                rows={3}
                disabled={pending}
                onKeyDown={(event) => {
                  if (
                    (event.ctrlKey || event.metaKey) &&
                    event.key === "Enter"
                  ) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
              <p className="text-muted-foreground text-xs">
                Черновик сохраняется автоматически в этом браузере.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => void send()}
                  disabled={pending || draft.trim() === ""}
                >
                  <IconSend data-icon="inline-start" />
                  Отправить
                </Button>

                {pending && requestController.current ? (
                  <Button type="button" variant="outline" onClick={cancelSend}>
                    <IconPlayerPause data-icon="inline-start" />
                    Остановить ответ
                  </Button>
                ) : null}

                {speech.supported ? (
                  <Button
                    type="button"
                    variant={speech.listening ? "destructive" : "outline"}
                    onClick={speech.listening ? speech.stop : startSpeech}
                  >
                    {speech.listening ? (
                      <IconPlayerStop data-icon="inline-start" />
                    ) : (
                      <IconMicrophone data-icon="inline-start" />
                    )}
                    {speech.listening
                      ? `Остановить · ${String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:${String(recordingSeconds % 60).padStart(2, "0")}`
                      : "Говорить"}
                  </Button>
                ) : (
                  <span className="text-muted-foreground self-center text-xs">
                    Голосовой ввод не поддерживается этим браузером — введите
                    текст
                  </span>
                )}

                <span className="text-muted-foreground mr-auto hidden text-xs sm:inline">
                  Ctrl + Enter — отправить
                </span>

                <Separator
                  orientation="vertical"
                  className="hidden h-8 sm:block"
                />

                <Button
                  type="button"
                  variant="secondary"
                  onClick={requestFinish}
                  disabled={pending || turns.length === 0}
                >
                  <IconCheck data-icon="inline-start" />
                  Завершить разговор
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {evaluation ? (
        <EvaluationCard
          evaluation={evaluation}
          variantId={props.variantId}
          pending={pending}
          onReplay={replay}
        />
      ) : null}

      <AlertDialog
        open={finishCheck !== null}
        onOpenChange={(open) => {
          if (!open) setFinishCheck(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              В разговоре не хватает договорённостей
            </AlertDialogTitle>
            <AlertDialogDescription>
              Перед завершением можно вернуться и закрыть ключевые пункты:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {finishCheck?.missingCritical.map((criterion) => (
              <li key={criterion.id}>{criterion.title}</li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Продолжить разговор</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setFinishCheck(null);
                void completeFinish();
              }}
            >
              Всё равно завершить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
