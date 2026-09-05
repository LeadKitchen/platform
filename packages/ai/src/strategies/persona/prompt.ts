import { buildPersonaSystemPrompt, buildTranscript } from "../../prompts";
import { clamp, personaReplySchema } from "../../schemas";
import type {
  PersonaResult,
  PersonaStrategy,
  PersonaStreamChunk,
  PersonaStreamResult,
} from "../../types";

/**
 * The control arm for the persona stage: one structured LLM call per turn,
 * everything the character knows comes from the knowledge stage.
 */
export const promptPersona: PersonaStrategy = {
  id: "prompt-baseline",
  description:
    "Один вызов модели на реплику: роль, контекст и правила поведения в системном промпте.",

  async respond(request, deps): Promise<PersonaResult> {
    const startedAt = Date.now();

    const system = buildPersonaSystemPrompt({
      dialog: request.dialog,
      knowledge: request.knowledge,
      roleRules:
        typeof deps.params.roleRules === "string"
          ? deps.params.roleRules
          : undefined,
    });
    const messages = buildTranscript(request.dialog.turns, request.utterance);

    const result = await deps.provider.generate({
      purpose: "persona.reply",
      schemaName: "persona_reply",
      schema: personaReplySchema,
      effort: deps.effort,
      signal: deps.signal,
      system,
      messages,
    });

    return {
      reply: {
        silent: false,
        reply: result.value.reply,
        understood: result.value.understood ?? null,
        readiness: result.value.readiness,
        requests: result.value.requests,
        confirmsCheckpoints: result.value.confirmsCheckpoints,
        emotionDelta: clamp(result.value.emotionDelta, -2, 2),
      },
      usage: result.usage,
      latencyMs: Date.now() - startedAt,
      meta: {
        model: result.model,
        providerLatencyMs: result.latencyMs,
        prompt: { system, messages },
      },
    };
  },

  respondStream(request, deps): PersonaStreamResult {
    const startedAt = Date.now();

    const system = buildPersonaSystemPrompt({
      dialog: request.dialog,
      knowledge: request.knowledge,
      roleRules:
        typeof deps.params.roleRules === "string"
          ? deps.params.roleRules
          : undefined,
    });
    const messages = buildTranscript(request.dialog.turns, request.utterance);

    const { stream, result } = deps.provider.generateStream({
      purpose: "persona.reply",
      schemaName: "persona_reply",
      schema: personaReplySchema,
      effort: deps.effort,
      signal: deps.signal,
      system,
      messages,
    });

    async function* chunks(): AsyncGenerator<PersonaStreamChunk> {
      for await (const partial of stream) {
        if (typeof partial.reply === "string" && partial.reply.length > 0) {
          yield { reply: partial.reply };
        }
      }
    }

    const personaResult = result.then((value) => ({
      reply: {
        silent: false,
        reply: value.value.reply,
        understood: value.value.understood ?? null,
        readiness: value.value.readiness,
        requests: value.value.requests,
        confirmsCheckpoints: value.value.confirmsCheckpoints,
        emotionDelta: clamp(value.value.emotionDelta, -2, 2),
      },
      usage: value.usage,
      latencyMs: Date.now() - startedAt,
      meta: {
        model: value.model,
        providerLatencyMs: value.latencyMs,
        prompt: { system, messages },
      },
    }));
    void personaResult.catch(() => undefined);

    return {
      stream: chunks(),
      result: personaResult,
    };
  },
};
