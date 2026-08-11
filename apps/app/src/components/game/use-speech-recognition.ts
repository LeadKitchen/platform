"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Голосовой ввод через Web Speech API браузера.
 *
 * По ТЗ распознавание речи остаётся на стороне платформы, а ИИ-модуль работает
 * с текстом. Здесь — самая дешёвая реализация этого контракта: браузер отдаёт
 * расшифровку, дальше в API уходит уже текст. Если API недоступен (Firefox,
 * старый Safari), компонент просто остаётся с обычным полем ввода.
 */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const candidate = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition;
}

export interface UseSpeechRecognitionResult {
  supported: boolean;
  listening: boolean;
  /** Промежуточная расшифровка, пока пользователь говорит. */
  interim: string;
  error: string | null;
  start(): void;
  stop(): void;
}

export function useSpeechRecognition(options: {
  lang?: string;
  onFinal: (text: string) => void;
}): UseSpeechRecognitionResult {
  const { lang = "ru-RU", onFinal } = options;

  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef(onFinal);

  onFinalRef.current = onFinal;

  useEffect(() => {
    const Constructor = getConstructor();
    if (!Constructor) return;

    setSupported(true);
    const recognition = new Constructor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        const result = event.results[index];
        if (!result) continue;
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }

      setInterim(interimText);
      if (finalText.trim().length > 0) {
        onFinalRef.current(finalText.trim());
        setInterim("");
      }
    };

    recognition.onerror = (event) => {
      setError(
        event.error === "not-allowed"
          ? "Нет доступа к микрофону"
          : `Ошибка распознавания: ${event.error}`,
      );
      setListening(false);
    };

    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
    };
  }, [lang]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setError(null);
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch {
      // start() бросает, если распознавание уже запущено — это не ошибка.
    }
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return { supported, listening, interim, error, start, stop };
}
