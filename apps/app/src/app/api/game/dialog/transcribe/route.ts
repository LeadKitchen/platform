import { ORPCError } from "@orpc/server";
import { api } from "~/orpc/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEEPGRAM_URL = "https://api.deepgram.com/v1/listen";

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
 * @example POST /api/game/dialog/transcribe  (multipart: dialogId, audio)
 */
export async function POST(request: Request) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Распознавание речи не настроено на сервере" },
      { status: 503 },
    );
  }

  const form = await request.formData();
  const dialogId = form.get("dialogId");
  const audio = form.get("audio");
  if (typeof dialogId !== "string" || !(audio instanceof Blob)) {
    return Response.json({ error: "Некорректный запрос" }, { status: 400 });
  }

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

  const deepgramResponse = await fetch(
    `${DEEPGRAM_URL}?language=ru&smart_format=true&punctuate=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": audio.type || "audio/webm",
      },
      body: audio,
    },
  );

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
