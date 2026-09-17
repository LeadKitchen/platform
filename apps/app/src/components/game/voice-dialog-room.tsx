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
  AvatarImage,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ScrollArea,
  Separator,
  Textarea,
} from "@acme/ui";
import {
  IconActivity,
  IconAlertTriangle,
  IconArrowLeft,
  IconCheck,
  IconClock,
  IconInfoCircle,
  IconLoader2,
  IconMessageCircle,
  IconMicrophone,
  IconMicrophoneOff,
  IconPlayerPlay,
  IconPlayerStop,
  IconSend,
  IconSettings,
  IconSparkles,
  IconVideo,
  IconVolume2,
  IconVolumeOff,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { employeeAvatarUri, userAvatarUri } from "~/lib/avatar";
import { client } from "~/orpc/react";
import { useSpeechSynthesis } from "./use-speech-synthesis";
import { useVoiceActivityRecognition } from "./use-voice-activity-recognition";

interface VoiceTurn {
  role: "manager" | "employee";
  text: string;
  at: string;
  /** Set only for admin/QA callers — lets the hint button fetch the LLM prompt. */
  promptEventId?: string;
}

interface PromptDebugData {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  model?: string;
}

export interface VoiceDialogRoomProps {
  dialogId: string;
  employee: {
    id: string;
    name: string;
    role: string;
    gender: "male" | "female";
  };
  task: { title: string };
  shift: { round: number; activeOrders: number; soloOnShift: boolean };
  initialTurns: Array<{
    role: "manager" | "employee";
    text: string;
    promptEventId?: string;
  }>;
  initialFinished: boolean;
  variantId: string;
  variantName: string;
  userAvatarSeed?: string;
  uploadedAvatarUrl?: string;
  /** Admin/QA only: shows hints linking to where this character/AI variant is configured. */
  isAdmin?: boolean;
}

type EndDialog =
  | { kind: "confirm" }
  | {
      kind: "missing";
      missingCritical: Array<{ id: string; title: string; met: boolean }>;
    }
  | null;

function nowLabel() {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function durationLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function VoiceDialogRoom(props: VoiceDialogRoomProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<"lobby" | "active" | "finished">(
    props.initialFinished ? "finished" : "lobby",
  );
  const [turns, setTurns] = useState<VoiceTurn[]>(() =>
    props.initialTurns.map((turn) => ({ ...turn, at: "Ранее" })),
  );
  const [pending, setPending] = useState(false);
  const [transcriptVisible, setTranscriptVisible] = useState(true);
  const [selfViewVisible, setSelfViewVisible] = useState(true);
  const [duration, setDuration] = useState(0);
  const [textDraft, setTextDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [endDialog, setEndDialog] = useState<EndDialog>(null);
  const [promptDialogEventId, setPromptDialogEventId] = useState<
    string | null
  >(null);
  const [promptData, setPromptData] = useState<PromptDebugData | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const promptCache = useRef<Map<string, PromptDebugData>>(new Map());
  const promptRequestId = useRef(0);
  const activePromptRequest = useRef<{
    eventId: string;
    requestId: number;
  } | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const employeeAvatar = employeeAvatarUri(props.employee.name);
  const managerAvatar =
    props.uploadedAvatarUrl ?? userAvatarUri(props.userAvatarSeed ?? "manager");

  const speech = useVoiceActivityRecognition({
    dialogId: props.dialogId,
    onFinal: (text) => void sendVoice(text),
  });
  const voice = useSpeechSynthesis({
    dialogId: props.dialogId,
    gender: props.employee.gender,
  });
  const latestActivity = `${turns.length}:${pending}:${speech.transcribing}`;

  useEffect(() => {
    if (phase !== "active") return;
    const timer = window.setInterval(
      () => setDuration((current) => current + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (latestActivity) {
      transcriptEndRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [latestActivity]);

  // The mic keeps listening continuously — pause voice-activity detection
  // while the character is talking or a reply is in flight, so the app never
  // tries to transcribe over itself.
  useEffect(() => {
    speech.setPaused(pending || voice.speaking);
  }, [pending, voice.speaking, speech.setPaused]);

  useEffect(() => {
    if (phase !== "active") return;
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (event.key.toLowerCase() === "t") {
        setTranscriptVisible((current) => !current);
      }
      if (event.key.toLowerCase() === "m" && !event.repeat) {
        speech.setMuted(!speech.muted);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, speech.setMuted, speech.muted]);

  function startCall() {
    setPhase("active");
    setError(null);
    speech.start();
    void client.game.activity
      .track({
        name: "voice_used",
        dialogId: props.dialogId,
        properties: {},
      })
      .catch(() => undefined);

    if (turns.length === 0) {
      const greeting = `Здравствуйте. Я ${props.employee.name}. Слушаю вас.`;
      setTurns([{ role: "employee", text: greeting, at: nowLabel() }]);
      voice.speak(greeting);
    }
  }

  async function sendVoice(rawText: string) {
    const text = rawText.trim();
    if (!text || pending || phase !== "active") return;

    setPending(true);
    setError(null);
    setNotice(null);
    setTextDraft("");
    setTurns((current) => [
      ...current,
      { role: "manager", text, at: nowLabel() },
    ]);

    // Tracks whether an employee turn has already been appended for this
    // reply, so later chunks (and the final "done" event) replace it in
    // place instead of appending duplicates — mirrors dialog-room.tsx.
    let employeeTurnStarted = false;

    try {
      const stream = await client.game.dialog.sayStream({
        dialogId: props.dialogId,
        text,
      });

      for await (const event of stream) {
        if (event.type === "chunk") {
          employeeTurnStarted = true;
          setTurns((current) => {
            const last = current.at(-1);
            if (last?.role === "employee") {
              return [...current.slice(0, -1), { ...last, text: event.reply }];
            }
            return [
              ...current,
              { role: "employee", text: event.reply, at: nowLabel() },
            ];
          });
          continue;
        }

        if (event.silent) {
          setNotice(
            `${props.employee.name} не отреагировал на реплику. Попробуйте переформулировать мысль.`,
          );
        } else {
          setTurns((current) => {
            const last = current.at(-1);
            const finalTurn: VoiceTurn = {
              role: "employee",
              text: event.reply,
              at: nowLabel(),
              promptEventId: event.promptEventId,
            };
            if (employeeTurnStarted && last?.role === "employee") {
              return [...current.slice(0, -1), finalTurn];
            }
            return [...current, finalTurn];
          });
          voice.speak(event.reply);
        }
        if (event.managerToxic) {
          setNotice(
            "Реплика распознана как грубая — это повлияет на итоговую оценку.",
          );
        }
      }
    } catch (cause) {
      try {
        const current = await client.game.dialog.byId({
          dialogId: props.dialogId,
        });
        setTurns(current.turns.map((turn) => ({ ...turn, at: "Ранее" })));
      } catch {
        if (employeeTurnStarted) {
          setTurns((current) =>
            current.at(-1)?.role === "employee"
              ? current.slice(0, -1)
              : current,
          );
        }
        setTextDraft(text);
      }
      setError(
        cause instanceof Error ? cause.message : "Не удалось получить ответ",
      );
    } finally {
      setPending(false);
    }
  }

  async function openPromptDebug(eventId: string) {
    const request = { eventId, requestId: ++promptRequestId.current };
    activePromptRequest.current = request;
    setPromptDialogEventId(eventId);
    const cached = promptCache.current.get(eventId);
    if (cached) {
      setPromptData(cached);
      setPromptError(null);
      setPromptLoading(false);
      return;
    }
    setPromptData(null);
    setPromptError(null);
    setPromptLoading(true);
    try {
      const result = await client.game.dialog.promptDebug({
        dialogId: props.dialogId,
        eventId,
      });
      promptCache.current.set(eventId, result);
      if (activePromptRequest.current === request) {
        setPromptData(result);
      }
    } catch (cause) {
      if (activePromptRequest.current === request) {
        setPromptError(
          cause instanceof Error ? cause.message : "Не удалось получить промпт",
        );
      }
    } finally {
      if (activePromptRequest.current === request) {
        setPromptLoading(false);
      }
    }
  }

  async function requestFinish() {
    setEndDialog(null);
    setPending(true);
    setError(null);
    // Leave the mic listening — `pending` already pauses voice-activity
    // detection, and closing it here would strand the manager without voice
    // input if the check comes back not-ready and the conversation continues.
    voice.stop();
    try {
      const check = await client.game.dialog.preflight({
        dialogId: props.dialogId,
      });
      if (check.ready) {
        await completeFinish();
        return;
      }
      setEndDialog({
        kind: "missing",
        missingCritical: check.missingCritical,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось проверить разговор",
      );
    } finally {
      setPending(false);
    }
  }

  async function completeFinish() {
    setEndDialog(null);
    setPending(true);
    setError(null);
    voice.stop();
    try {
      await client.game.dialog.finish({ dialogId: props.dialogId });
      // Only close the mic once the dialog has actually ended — closing it
      // eagerly would leave the manager without voice input if this call
      // fails and the conversation continues.
      speech.stop();
      setPhase("finished");
      router.push(`/game/dialog/${props.dialogId}/report`);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось завершить разговор",
      );
      setPending(false);
    }
  }

  if (phase === "lobby") {
    return (
      <Card className="mx-auto w-full max-w-3xl">
        <CardHeader className="items-center text-center">
          <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-2xl">
            <IconSparkles className="size-7" />
          </div>
          <CardTitle>Начать голосовую тренировку</CardTitle>
          <CardDescription>
            Проверьте персонажа и разрешите браузеру доступ к микрофону после
            запуска.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-center gap-3 rounded-xl border p-4">
            <Avatar className="size-14">
              <AvatarImage src={employeeAvatar} alt={props.employee.name} />
              <AvatarFallback>
                {props.employee.name.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{props.employee.name}</p>
              <p className="text-muted-foreground text-sm">
                {props.employee.role}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="outline">Раунд {props.shift.round}</Badge>
                <Badge variant="outline">ИИ: {props.variantName}</Badge>
                <Badge variant="outline">Ролевой диалог с ИИ</Badge>
              </div>
            </div>
          </div>
          <Alert>
            <IconMicrophone />
            <AlertTitle>
              {speech.supported ? "Микрофон готов" : "Микрофон недоступен"}
            </AlertTitle>
            <AlertDescription>
              {speech.supported
                ? "Микрофон включится сам, как только начнётся разговор — просто говорите, реплика уйдёт персонажу без нажатия кнопок."
                : "Этот браузер не поддерживает запись с микрофона. В комнате останется текстовый резервный ввод."}
            </AlertDescription>
          </Alert>
          <div className="rounded-xl border p-4">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Ситуация
            </p>
            <p className="mt-2 text-sm font-medium">{props.task.title}</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => router.push("/game/roleplay")}
            >
              <IconArrowLeft data-icon="inline-start" />
              Назад к сценариям
            </Button>
            <Button onClick={startCall}>
              <IconPlayerPlay data-icon="inline-start" />
              Начать разговор
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (phase === "finished") {
    return (
      <Card className="mx-auto w-full max-w-xl">
        <CardHeader className="items-center text-center">
          <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
            <IconCheck className="size-6" />
          </div>
          <CardTitle>Тренировка завершена</CardTitle>
          <CardDescription>
            Откройте отчёт с оценкой разговора и рекомендациями.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button
            onClick={() => router.push(`/game/dialog/${props.dialogId}/report`)}
          >
            Открыть отчёт
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-7.5rem)] flex-col gap-4">
      <Card className="py-3">
        <CardContent className="flex flex-wrap items-center gap-2 px-4">
          <div className="mr-auto flex items-center gap-3">
            <div className="bg-primary flex size-9 items-center justify-center rounded-xl text-primary-foreground">
              <IconSparkles />
            </div>
            <div>
              <p className="text-sm font-semibold">Ролевой диалог с ИИ</p>
              <p className="text-muted-foreground text-xs">
                {props.employee.name} · {props.task.title}
              </p>
            </div>
          </div>
          <Badge variant="outline">ИИ: {props.variantName}</Badge>
          <Badge variant="outline">
            <IconActivity />
            {speech.error
              ? "Сигнал: нужна проверка"
              : speech.recording
                ? "Слушаю вас…"
                : speech.muted
                  ? "Микрофон выключен"
                  : "Сигнал: отличный"}
          </Badge>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant={speech.muted ? "destructive" : "outline"}
              aria-label={
                speech.muted ? "Включить микрофон" : "Выключить микрофон"
              }
              disabled={!speech.supported}
              onClick={() => speech.setMuted(!speech.muted)}
            >
              {speech.muted ? <IconMicrophoneOff /> : <IconMicrophone />}
            </Button>
            <Button
              size="icon"
              variant={transcriptVisible ? "secondary" : "outline"}
              aria-label={
                transcriptVisible ? "Скрыть транскрипт" : "Показать транскрипт"
              }
              onClick={() => setTranscriptVisible((current) => !current)}
            >
              <IconMessageCircle />
            </Button>
            <Button
              size="icon"
              variant={selfViewVisible ? "secondary" : "outline"}
              aria-label={
                selfViewVisible ? "Скрыть свой экран" : "Показать свой экран"
              }
              onClick={() => setSelfViewVisible((current) => !current)}
            >
              <IconVideo />
            </Button>
          </div>
          <Separator orientation="vertical" className="h-6" />
          <Button
            size="icon"
            variant="destructive"
            aria-label="Завершить разговор"
            disabled={pending}
            onClick={() => setEndDialog({ kind: "confirm" })}
          >
            <IconPlayerStop />
          </Button>
        </CardContent>
      </Card>

      <div
        className={cn(
          "grid min-h-0 gap-4 lg:flex-1",
          transcriptVisible
            ? "lg:grid-cols-[minmax(380px,1.4fr)_minmax(320px,1fr)]"
            : "grid-cols-1",
        )}
      >
        {transcriptVisible ? (
          <Card className="min-h-0 gap-0 overflow-hidden py-0">
            <CardHeader className="border-b py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Транскрипция</CardTitle>
                  <CardDescription>Разговор в реальном времени</CardDescription>
                </div>
                <Badge variant="outline">
                  <IconClock />
                  {durationLabel(duration)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col p-0">
              <ScrollArea className="min-h-[420px] flex-1 px-5 py-5">
                <div className="mx-auto flex max-w-[640px] flex-col gap-5">
                  {turns.map((turn, index) => (
                    <div
                      // biome-ignore lint/suspicious/noArrayIndexKey: Реплики только добавляются в конец.
                      key={`${turn.role}-${index}`}
                      className={cn(
                        "flex max-w-[85%] flex-col gap-1.5 rounded-2xl px-4 py-3",
                        turn.role === "manager"
                          ? "bg-primary/10 ml-auto"
                          : "bg-muted mr-auto",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="size-6">
                          <AvatarImage
                            src={
                              turn.role === "manager"
                                ? managerAvatar
                                : employeeAvatar
                            }
                            alt={
                              turn.role === "manager"
                                ? "Вы"
                                : props.employee.name
                            }
                          />
                          <AvatarFallback>
                            {turn.role === "manager"
                              ? "ВЫ"
                              : props.employee.name.slice(0, 1).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">
                          {turn.role === "manager" ? "Вы" : props.employee.name}
                        </span>
                        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                          {turn.at}
                        </span>
                        {props.isAdmin && turn.promptEventId ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-6"
                            aria-label="Показать промпт, отправленный в LLM"
                            onClick={() =>
                              void openPromptDebug(turn.promptEventId ?? "")
                            }
                          >
                            <IconInfoCircle className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                      <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
                        {turn.text}
                      </p>
                    </div>
                  ))}
                  {speech.transcribing ? (
                    <div className="bg-primary/5 ml-auto flex max-w-[85%] items-center gap-2 rounded-2xl border border-dashed px-4 py-3">
                      <IconLoader2 className="animate-spin" />
                      <p className="text-muted-foreground text-sm italic">
                        Распознаём реплику…
                      </p>
                    </div>
                  ) : null}
                  {pending ? (
                    <div className="bg-muted mr-auto flex items-center gap-2 rounded-2xl px-4 py-3 text-sm">
                      <IconLoader2 className="animate-spin" />
                      {props.employee.name} формулирует ответ…
                    </div>
                  ) : null}
                  <div ref={transcriptEndRef} />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid min-h-0 gap-4 lg:grid-rows-[minmax(300px,1fr)_minmax(220px,0.7fr)]">
          <Card className="min-h-0 overflow-hidden">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{props.employee.name}</CardTitle>
                  <CardDescription>{props.employee.role}</CardDescription>
                </div>
                <Badge>
                  {pending ? "Думает" : voice.speaking ? "Говорит" : "На связи"}
                </Badge>
              </div>
              {props.isAdmin ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 text-xs">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <IconSettings className="size-3.5" />
                    Админ: где поменять поведение
                  </span>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    render={
                      <Link
                        href={`/admin/game/employees?employeeId=${encodeURIComponent(props.employee.id)}`}
                      />
                    }
                    nativeButton={false}
                  >
                    Профиль сотрудника
                  </Button>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    render={
                      <Link
                        href={`/admin/game/variants?variantId=${encodeURIComponent(props.variantId)}`}
                      />
                    }
                    nativeButton={false}
                  >
                    ИИ-вариант «{props.variantName}»
                  </Button>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    render={<Link href="/admin/game/settings" />}
                    nativeButton={false}
                  >
                    Настройки игры
                  </Button>
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="flex min-h-[220px] flex-1 flex-col items-center justify-center gap-5">
              <div className="relative">
                {voice.speaking || pending ? (
                  <span className="bg-primary/20 absolute -inset-4 animate-pulse rounded-full" />
                ) : null}
                <Avatar className="relative size-28 border-4 border-background shadow-lg">
                  <AvatarImage src={employeeAvatar} alt={props.employee.name} />
                  <AvatarFallback>
                    {props.employee.name.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="flex h-8 items-center gap-1" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5, 6].map((bar) => (
                  <span
                    key={bar}
                    className={cn(
                      "bg-primary w-1 rounded-full transition-all",
                      voice.speaking || pending ? "animate-pulse" : "h-1",
                      bar % 3 === 0 ? "h-7" : bar % 2 === 0 ? "h-4" : "h-5",
                    )}
                  />
                ))}
              </div>
              <p className="text-muted-foreground text-center text-sm">
                {pending
                  ? "AI анализирует вашу реплику"
                  : speech.transcribing
                    ? "Распознаём вашу реплику…"
                    : voice.speaking
                      ? "Слушайте ответ персонажа"
                      : speech.muted
                        ? "Микрофон выключен — включите, чтобы говорить"
                        : speech.recording
                          ? "Слушаю вас — договорите и сделайте паузу"
                          : "Говорите в любой момент, микрофон уже слушает"}
              </p>
            </CardContent>
          </Card>

          {selfViewVisible ? (
            <Card className="overflow-hidden">
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">Вы</CardTitle>
                  <Badge variant="outline">
                    <IconClock />
                    {durationLabel(duration)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex min-h-[150px] flex-col items-center justify-center gap-3">
                <Avatar className="size-20">
                  <AvatarImage src={managerAvatar} alt="Вы" />
                  <AvatarFallback>ВЫ</AvatarFallback>
                </Avatar>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    size="icon"
                    variant={speech.muted ? "destructive" : "secondary"}
                    aria-label={
                      speech.muted ? "Включить микрофон" : "Выключить микрофон"
                    }
                    disabled={!speech.supported}
                    onClick={() => speech.setMuted(!speech.muted)}
                  >
                    {speech.muted ? <IconMicrophoneOff /> : <IconMicrophone />}
                  </Button>
                  <Button
                    size="icon"
                    variant={voice.enabled ? "secondary" : "destructive"}
                    aria-pressed={voice.enabled}
                    aria-label={
                      voice.enabled
                        ? "Выключить озвучку ответов"
                        : "Включить озвучку ответов"
                    }
                    disabled={!voice.supported}
                    onClick={() => voice.setEnabled(!voice.enabled)}
                  >
                    {voice.enabled ? <IconVolume2 /> : <IconVolumeOff />}
                  </Button>
                  <Button
                    size="icon"
                    variant="destructive"
                    aria-label="Завершить разговор"
                    onClick={() => setEndDialog({ kind: "confirm" })}
                  >
                    <IconPlayerStop />
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  Говорите свободно · M — выключить микрофон · T — транскрипт
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {notice ? (
        <Alert>
          <IconAlertTriangle />
          <AlertTitle>Обратите внимание</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {error || speech.error ? (
        <Alert variant="destructive">
          <IconAlertTriangle />
          <AlertTitle>Голосовой разговор прерван</AlertTitle>
          <AlertDescription>{error ?? speech.error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Написать текстом</CardTitle>
          <CardDescription>
            Можно печатать реплики вместо голоса в любой момент разговора.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Textarea
            aria-label="Реплика персонажу"
            value={textDraft}
            rows={2}
            disabled={pending}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (textDraft.trim()) void sendVoice(textDraft);
              }
            }}
            onChange={(event) => setTextDraft(event.target.value)}
          />
          <Button
            aria-label="Отправить реплику"
            disabled={pending || !textDraft.trim()}
            onClick={() => void sendVoice(textDraft)}
          >
            <IconSend />
          </Button>
        </CardContent>
      </Card>

      <AlertDialog
        open={endDialog !== null}
        onOpenChange={(open) => {
          if (!open) setEndDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {endDialog?.kind === "missing"
                ? "В разговоре не хватает договорённостей"
                : "Завершить голосовую тренировку?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {endDialog?.kind === "missing"
                ? "Можно вернуться в разговор и закрыть ключевые пункты:"
                : "AI остановит разговор и подготовит персональный отчёт."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {endDialog?.kind === "missing" ? (
            <>
              <Separator />
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                {endDialog.missingCritical.map((criterion) => (
                  <li key={criterion.id}>{criterion.title}</li>
                ))}
              </ul>
            </>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Продолжить разговор</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void (endDialog?.kind === "missing"
                  ? completeFinish()
                  : requestFinish())
              }
            >
              {endDialog?.kind === "missing"
                ? "Всё равно завершить"
                : "Завершить и оценить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={promptDialogEventId !== null}
        onOpenChange={(open) => {
          if (!open) {
            activePromptRequest.current = null;
            setPromptDialogEventId(null);
            setPromptLoading(false);
          }
        }}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Промпт, отправленный в LLM</DialogTitle>
            <DialogDescription>
              {promptData?.model
                ? `Модель: ${promptData.model}`
                : "Системный промпт и история диалога, из которых сгенерирована эта реплика."}
            </DialogDescription>
          </DialogHeader>

          {promptLoading ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <IconLoader2 className="size-4 animate-spin" />
              Загрузка…
            </p>
          ) : promptError ? (
            <Alert variant="destructive">
              <IconAlertTriangle />
              <AlertTitle>Не удалось получить промпт</AlertTitle>
              <AlertDescription>{promptError}</AlertDescription>
            </Alert>
          ) : promptData ? (
            <div className="flex flex-col gap-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wide">
                  System
                </p>
                <pre className="bg-muted overflow-x-auto rounded-md border p-3 text-xs whitespace-pre-wrap">
                  {promptData.system}
                </pre>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Messages
                </p>
                {promptData.messages.map((message, index) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: Список сообщений статичен и не переупорядочивается.
                    key={`${index}-${message.role}`}
                    className="rounded-md border p-3"
                  >
                    <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">
                      {message.role}
                    </p>
                    <p className="text-xs whitespace-pre-wrap">
                      {message.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
