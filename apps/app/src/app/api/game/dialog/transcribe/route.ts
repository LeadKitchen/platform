import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { api } from "~/orpc/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEEPGRAM_URL = "https://api.deepgram.com/v1/listen";
const DEEPGRAM_TIMEOUT_MS = 15_000;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

interface DeepgramResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{ transcript?: string }>;
    }>;
  };
}

/**
 * Transcribes a push-to-talk audio clip via Deepgram.
 *
 * The browser's own SpeechRecognition (used previously) depends on Chrome's
 * proxy to Google's speech servers, which is blocked in some networks/regions
 * and behaves inconsistently across browsers. Recording locally with
 * MediaRecorder and transcribing server-side removes that dependency.
 *
 * @example POST /api/game/dialog/transcribe?dialogId=<uuid>  (multipart: audio)
 */
export async function POST(request: Request) {
  const dialogIdResult = z
    .uuid()
    .safeParse(new URL(request.url).searchParams.get("dialogId"));
  if (!dialogIdResult.success) {
    return Response.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const dialogId = dialogIdResult.data;

  try {
    // Reuses the existing ownership check rather than re-implementing it here.
    await api.game.dialog.byId({ dialogId });
  } catch (cause) {
    if (cause instanceof ORPCError) {
      const status = cause.code === "UNAUTHORIZED" ? 401 : 404;
      return Response.json({ error: cause.message }, { status });
    }
    throw cause;
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (contentLength > MAX_AUDIO_BYTES) {
    return Response.json(
      { error: "Аудиозапись слишком большая" },
      { status: 400 },
    );
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Распознавание речи не настроено на сервере" },
      { status: 503 },
    );
  }

  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) {
    return Response.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json(
      { error: "Аудиозапись слишком большая" },
      { status: 400 },
    );
  }

  let deepgramResponse: Response;
  try {
    deepgramResponse = await fetch(
      `${DEEPGRAM_URL}?language=ru&smart_format=true&punctuate=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": audio.type || "audio/webm",
        },
        body: audio,
        signal: AbortSignal.timeout(DEEPGRAM_TIMEOUT_MS),
      },
    );
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === "TimeoutError";
    return Response.json(
      {
        error: timedOut
          ? "Сервис распознавания не ответил вовремя"
          : "Не удалось связаться с сервисом распознавания",
      },
      { status: timedOut ? 504 : 502 },
    );
  }

  if (!deepgramResponse.ok) {
    return Response.json(
      { error: `Сервис распознавания недоступен (${deepgramResponse.status})` },
      { status: 502 },
    );
  }

  const data = (await deepgramResponse.json()) as DeepgramResponse;
  const text = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";

  return Response.json({ text: text.trim() });
}
