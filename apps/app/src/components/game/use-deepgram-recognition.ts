"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseDeepgramRecognitionResult {
  supported: boolean;
  recording: boolean;
  transcribing: boolean;
  error: string | null;
  /** Call on pointer/key down — begins capturing microphone audio. */
  pressStart(): void;
  /** Call on pointer/key up — stops capturing and sends the clip off for transcription. */
  pressEnd(): void;
  /** Stops capturing without transcribing, e.g. when the dialog ends mid-hold. */
  cancel(): void;
}

const CANDIDATE_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return CANDIDATE_MIME_TYPES.find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

/**
 * Push-to-talk voice capture, transcribed server-side via Deepgram.
 *
 * Replaces the browser's built-in SpeechRecognition, which routes audio
 * through Chrome's own (often blocked/region-restricted) speech servers and
 * isn't available at all outside Chromium browsers.
 */
export function useDeepgramRecognition(options: {
  dialogId: string;
  onFinal: (text: string) => void;
}): UseDeepgramRecognitionResult {
  const { dialogId, onFinal } = options;

  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const heldRef = useRef(false);
  const mountedRef = useRef(false);
  const startingRef = useRef(false);
  const skipNextRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const releaseStream = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    setSupported(
      typeof window !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== "undefined",
    );

    return () => {
      mountedRef.current = false;
      heldRef.current = false;
      startingRef.current = false;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.stop();
      }
      recorderRef.current = null;
      releaseStream();
    };
  }, [releaseStream]);

  const transcribe = useCallback(
    async (blob: Blob) => {
      setTranscribing(true);
      setError(null);
      try {
        const form = new FormData();
        form.append("audio", blob, "utterance.webm");
        const response = await fetch(
          `/api/game/dialog/transcribe?dialogId=${encodeURIComponent(dialogId)}`,
          {
            method: "POST",
            body: form,
          },
        );
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(
            body?.error ?? `Ошибка распознавания: ${response.status}`,
          );
        }
        const data = (await response.json()) as { text: string };
        if (data.text) onFinalRef.current(data.text);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Не удалось распознать речь",
        );
      } finally {
        setTranscribing(false);
      }
    },
    [dialogId],
  );

  const pressStart = useCallback(() => {
    if (!supported || recorderRef.current || startingRef.current) return;
    startingRef.current = true;
    setError(null);
    heldRef.current = true;
    chunksRef.current = [];

    void (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        startingRef.current = false;
        if (mountedRef.current) setError("Нет доступа к микрофону");
        return;
      }

      // The button may already have been released while we were waiting on
      // the permission prompt — don't start recording in that case.
      if (!heldRef.current || !mountedRef.current) {
        for (const track of stream.getTracks()) track.stop();
        startingRef.current = false;
        return;
      }

      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        releaseStream();
        recorderRef.current = null;
        setRecording(false);
        const chunks = chunksRef.current;
        chunksRef.current = [];

        if (skipNextRef.current) {
          skipNextRef.current = false;
          return;
        }
        const blob = new Blob(chunks, {
          type: recorder.mimeType || "audio/webm",
        });
        // Too short to contain speech — a stray tap, not an utterance.
        if (blob.size < 1000) return;
        void transcribe(blob);
      };

      recorderRef.current = recorder;
      recorder.start();
      startingRef.current = false;
      setRecording(true);
    })();
  }, [releaseStream, supported, transcribe]);

  const pressEnd = useCallback(() => {
    heldRef.current = false;
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    heldRef.current = false;
    if (recorderRef.current?.state === "recording") {
      skipNextRef.current = true;
      recorderRef.current.stop();
    } else {
      skipNextRef.current = false;
      releaseStream();
    }
  }, [releaseStream]);

  return {
    supported,
    recording,
    transcribing,
    error,
    pressStart,
    pressEnd,
    cancel,
  };
}
