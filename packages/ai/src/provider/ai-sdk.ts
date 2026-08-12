import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { generateObject } from "ai";
import { z } from "zod";

import type { LlmProvider, LlmRequest, LlmResult } from "./types";

/**
 * Failure of a single provider call, with the transport status preserved.
 *
 * The pool decides between "this endpoint is down" and "this model cannot
 * follow the schema" from `statusCode`. Wrapping the SDK error in a plain
 * `Error` erased it, so a quota exhaustion looked like a quality problem and
 * the candidate was never put on cooldown.
 */
export class LlmCallError extends Error {
  readonly statusCode?: number;
  readonly responseText?: string;

  constructor(
    message: string,
    options: { cause?: unknown; statusCode?: number; responseText?: string },
  ) {
    super(message, { cause: options.cause });
    this.name = "LlmCallError";
    this.statusCode = options.statusCode;
    this.responseText = options.responseText;
  }
}

/** Dig the HTTP status out of an AI SDK error or any of its causes. */
function findStatusCode(error: unknown, depth = 0): number | undefined {
  if (!error || typeof error !== "object" || depth > 4) return undefined;
  const status = (error as { statusCode?: number; status?: number }).statusCode;
  if (typeof status === "number") return status;
  const alt = (error as { status?: number }).status;
  if (typeof alt === "number") return alt;
  return findStatusCode((error as { cause?: unknown }).cause, depth + 1);
}

/**
 * Pull a JSON object out of an answer that carries prose around it.
 *
 * Models on gateways occasionally prefix the object with a stray line — a
 * pseudo tool call, a "вот результат:" — which makes the SDK's strict parse
 * fail on output that is otherwise perfectly good. Recovering it here saves a
 * retry, and in a long benchmark saves the scenario.
 */
function salvageJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidates = [fenced?.[1], text].filter(
    (value): value is string => typeof value === "string",
  );

  for (const candidate of candidates) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      // Try the next candidate.
    }
  }

  return undefined;
}

/**
 * Turn a plain-text persona answer into the same safe defaults used by a
 * structured reply. Some OpenAI-compatible gateways ignore JSON mode even
 * when the schema is present in the prompt; the spoken line is still useful
 * to the player and should not make the whole training dialog unavailable.
 */
function salvagePersonaReply(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const jsonReply = /"reply"\s*:\s*"((?:\\.|[^"\\])*)"/i.exec(cleaned)?.[1];
  const labelledReply =
    /(?:^|\n)\s*reply\s*(?:—|:)\s*([\s\S]*?)(?=\n\s*(?:understood|readiness|requests|confirmsCheckpoints|emotionDelta)\s*(?:—|:)|$)/i.exec(
      cleaned,
    )?.[1];
  let reply = labelledReply?.trim() ?? cleaned;

  if (jsonReply) {
    try {
      reply = JSON.parse(`"${jsonReply}"`) as string;
    } catch {
      reply = jsonReply;
    }
  }

  if (reply.length === 0) return undefined;

  return {
    reply,
    understood: null,
    readiness: "confident",
    requests: [],
    confirmsCheckpoints: false,
    emotionDelta: 0,
  };
}

/**
 * Vendor-neutral provider built on the Vercel AI SDK.
 *
 * One `generateObject` call site covers OpenAI, Anthropic and any
 * OpenAI-compatible gateway, which is what turns "which model should we use?"
 * into another arm of the experiment instead of a rewrite. The SDK also owns
 * the structured-output negotiation (native JSON schema where supported,
 * prompt-injected schema where not).
 */
export type AiSdkVendor = "openai" | "anthropic" | "openai-compatible";

export interface AiSdkProviderOptions {
  vendor: AiSdkVendor;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxOutputTokens?: number;
  /** Attempts before giving up on schema-valid output. */
  maxAttempts?: number;
  /**
   * Whether the endpoint honours native structured outputs.
   *
   * Many gateways accept `response_format` and then answer in prose anyway.
   * Setting this to `false` makes the SDK state the schema in the prompt,
   * which is the only mechanism that works everywhere.
   */
  supportsStructuredOutputs?: boolean;
  headers?: Record<string, string>;
  /** Injectable transport: used by tests and by proxied environments. */
  fetchImpl?: typeof fetch;
}

function buildModel(options: AiSdkProviderOptions): LanguageModel {
  switch (options.vendor) {
    case "openai":
      return createOpenAI({
        apiKey: options.apiKey,
        baseURL: options.baseUrl,
        headers: options.headers,
        fetch: options.fetchImpl,
      })(options.model);

    case "anthropic":
      return createAnthropic({
        apiKey: options.apiKey,
        baseURL: options.baseUrl,
        headers: options.headers,
        fetch: options.fetchImpl,
      })(options.model);

    default:
      return createOpenAICompatible({
        name: "gateway",
        apiKey: options.apiKey,
        baseURL: options.baseUrl ?? "https://api.openai.com/v1",
        headers: options.headers,
        supportsStructuredOutputs: options.supportsStructuredOutputs ?? false,
        fetch: options.fetchImpl,
      })(options.model);
  }
}

/**
 * Append the JSON contract to the system prompt.
 *
 * Used on the repair attempt: when a gateway ignores the structured-output
 * request and answers in prose, restating the schema inline is what recovers
 * the call instead of losing the whole dialog.
 */
function schemaHint(schema: z.ZodType<unknown>): string {
  const jsonSchema = z.toJSONSchema(schema, { io: "output" });
  return [
    "",
    "Верни ОДИН JSON-объект и ничего кроме него — без markdown-обёртки,",
    "без пояснений до или после. Строго по схеме:",
    JSON.stringify(jsonSchema),
  ].join("\n");
}

export function createAiSdkProvider(
  options: AiSdkProviderOptions,
): LlmProvider {
  // Gateways without native structured outputs emit a "responseFormat is not
  // supported" warning on every single call. That is the expected, handled
  // path here — logging it once per request would bury a benchmark run.
  if (options.supportsStructuredOutputs === false) {
    globalThis.AI_SDK_LOG_WARNINGS = false;
  }

  const model = buildModel(options);
  const maxOutputTokens = options.maxOutputTokens ?? 16000;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);

  return {
    id: `ai-sdk:${options.vendor}`,
    model: options.model,

    async generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
      const startedAt = Date.now();
      let inputTokens = 0;
      let outputTokens = 0;
      let cachedTokens = 0;
      let cacheWriteTokens = 0;
      let lastError: unknown;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        // First attempt goes through the SDK's own negotiation; later ones
        // spell the contract out, since a failure means it was not honoured.
        const system =
          attempt === 1
            ? request.system
            : request.system + schemaHint(request.schema);

        try {
          const result = await generateObject({
            model,
            schema: request.schema,
            system,
            messages: request.messages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
            maxOutputTokens,
            // Retries belong to the pool, not to the SDK: an availability
            // failure should move to the next candidate immediately instead of
            // backing off against an endpoint that is already out of quota.
            maxRetries: 0,
          });

          inputTokens += result.usage.inputTokens ?? 0;
          outputTokens += result.usage.outputTokens ?? 0;
          cachedTokens += result.usage.inputTokenDetails?.cacheReadTokens ?? 0;
          cacheWriteTokens +=
            result.usage.inputTokenDetails?.cacheWriteTokens ?? 0;

          return {
            value: result.object as T,
            usage: {
              inputTokens,
              outputTokens,
              cacheReadInputTokens: cachedTokens,
              cacheCreationInputTokens: cacheWriteTokens,
            },
            latencyMs: Date.now() - startedAt,
            model: options.model,
          };
        } catch (cause) {
          lastError = cause;
          const usage = (cause as { usage?: Record<string, number> }).usage;
          inputTokens += usage?.inputTokens ?? 0;
          outputTokens += usage?.outputTokens ?? 0;

          // Last-ditch: the SDK kept the raw text, and the object is often
          // sitting inside it behind a line of prose.
          const text = (cause as { text?: string }).text;
          if (typeof text === "string") {
            const salvaged = salvageJson(text);
            if (salvaged !== undefined) {
              const parsed = request.schema.safeParse(salvaged);
              if (parsed.success) {
                return {
                  value: parsed.data as T,
                  usage: {
                    inputTokens,
                    outputTokens,
                    cacheReadInputTokens: cachedTokens,
                    cacheCreationInputTokens: cacheWriteTokens,
                  },
                  latencyMs: Date.now() - startedAt,
                  model: options.model,
                };
              }
            }

            if (request.purpose === "persona.reply") {
              const parsed = request.schema.safeParse(
                salvagePersonaReply(text),
              );
              if (parsed.success) {
                return {
                  value: parsed.data as T,
                  usage: {
                    inputTokens,
                    outputTokens,
                    cacheReadInputTokens: cachedTokens,
                    cacheCreationInputTokens: cacheWriteTokens,
                  },
                  latencyMs: Date.now() - startedAt,
                  model: options.model,
                };
              }
            }
          }
        }
      }

      // Surface what the model actually said. Without it a schema failure is
      // undebuggable: the SDK's message only says "did not match schema", and
      // the offending text is the one thing needed to fix either the prompt or
      // the schema.
      const raw = (lastError as { text?: string })?.text;
      const detail = (lastError as { cause?: { message?: string } })?.cause
        ?.message;

      throw new LlmCallError(
        [
          `${options.model} не вернула валидный объект для ${request.purpose} за ${maxAttempts} попыток:`,
          lastError instanceof Error ? lastError.message : String(lastError),
          detail ? `Причина: ${detail}` : "",
          raw ? `Ответ модели: ${raw.slice(0, 800)}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        {
          cause: lastError,
          statusCode: findStatusCode(lastError),
          responseText: raw,
        },
      );
    },
  };
}
