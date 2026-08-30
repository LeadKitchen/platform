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
  IconLoader2,
  IconMessageCircle,
  IconMicrophone,
  IconPlayerPlay,
  IconPlayerStop,
  IconSend,
  IconSparkles,
  IconVideo,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { employeeAvatarUri, userAvatarUri } from "~/lib/avatar";
import { client } from "~/orpc/react";
import { useSpeechRecognition } from "./use-speech-recognition";
import { useSpeechSynthesis } from "./use-speech-synthesis";

interface VoiceTurn {
  role: "manager" | "employee";
  text: string;
  at: string;
}

export interface VoiceDialogRoomProps {
  dialogId: string;
  employee: { name: string; role: string };
  task: { title: string };
  shift: { round: number; activeOrders: number; soloOnShift: boolean };
  initialTurns: Array<{ role: "manager" | "employee"; text: string }>;
  initialFinished: boolean;
  userAvatarSeed?: string;
  uploadedAvatarUrl?: string;
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
  const [micMuted, setMicMuted] = useState(false);
  const [transcriptVisible, setTranscriptVisible] = useState(true);
  const [selfViewVisible, setSelfViewVisible] = useState(true);
  const [duration, setDuration] = useState(0);
  const [fallbackDraft, setFallbackDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [endDialog, setEndDialog] = useState<EndDialog>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const employeeAvatar = employeeAvatarUri(props.employee.name);
  const managerAvatar =
    props.uploadedAvatarUrl ?? userAvatarUri(props.userAvatarSeed ?? "manager");

  const speech = useSpeechRecognition({
    onFinal: (text) => void sendVoice(text),
  });
  const voice = useSpeechSynthesis();
  const latestActivity = `${turns.length}:${pending}:${speech.interim}`;

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

  useEffect(() => {
    if (
      phase !== "active" ||
      micMuted ||
      pending ||
      voice.speaking ||
      speech.listening ||
      speech.error ||
      !speech.supported
    ) {
      return;
    }
    const timer = window.setTimeout(speech.start, 350);
    return () => window.clearTimeout(timer);
  }, [
    micMuted,
    pending,
    phase,
    speech.error,
    speech.listening,
    speech.start,
    speech.supported,
    voice.speaking,
  ]);

  useEffect(() => {
    if (phase !== "active") return;
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (event.key.toLowerCase() === "m") {
        setMicMuted((current) => !current);
      }
      if (event.key.toLowerCase() === "t") {
        setTranscriptVisible((current) => !current);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase]);

  useEffect(() => {
    if (phase !== "active") return;
    if (micMuted) speech.stop();
  }, [micMuted, phase, speech.stop]);

  function startCall() {
    setPhase("active");
    setError(null);
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
    } else {
      speech.start();
    }
  }

  async function sendVoice(rawText: string) {
    const text = rawText.trim();
    if (!text || pending || phase !== "active") return;

    speech.stop();
    setPending(true);
    setError(null);
    setNotice(null);
    setFallbackDraft("");
    setTurns((current) => [
      ...current,
      { role: "manager", text, at: nowLabel() },
    ]);

    try {
      const result = await client.game.dialog.say({
        dialogId: props.dialogId,
        text,
      });
      if (result.silent) {
        setNotice(
          `${props.employee.name} ждёт прямого обращения. Назовите сотрудника по имени и повторите мысль.`,
        );
      } else {
        setTurns((current) => [
          ...current,
          { role: "employee", text: result.reply, at: nowLabel() },
        ]);
        voice.speak(result.reply);
      }
      if (result.managerToxic) {
        setNotice(
          "Реплика распознана как грубая — это повлияет на итоговую оценку.",
        );
      }
    } catch (cause) {
      setFallbackDraft(text);
      setError(
        cause instanceof Error ? cause.message : "Не удалось получить ответ",
      );
    } finally {
      setPending(false);
    }
  }

  async function requestFinish() {
    setEndDialog(null);
    setPending(true);
    setError(null);
    speech.stop();
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
    speech.stop();
    voice.stop();
    try {
      await client.game.dialog.finish({ dialogId: props.dialogId });
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

  function toggleMic() {
    setMicMuted((current) => {
      const next = !current;
      if (next) speech.stop();
      else speech.start();
      return next;
    });
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
                <Badge variant="outline">AI Roleplay</Badge>
              </div>
            </div>
          </div>
          <Alert>
            <IconMicrophone />
            <AlertTitle>
              {speech.supported ? "Микрофон готов" : "Нужен Chrome или Edge"}
            </AlertTitle>
            <AlertDescription>
              {speech.supported
                ? "После старта говорите естественно. Законченная фраза автоматически появится в транскрипте и уйдёт персонажу."
                : "В этом браузере голосовое распознавание недоступно. В комнате останется текстовый резервный ввод."}
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
              <p className="text-sm font-semibold">AI Roleplay</p>
              <p className="text-muted-foreground text-xs">
                {props.employee.name} · {props.task.title}
              </p>
            </div>
          </div>
          <Badge variant="outline">
            <IconActivity />
            Сигнал: {speech.error ? "нужна проверка" : "отличный"}
          </Badge>
          <Button
            size="icon"
            variant={micMuted ? "destructive" : "outline"}
            aria-label={micMuted ? "Включить микрофон" : "Выключить микрофон"}
            onClick={toggleMic}
          >
            <IconMicrophone />
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
          "grid min-h-0 flex-1 gap-4",
          transcriptVisible
            ? "lg:grid-cols-[360px_minmax(0,1fr)]"
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
              <ScrollArea className="h-[calc(100vh-15.5rem)] min-h-[420px] px-4 py-4">
                <div className="flex flex-col gap-4">
                  {turns.map((turn, index) => (
                    <div
                      // biome-ignore lint/suspicious/noArrayIndexKey: Реплики только добавляются в конец.
                      key={`${turn.role}-${index}`}
                      className={cn(
                        "flex max-w-[92%] flex-col gap-1 rounded-xl px-3 py-2",
                        turn.role === "manager"
                          ? "bg-primary/10 ml-auto"
                          : "bg-muted mr-auto",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="size-5">
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
                        <span className="text-muted-foreground text-xs">
                          {turn.role === "manager" ? "Вы" : props.employee.name}
                        </span>
                        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                          {turn.at}
                        </span>
                      </div>
                      <p className="text-sm leading-6 whitespace-pre-wrap">
                        {turn.text}
                      </p>
                    </div>
                  ))}
                  {speech.interim ? (
                    <div className="bg-primary/5 ml-auto max-w-[92%] rounded-xl border border-dashed px-3 py-2">
                      <p className="text-muted-foreground text-sm italic">
                        {speech.interim}…
                      </p>
                    </div>
                  ) : null}
                  {pending ? (
                    <div className="bg-muted mr-auto flex items-center gap-2 rounded-xl px-3 py-2 text-sm">
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
                  : voice.speaking
                    ? "Слушайте ответ персонажа"
                    : micMuted
                      ? "Микрофон выключен"
                      : speech.listening
                        ? "Говорите — фраза отправится автоматически"
                        : "Подключаем микрофон…"}
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
                    variant={micMuted ? "destructive" : "secondary"}
                    aria-label={
                      micMuted ? "Включить микрофон" : "Выключить микрофон"
                    }
                    onClick={toggleMic}
                  >
                    <IconMicrophone />
                  </Button>
                  <Button
                    size="icon"
                    variant={voice.enabled ? "secondary" : "outline"}
                    aria-label={
                      voice.enabled
                        ? "Выключить голос персонажа"
                        : "Включить голос персонажа"
                    }
                    disabled={!voice.supported}
                    onClick={() => voice.setEnabled(!voice.enabled)}
                  >
                    <IconMessageCircle />
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
                  M — микрофон · T — транскрипт
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

      {!speech.supported || speech.error || fallbackDraft ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Текстовый резервный ввод
            </CardTitle>
            <CardDescription>
              Используйте его, если браузер не распознаёт микрофон.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Textarea
              aria-label="Реплика персонажу"
              value={fallbackDraft}
              rows={2}
              disabled={pending}
              onChange={(event) => setFallbackDraft(event.target.value)}
            />
            <Button
              aria-label="Отправить реплику"
              disabled={pending || !fallbackDraft.trim()}
              onClick={() => void sendVoice(fallbackDraft)}
            >
              <IconSend />
            </Button>
          </CardContent>
        </Card>
      ) : null}

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
    </div>
  );
}
