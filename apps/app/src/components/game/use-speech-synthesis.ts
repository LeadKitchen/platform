"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseSpeechSynthesisResult {
  supported: boolean;
  speaking: boolean;
  enabled: boolean;
  setEnabled(enabled: boolean): void;
  speak(text: string): void;
  stop(): void;
}

/**
 * Voices character lines through a premium server-side TTS (ElevenLabs),
 * picking a voice that matches the character's gender.
 *
 * Falls back to the browser's own `speechSynthesis` when the provider isn't
 * configured server-side or the request fails, so the room stays usable in
 * local dev without an API key — at the cost of the flatter system voice.
 */
export function useSpeechSynthesis(options: {
  dialogId: string;
  gender: "male" | "female";
  lang?: string;
  onEnd?: () => void;
}): UseSpeechSynthesisResult {
  const { dialogId, gender, lang = "ru-RU", onEnd } = options;
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [enabled, setEnabledState] = useState(true);
  const onEndRef = useRef(onEnd);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Bumped on every speak()/stop() so a stale in-flight fetch can't resurrect
  // audio for a turn the caller has already moved on from.
  const requestIdRef = useRef(0);

  onEndRef.current = onEnd;

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        (typeof Audio !== "undefined" || "speechSynthesis" in window),
    );
    return () => {
      requestIdRef.current += 1;
      abortRef.current?.abort();
      cleanupAudio();
      window.speechSynthesis?.cancel();
    };
  }, [cleanupAudio]);

  const finish = useCallback(() => {
    cleanupAudio();
    setSpeaking(false);
    onEndRef.current?.();
  }, [cleanupAudio]);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    cleanupAudio();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, [cleanupAudio]);

  const speakWithBrowser = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        finish();
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 1;
      utterance.pitch = 1;
      const voices = window.speechSynthesis.getVoices();
      utterance.voice =
        voices.find(
          (voice) => voice.lang.toLowerCase() === lang.toLowerCase(),
        ) ??
        voices.find((voice) =>
          voice.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()),
        ) ??
        null;
      utterance.onend = finish;
      utterance.onerror = finish;
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [finish, lang],
  );

  const speak = useCallback(
    (text: string) => {
      if (!enabled) {
        finish();
        return;
      }
      cleanupAudio();
      const requestId = ++requestIdRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      setSpeaking(true);

      void (async () => {
        try {
          const response = await fetch("/api/game/dialog/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dialogId, text, gender }),
            signal: controller.signal,
          });
          if (requestId !== requestIdRef.current) return;
          if (!response.ok) {
            speakWithBrowser(text);
            return;
          }
          const blob = await response.blob();
          if (requestId !== requestIdRef.current) return;

          const url = URL.createObjectURL(blob);
          objectUrlRef.current = url;
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = finish;
          audio.onerror = () => speakWithBrowser(text);
          await audio.play();
        } catch (cause) {
          if (
            requestId === requestIdRef.current &&
            !(cause instanceof DOMException && cause.name === "AbortError")
          ) {
            speakWithBrowser(text);
          }
        }
      })();
    },
    [cleanupAudio, dialogId, enabled, finish, gender, speakWithBrowser],
  );

  const setEnabled = useCallback(
    (next: boolean) => {
      setEnabledState(next);
      if (!next) stop();
    },
    [stop],
  );

  return { supported, speaking, enabled, setEnabled, speak, stop };
}
