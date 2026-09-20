"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { employeeAvatarUri, userAvatarUri } from "~/lib/avatar";
import { client } from "~/orpc/react";
import { useSpeechSynthesis } from "./use-speech-synthesis";
import { useVoiceActivityRecognition } from "./use-voice-activity-recognition";
import type {
  EndDialog,
  PromptDebugData,
  VoiceDialogRoomProps,
  VoiceTurn,
} from "./voice-dialog-room-types";
import { nowLabel } from "./voice-dialog-room-utils";

export function useVoiceDialogRoom(props: VoiceDialogRoomProps) {
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
  const [promptDialogEventId, setPromptDialogEventId] = useState<string | null>(
    null,
  );
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

  function closePromptDebug() {
    activePromptRequest.current = null;
    setPromptDialogEventId(null);
    setPromptLoading(false);
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

  return {
    phase,
    turns,
    pending,
    transcriptVisible,
    setTranscriptVisible,
    selfViewVisible,
    setSelfViewVisible,
    duration,
    textDraft,
    setTextDraft,
    error,
    notice,
    endDialog,
    setEndDialog,
    promptDialogEventId,
    promptData,
    promptLoading,
    promptError,
    transcriptEndRef,
    employeeAvatar,
    managerAvatar,
    speech,
    voice,
    startCall,
    sendVoice,
    openPromptDebug,
    closePromptDebug,
    requestFinish,
    completeFinish,
  };
}

export type VoiceDialogRoomState = ReturnType<typeof useVoiceDialogRoom>;
