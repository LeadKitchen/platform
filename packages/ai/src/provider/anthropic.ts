import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import type { LlmEffort, LlmProvider, LlmRequest, LlmResult } from "./types";

export interface AnthropicProviderOptions {
  apiKey?: string;
  /** Defaults to `claude-opus-5`. */
  model?: string;
  /** Default reasoning depth; individual calls may override it. */
  effort?: LlmEffort;
  maxTokens?: number;
  client?: Anthropic;
}

/**
 * Claude-backed provider.
 *
 * Every call uses structured outputs (`output_config.format`) so the engine
 * always receives a validated object instead of prose it has to parse, and
 * adaptive thinking so Claude decides how much reasoning a turn deserves.
 * The system prompt carries a cache breakpoint: it is stable for the whole
 * dialog, so from the second turn on it is served from cache.
 */
export function createAnthropicProvider(
  options: AnthropicProviderOptions = {},
): LlmProvider {
  const model = options.model ?? "claude-opus-5";
  const defaultEffort = options.effort ?? "medium";
  // Adaptive thinking is always on and shares this budget with the response
  // text — 4000 was tight enough that a long transcript could exhaust it
  // mid-thought and come back with `parsed_output == null`. 16k keeps this a
  // non-streaming-safe request while leaving real headroom for thinking.
  const defaultMaxTokens = options.maxTokens ?? 16000;
  const client =
    options.client ??
    new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {});

  return {
    id: "anthropic",
    model,
    async generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
      const startedAt = Date.now();

      const response = await client.messages.parse({
        model,
        max_tokens: request.maxTokens ?? defaultMaxTokens,
        thinking: { type: "adaptive" },
        output_config: {
          effort: request.effort ?? defaultEffort,
          format: zodOutputFormat(request.schema),
        },
        system: [
          {
            type: "text",
            text: request.system,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: request.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      });

      if (response.stop_reason === "refusal") {
        throw new Error(
          `Claude declined the request (${request.purpose}): ${
            response.stop_details?.explanation ?? "no explanation"
          }`,
        );
      }

      if (response.parsed_output == null) {
        throw new Error(
          `Claude returned no structured output for ${request.purpose} (stop_reason: ${response.stop_reason})`,
        );
      }

      return {
        value: response.parsed_output as T,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
          cacheCreationInputTokens:
            response.usage.cache_creation_input_tokens ?? 0,
        },
        latencyMs: Date.now() - startedAt,
        model: response.model,
      };
    },
  };
}
