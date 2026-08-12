import { buildPersonaSystemPrompt, buildTranscript } from "../../prompts";
import { clamp, personaReplySchema } from "../../schemas";
import type { PersonaResult, PersonaStrategy } from "../../types";

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

    const result = await deps.provider.generate({
      purpose: "persona.reply",
      schemaName: "persona_reply",
      schema: personaReplySchema,
      effort: deps.effort,
      system: buildPersonaSystemPrompt({
        dialog: request.dialog,
        knowledge: request.knowledge,
        roleRules:
          typeof deps.params.roleRules === "string"
            ? deps.params.roleRules
            : undefined,
      }),
      messages: buildTranscript(request.dialog.turns, request.utterance),
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
      meta: { model: result.model, providerLatencyMs: result.latencyMs },
    };
  },
};
