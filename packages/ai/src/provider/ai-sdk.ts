import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { generateObject } from "ai";
import { z } from "zod";

import type { LlmProvider, LlmRequest, LlmResult } from "./types";

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
}

function buildModel(options: AiSdkProviderOptions): LanguageModel {
  switch (options.vendor) {
    case "openai":
      return createOpenAI({
        apiKey: options.apiKey,
        baseURL: options.baseUrl,
        headers: options.headers,
      })(options.model);

    case "anthropic":
      return createAnthropic({
        apiKey: options.apiKey,
        baseURL: options.baseUrl,
        headers: options.headers,
      })(options.model);

    default:
      return createOpenAICompatible({
        name: "gateway",
        apiKey: options.apiKey,
        baseURL: options.baseUrl ?? "https://api.openai.com/v1",
        headers: options.headers,
        supportsStructuredOutputs: options.supportsStructuredOutputs ?? false,
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
        }
      }

      // Surface what the model actually said. Without it a schema failure is
      // undebuggable: the SDK's message only says "did not match schema", and
      // the offending text is the one thing needed to fix either the prompt or
      // the schema.
      const raw = (lastError as { text?: string })?.text;
      const detail = (lastError as { cause?: { message?: string } })?.cause
        ?.message;

      throw new Error(
        [
          `${options.model} не вернула валидный объект для ${request.purpose} за ${maxAttempts} попыток:`,
          lastError instanceof Error ? lastError.message : String(lastError),
          detail ? `Причина: ${detail}` : "",
          raw ? `Ответ модели: ${raw.slice(0, 800)}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    },
  };
}
