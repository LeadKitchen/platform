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

/** Озвучивает реплики персонажа средствами браузера, без передачи аудио наружу. */
export function useSpeechSynthesis(options?: {
  lang?: string;
  onEnd?: () => void;
}): UseSpeechSynthesisResult {
  const { lang = "ru-RU", onEnd } = options ?? {};
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [enabled, setEnabledState] = useState(true);
  const onEndRef = useRef(onEnd);

  onEndRef.current = onEnd;

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        "speechSynthesis" in window &&
        "SpeechSynthesisUtterance" in window,
    );

    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  const finish = useCallback(() => {
    setSpeaking(false);
    onEndRef.current?.();
  }, []);

  const stop = useCallback(() => {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (
        !enabled ||
        typeof window === "undefined" ||
        !("speechSynthesis" in window)
      ) {
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
    [enabled, finish, lang],
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
