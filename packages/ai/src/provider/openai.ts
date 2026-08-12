import { z } from "zod";

import type { LlmProvider, LlmRequest, LlmResult } from "./types";

export interface OpenAiProviderOptions {
  apiKey?: string;
  /** OpenAI-compatible endpoint, e.g. `https://api.openai.com/v1`. */
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  /** Attempts to obtain schema-valid JSON before giving up. */
  maxAttempts?: number;
  timeoutMs?: number;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

interface ChatCompletionResponse {
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
  error?: { message?: string };
}

/**
 * Turn a Zod schema into an instruction block.
 *
 * Many OpenAI-compatible gateways accept `response_format`/`tools` and then
 * silently ignore them, answering in prose — which fails schema validation and
 * costs a full call. Stating the contract in the prompt is the only mechanism
 * that works across all of them, so it is the primary path here rather than a
 * fallback.
 */
function schemaInstruction(schema: z.ZodType<unknown>): string {
  const jsonSchema = z.toJSONSchema(schema, { io: "output" });
  return [
    "Верни ОДИН JSON-объект и ничего кроме него.",
    "Без markdown-обёртки, без пояснений до или после.",
    "Объект должен строго соответствовать JSON Schema:",
    JSON.stringify(jsonSchema),
  ].join("\n");
}

/**
 * Pull a JSON object out of a model answer.
 *
 * Handles the three shapes seen in practice: bare JSON, JSON inside a ```json
 * fence, and JSON preceded by a sentence of prose.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidates = [fenced?.[1]?.trim(), trimmed].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Fall through to the brace-scan below.
    }

    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // Try the next candidate.
      }
    }
  }

  throw new Error("В ответе модели не найден JSON-объект");
}

/**
 * Provider for any OpenAI-compatible endpoint (OpenAI itself, a gateway, a
 * self-hosted vLLM…).
 *
 * Implemented over `fetch` rather than the OpenAI SDK on purpose: we need
 * exactly one endpoint, and gateways differ in which optional parameters they
 * honour — keeping the request minimal is what makes it portable.
 */
export function createOpenAiProvider(
  options: OpenAiProviderOptions = {},
): LlmProvider {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  const baseUrl = (
    options.baseUrl ??
    process.env.OPENAI_BASE_URL ??
    "https://api.openai.com/v1"
  ).replace(/\/+$/, "");
  const model = options.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const maxTokens = options.maxTokens ?? 4000;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const timeoutMs = options.timeoutMs ?? 120_000;
  const doFetch = options.fetchImpl ?? fetch;

  async function call(
    messages: { role: string; content: string }[],
  ): Promise<{ text: string; response: ChatCompletionResponse }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const httpResponse = await doFetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey ?? ""}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_completion_tokens: maxTokens,
        }),
        signal: controller.signal,
      });

      if (!httpResponse.ok) {
        const body = await httpResponse.text();
        throw new Error(
          `OpenAI-совместимый API вернул ${httpResponse.status}: ${body.slice(0, 500)}`,
        );
      }

      const response = (await httpResponse.json()) as ChatCompletionResponse;
      if (response.error?.message) {
        throw new Error(`Ошибка API: ${response.error.message}`);
      }

      return {
        text: response.choices?.[0]?.message?.content ?? "",
        response,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    id: "openai",
    model,

    async generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
      const startedAt = Date.now();

      const messages: { role: string; content: string }[] = [
        {
          role: "system",
          content: `${request.system}\n\n${schemaInstruction(request.schema)}`,
        },
        ...request.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ];

      let inputTokens = 0;
      let outputTokens = 0;
      let cachedTokens = 0;
      let lastError: unknown;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const { text, response } = await call(messages);

        inputTokens += response.usage?.prompt_tokens ?? 0;
        outputTokens += response.usage?.completion_tokens ?? 0;
        cachedTokens += response.usage?.prompt_tokens_details?.cached_tokens ?? 0;

        try {
          const value = request.schema.parse(extractJson(text));
          return {
            value,
            usage: {
              inputTokens,
              outputTokens,
              cacheReadInputTokens: cachedTokens,
            },
            latencyMs: Date.now() - startedAt,
            model: response.model ?? model,
          };
        } catch (cause) {
          lastError = cause;
          // Show the model its own bad answer and the validation error: a
          // repair turn is far cheaper than discarding the whole dialog.
          messages.push({ role: "assistant", content: text });
          messages.push({
            role: "user",
            content: `Ответ не прошёл валидацию: ${
              cause instanceof Error ? cause.message : String(cause)
            }\nВерни ТОЛЬКО корректный JSON-объект по схеме, без markdown.`,
          });
        }
      }

      throw new Error(
        `Модель ${model} не вернула валидный JSON для ${request.purpose} за ${maxAttempts} попыток: ${
          lastError instanceof Error ? lastError.message : String(lastError)
        }`,
      );
    },
  };
}
