import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { api } from "~/orpc/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const ELEVENLABS_TIMEOUT_MS = 15_000;
const MAX_TEXT_LENGTH = 2000;

const bodySchema = z.object({
  dialogId: z.uuid(),
  text: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
  gender: z.enum(["male", "female"]),
});

/**
 * Turns a character's reply into premium speech via ElevenLabs, replacing the
 * browser's built-in `speechSynthesis` (robotic, no gender-matched voices).
 *
 * @example POST /api/game/dialog/speak  { dialogId, text, gender }
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const { dialogId, text, gender } = parsed.data;

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

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Премиальное озвучивание не настроено на сервере" },
      { status: 503 },
    );
  }
  const voiceId =
    gender === "male"
      ? (process.env.ELEVENLABS_VOICE_ID_MALE ?? "pNInz6obpgDQGcFmaJgB")
      : (process.env.ELEVENLABS_VOICE_ID_FEMALE ?? "21m00Tcm4TlvDq8ikWAM");

  let elevenLabsResponse: Response;
  try {
    elevenLabsResponse = await fetch(`${ELEVENLABS_URL}/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        // Low-latency multilingual model — keeps Russian speech natural
        // without the round-trip cost of the full-quality model.
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
      signal: AbortSignal.timeout(ELEVENLABS_TIMEOUT_MS),
    });
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === "TimeoutError";
    return Response.json(
      {
        error: timedOut
          ? "Сервис озвучивания не ответил вовремя"
          : "Не удалось связаться с сервисом озвучивания",
      },
      { status: timedOut ? 504 : 502 },
    );
  }

  if (!elevenLabsResponse.ok || !elevenLabsResponse.body) {
    return Response.json(
      { error: `Сервис озвучивания недоступен (${elevenLabsResponse.status})` },
      { status: 502 },
    );
  }

  return new Response(elevenLabsResponse.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
