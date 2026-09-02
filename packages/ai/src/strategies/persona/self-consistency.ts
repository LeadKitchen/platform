import { buildPersonaSystemPrompt, buildTranscript } from "../../prompts";
import { addUsage } from "../../provider/types";
import { clamp, personaReplySchema } from "../../schemas";
import type { PersonaReply, PersonaResult, PersonaStrategy } from "../../types";

/**
 * Self-consistency at inference time.
 *
 * Вместо единственного стохастического ответа получаем нечётное число
 * независимых кандидатов. Дискретные поля агрегируются большинством,
 * emotionDelta — медианой, requests — большинством по каждому запросу. Для
 * произносимого текста выбирается реальный кандидат, наиболее близкий к
 * агрегированному вердикту: мы не делаем дополнительный synthesis-вызов,
 * который снова добавил бы случайность и стоимость.
 */

interface Sample {
  reply: PersonaReply;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
  };
  model: string;
  latencyMs: number;
}

function mode<T extends string | boolean>(values: T[]): T {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const selected = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (selected !== undefined) return selected;
  const fallback = values[0];
  if (fallback !== undefined) return fallback;
  throw new Error("Нельзя вычислить консенсус для пустого списка");
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function majorityRequests(samples: Sample[]): string[] {
  const counts = new Map<string, { original: string; count: number }>();
  for (const sample of samples) {
    const unique = new Map(
      sample.reply.requests.map((request) => [
        request.trim().toLocaleLowerCase("ru"),
        request.trim(),
      ]),
    );
    for (const [key, original] of unique) {
      if (!key) continue;
      const current = counts.get(key);
      counts.set(key, {
        original: current?.original ?? original,
        count: (current?.count ?? 0) + 1,
      });
    }
  }

  const threshold = Math.floor(samples.length / 2) + 1;
  return [...counts.values()]
    .filter((item) => item.count >= threshold)
    .sort((a, b) => b.count - a.count)
    .map((item) => item.original);
}

function requestDistance(actual: string[], consensus: string[]): number {
  const left = new Set(actual.map((value) => value.trim().toLowerCase()));
  const right = new Set(consensus.map((value) => value.trim().toLowerCase()));
  let difference = 0;
  for (const value of left) if (!right.has(value)) difference += 1;
  for (const value of right) if (!left.has(value)) difference += 1;
  return difference;
}

function aggregate(samples: Sample[]): PersonaReply {
  const readiness = mode(samples.map((sample) => sample.reply.readiness));
  const confirmsCheckpoints = mode(
    samples.map((sample) => sample.reply.confirmsCheckpoints),
  );
  const emotionDelta = clamp(
    median(samples.map((sample) => sample.reply.emotionDelta)),
    -2,
    2,
  );
  const requests = majorityRequests(samples);

  const ranked = samples
    .map((sample, index) => {
      const mismatch =
        (sample.reply.readiness === readiness ? 0 : 3) +
        (sample.reply.confirmsCheckpoints === confirmsCheckpoints ? 0 : 2) +
        Math.abs(sample.reply.emotionDelta - emotionDelta) +
        requestDistance(sample.reply.requests, requests);
      return { sample, index, mismatch };
    })
    .sort(
      (a, b) =>
        a.mismatch - b.mismatch ||
        a.sample.reply.reply.length - b.sample.reply.reply.length ||
        a.index - b.index,
    );

  const representative = ranked[0]?.sample.reply ?? samples[0]?.reply;
  if (!representative) {
    throw new Error("Нельзя агрегировать пустой список ответов");
  }

  return {
    silent: false,
    reply: representative.reply,
    understood: representative.understood,
    readiness,
    requests,
    confirmsCheckpoints,
    emotionDelta,
  };
}

export const selfConsistencyPersona: PersonaStrategy = {
  id: "self-consistency",
  description:
    "Test-time self-consistency: 3–7 параллельных реплик, majority vote по поведению и выбор наиболее консенсусного текста.",

  async respond(request, deps): Promise<PersonaResult> {
    const startedAt = Date.now();
    const configured =
      typeof deps.params.selfConsistencySamples === "number"
        ? Math.round(deps.params.selfConsistencySamples)
        : 3;
    // Нечётное число устраняет ничью по boolean/enum. Верхний cap защищает
    // стоимость, даже если вариант ошибочно сконфигурирован через admin UI.
    const sampleCount = Math.min(7, Math.max(3, configured | 1));

    const system = buildPersonaSystemPrompt({
      dialog: request.dialog,
      knowledge: request.knowledge,
      roleRules:
        typeof deps.params.roleRules === "string"
          ? deps.params.roleRules
          : undefined,
    });
    const messages = buildTranscript(request.dialog.turns, request.utterance);

    const settled = await Promise.allSettled(
      Array.from({ length: sampleCount }, async (): Promise<Sample> => {
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
          model: result.model,
          latencyMs: result.latencyMs,
        };
      }),
    );

    const samples = settled.flatMap((item) =>
      item.status === "fulfilled" ? [item.value] : [],
    );
    if (samples.length === 0) {
      const failure = settled.find(
        (item): item is PromiseRejectedResult => item.status === "rejected",
      );
      throw (
        failure?.reason ??
        new Error("Все self-consistency вызовы завершились ошибкой")
      );
    }

    const reply = aggregate(samples);
    const models = [...new Set(samples.map((sample) => sample.model))];

    return {
      reply,
      usage: addUsage(...samples.map((sample) => sample.usage)),
      latencyMs: Date.now() - startedAt,
      meta: {
        model: models[0] ?? deps.provider.model,
        models,
        requestedSamples: sampleCount,
        successfulSamples: samples.length,
        failedSamples: sampleCount - samples.length,
        providerLatencyMs: Math.max(
          ...samples.map((sample) => sample.latencyMs),
        ),
        consensus: {
          readiness: reply.readiness,
          confirmsCheckpoints: reply.confirmsCheckpoints,
          emotionDelta: reply.emotionDelta,
        },
        prompt: { system, messages },
      },
    };
  },
};
