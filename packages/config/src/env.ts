import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    // Node environment
    NODE_ENV: z.enum(["development", "production", "test"]).optional(),

    // Vercel
    VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
    VERCEL_URL: z.string().optional(),
    VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),

    // Database
    POSTGRES_URL: z.url().optional(),

    // App
    APP_URL: z.url().default("http://localhost:3000"),

    // Email
    RESEND_API_KEY: z.string().optional(),
    EMAIL_SANDBOX_ENABLED: z.coerce.boolean().optional().default(false),
    EMAIL_SANDBOX_HOST: z.string().default("localhost"),
    EMAIL_FROM: z.string().default("Acme <onboarding@resend.dev>"),

    // Auth
    AUTH_SECRET: z.string().optional(),
    AUTH_GOOGLE_ID: z.string().optional(),
    AUTH_GOOGLE_SECRET: z.string().optional(),

    // AI module (деловая игра «Ситуационное руководство»)
    ANTHROPIC_API_KEY: z.string().optional(),
    /** Провайдер или отказоустойчивый пул, поддерживаемый @acme/ai. */
    AI_PROVIDER: z.enum(["anthropic", "openai", "pool", "mock"]).optional(),
    AI_MODEL: z.string().optional(),
    AI_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
    /** Вариант конвейера по умолчанию для новых сессий. */
    AI_DEFAULT_VARIANT: z.string().optional(),

    // Голосовой ролевой диалог (деловая игра)
    /** @see https://elevenlabs.io — премиальный TTS вместо системного голоса браузера. */
    ELEVENLABS_API_KEY: z.string().optional(),
    /** ID премадж-голоса ElevenLabs для персонажей-мужчин (по умолчанию — Adam). */
    ELEVENLABS_VOICE_ID_MALE: z.string().default("pNInz6obpgDQGcFmaJgB"),
    /** ID премадж-голоса ElevenLabs для персонажей-женщин (по умолчанию — Rachel). */
    ELEVENLABS_VOICE_ID_FEMALE: z.string().default("21m00Tcm4TlvDq8ikWAM"),

    // Object storage (S3-compatible — Yandex Cloud Object Storage in
    // production, local MinIO in development). Names kept as AWS_* since
    // that's what the AWS SDK client (used against any S3-compatible
    // endpoint) reads.
    AWS_S3_ENDPOINT: z.string().optional(),
    AWS_S3_FORCE_PATH_STYLE: z.string().optional(),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    AWS_REGION: z.string().default("ru-central1"),
    AWS_S3_BUCKET: z.string().default("acme-bucket"),
  },
  client: {
    NEXT_PUBLIC_APP_NAME: z.string().default("Ситрук"),
    NEXT_PUBLIC_APP_SHORT_NAME: z.string().default("Ситрук"),
    NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  },
  clientPrefix: "NEXT_PUBLIC_",
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    POSTGRES_URL: process.env.POSTGRES_URL,
    APP_URL: process.env.APP_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_SANDBOX_ENABLED: process.env.EMAIL_SANDBOX_ENABLED === "true",
    EMAIL_SANDBOX_HOST: process.env.EMAIL_SANDBOX_HOST,
    EMAIL_FROM: process.env.EMAIL_FROM,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_MODEL: process.env.AI_MODEL,
    AI_EFFORT: process.env.AI_EFFORT,
    AI_DEFAULT_VARIANT: process.env.AI_DEFAULT_VARIANT,
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    ELEVENLABS_VOICE_ID_MALE: process.env.ELEVENLABS_VOICE_ID_MALE,
    ELEVENLABS_VOICE_ID_FEMALE: process.env.ELEVENLABS_VOICE_ID_FEMALE,
    AWS_S3_ENDPOINT: process.env.AWS_S3_ENDPOINT,
    AWS_S3_FORCE_PATH_STYLE: process.env.AWS_S3_FORCE_PATH_STYLE,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    AWS_REGION: process.env.AWS_REGION,
    AWS_S3_BUCKET: process.env.AWS_S3_BUCKET,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_SHORT_NAME: process.env.NEXT_PUBLIC_APP_SHORT_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  skipValidation:
    (!!process.env.CI && !process.env.VERCEL) ||
    process.env.npm_lifecycle_event === "lint",
});
