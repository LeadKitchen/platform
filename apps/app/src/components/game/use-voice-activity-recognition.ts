"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

const transcribeResponseSchema = z.object({ text: z.string() });

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

/** RMS amplitude above which the mic is considered to carry speech. */
const SPEECH_RMS_THRESHOLD = 0.02;
/**
 * How long amplitude must stay high before an utterance is confirmed as
 * speech rather than a click/tap. Recording starts immediately on the first
 * loud sample (so the onset of speech isn't lost) and is discarded if
 * amplitude drops back down before this much time has passed.
 */
const SPEECH_START_MS = 150;
/** How long trailing silence must last before an utterance is considered finished. */
const SILENCE_END_MS = 900;
/** Safety cutoff so a stuck-open mic (e.g. background noise) can't record forever. */
const MAX_UTTERANCE_MS = 20_000;
const MIN_UTTERANCE_BYTES = 1000;

export interface UseVoiceActivityRecognitionResult {
  supported: boolean;
  /** Mic stream is open and continuously being monitored for speech. */
  listening: boolean;
  /** Currently capturing an utterance because speech was detected. */
  recording: boolean;
  transcribing: boolean;
  error: string | null;
  muted: boolean;
  setMuted(muted: boolean): void;
  /** Call whenever the assistant is speaking or a reply is pending, so the mic doesn't record over it. */
  setPaused(paused: boolean): void;
  /** Opens the mic and starts continuous hands-free listening. */
  start(): void;
  /** Closes the mic — call when the call ends. */
  stop(): void;
}

/**
 * Hands-free voice capture: no push-to-talk button, just talk.
 *
 * Keeps the microphone stream open for the whole call and uses a simple
 * volume-based voice-activity detector (Web Audio `AnalyserNode`, no extra
 * dependency) to find utterance boundaries — recording starts as soon as
 * amplitude crosses a threshold (so the start of speech isn't clipped) and is
 * discarded if it turns out to be a brief click/tap rather than sustained
 * speech, then stops (and is sent for transcription) once amplitude stays low
 * for `SILENCE_END_MS`. `setPaused` lets the
 * caller silence detection while the character is talking or a reply is
 * pending, so the app doesn't try to transcribe over itself.
 */
export function useVoiceActivityRecognition(options: {
  dialogId: string;
  onFinal: (text: string) => void;
}): UseVoiceActivityRecognitionResult {
  const { dialogId, onFinal } = options;

  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMutedState] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const rafRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const skipNextRef = useRef(false);

  const mutedRef = useRef(false);
  const pausedRef = useRef(false);
  const aboveSinceRef = useRef<number | null>(null);
  const belowSinceRef = useRef<number | null>(null);
  const utteranceStartRef = useRef<number | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const releaseStream = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
  }, []);

  const transcribe = useCallback(
    async (blob: Blob) => {
      setTranscribing(true);
      setError(null);
      try {
        const form = new FormData();
        form.append("audio", blob, "utterance.webm");
        const response = await fetch(
          `/api/game/dialog/transcribe?dialogId=${encodeURIComponent(dialogId)}`,
          { method: "POST", body: form },
        );
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(
            body?.error ?? `Ошибка распознавания: ${response.status}`,
          );
        }
        const parsed = transcribeResponseSchema.safeParse(
          await response.json(),
        );
        if (parsed.success && parsed.data.text) {
          onFinalRef.current(parsed.data.text);
        }
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

  const stopRecorder = useCallback((skip: boolean) => {
    skipNextRef.current = skip;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const beginUtterance = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || recorderRef.current) return;
    chunksRef.current = [];
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    );
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      recorderRef.current = null;
      setRecording(false);
      const chunks = chunksRef.current;
      chunksRef.current = [];
      const skip = skipNextRef.current;
      skipNextRef.current = false;
      if (skip) return;
      const blob = new Blob(chunks, {
        type: recorder.mimeType || "audio/webm",
      });
      if (blob.size < MIN_UTTERANCE_BYTES) return;
      void transcribe(blob);
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    utteranceStartRef.current = performance.now();
  }, [transcribe]);

  const monitor = useCallback(() => {
    const analyser = analyserRef.current;
    const data = dataRef.current;
    if (analyser && data) {
      analyser.getFloatTimeDomainData(data);
      let sumSquares = 0;
      for (const sample of data) sumSquares += sample * sample;
      const rms = Math.sqrt(sumSquares / data.length);
      const now = performance.now();
      const above = rms > SPEECH_RMS_THRESHOLD;
      const gated = mutedRef.current || pausedRef.current;

      if (gated) {
        aboveSinceRef.current = null;
        belowSinceRef.current = null;
        if (recorderRef.current) stopRecorder(true);
      } else if (recorderRef.current && aboveSinceRef.current !== null) {
        // Recording started optimistically on the first loud sample, before
        // SPEECH_START_MS has confirmed it's really speech and not a
        // click/tap. Discard it if amplitude drops before confirmation.
        if (!above) {
          aboveSinceRef.current = null;
          stopRecorder(true);
        } else if (now - aboveSinceRef.current >= SPEECH_START_MS) {
          aboveSinceRef.current = null;
        }
      } else if (recorderRef.current) {
        if (above) {
          belowSinceRef.current = null;
        } else if (belowSinceRef.current === null) {
          belowSinceRef.current = now;
        } else if (now - belowSinceRef.current >= SILENCE_END_MS) {
          stopRecorder(false);
          belowSinceRef.current = null;
        }
        if (
          utteranceStartRef.current !== null &&
          now - utteranceStartRef.current >= MAX_UTTERANCE_MS
        ) {
          stopRecorder(false);
        }
      } else if (above) {
        // Start capturing right away so the onset of speech isn't lost —
        // confirmation (above) discards this if it turns out to be a blip.
        aboveSinceRef.current = now;
        beginUtterance();
      } else {
        aboveSinceRef.current = null;
      }
    }
    rafRef.current = requestAnimationFrame(monitor);
  }, [beginUtterance, stopRecorder]);

  // Bumped on every start()/stop() so a getUserMedia() prompt the user takes
  // a while to answer can't resurrect the mic after the call already ended.
  const startTokenRef = useRef(0);

  const stop = useCallback(() => {
    startTokenRef.current += 1;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    stopRecorder(true);
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    analyserRef.current = null;
    dataRef.current = null;
    releaseStream();
    aboveSinceRef.current = null;
    belowSinceRef.current = null;
    setListening(false);
  }, [releaseStream, stopRecorder]);

  const start = useCallback(() => {
    if (!supported || streamRef.current) return;
    setError(null);
    const token = ++startTokenRef.current;

    void (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch {
        if (token === startTokenRef.current)
          setError("Нет доступа к микрофону");
        return;
      }
      if (token !== startTokenRef.current) {
        // stop() ran while the permission prompt was still open — discard
        // this stream instead of resurrecting the mic after the call ended.
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      streamRef.current = stream;

      const AudioContextCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextCtor) {
        setError("Браузер не поддерживает анализ звука");
        releaseStream();
        return;
      }
      const audioContext = new AudioContextCtor();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      dataRef.current = new Float32Array(
        new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT),
      );

      setListening(true);
      rafRef.current = requestAnimationFrame(monitor);
    })();
  }, [monitor, releaseStream, supported]);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== "undefined" &&
        (typeof window.AudioContext !== "undefined" ||
          typeof (window as unknown as { webkitAudioContext?: unknown })
            .webkitAudioContext !== "undefined"),
    );
    return () => stop();
  }, [stop]);

  const setMuted = useCallback((next: boolean) => {
    mutedRef.current = next;
    setMutedState(next);
  }, []);

  const setPaused = useCallback((next: boolean) => {
    pausedRef.current = next;
  }, []);

  return {
    supported,
    listening,
    recording,
    transcribing,
    error,
    muted,
    setMuted,
    setPaused,
    start,
    stop,
  };
}
