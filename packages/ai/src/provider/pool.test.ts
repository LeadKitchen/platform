import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { buildOpenRouterCandidates } from "./config";
import { createPoolProvider, type PoolCandidate } from "./pool";
import type { LlmRequest } from "./types";

const schema = z.object({ answer: z.string() });

function request(): LlmRequest<{ answer: string }> {
  return {
    purpose: "test",
    schemaName: "test",
    schema,
    system: "s",
    messages: [{ role: "user", content: "u" }],
  };
}

/**
 * The pool builds its own providers from candidates, so a test double has to
 * be injected at the fetch layer. `baseUrl` doubles as the routing key here.
 */
function stubFetch(
  behaviour: Record<string, "ok" | "quota" | "garbage">,
): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const key =
      Object.keys(behaviour).find((name) => url.includes(name)) ?? "unknown";
    const mode = behaviour[key];

    if (mode === "quota") {
      return new Response("insufficient balance", { status: 429 });
    }

    const content =
      mode === "garbage" ? "не смог" : JSON.stringify({ answer: key });

    return new Response(
      JSON.stringify({
        model: key,
        choices: [{ message: { role: "assistant", content } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;
}

function candidate(name: string): PoolCandidate {
  return {
    id: name,
    vendor: "openai-compatible",
    model: name,
    apiKey: "k",
    baseUrl: `https://${name}.test/v1`,
    supportsStructuredOutputs: false,
  };
}

describe("createPoolProvider", () => {
  test("falls through to the next candidate when the first is out of quota", async () => {
    const provider = createPoolProvider({
      candidates: [candidate("first"), candidate("second")],
      attemptsPerCandidate: 1,
      fetchImpl: stubFetch({ first: "quota", second: "ok" }),
    });

    const result = await provider.generate(request());

    expect(result.value.answer).toBe("second");
    expect(provider.stats().servedBy.second).toBe(1);
    expect(provider.stats().availabilityFailures.first).toBe(1);
  });

  test("a quota failure puts the candidate on cooldown, not out of the pool", async () => {
    const provider = createPoolProvider({
      candidates: [candidate("first"), candidate("second")],
      attemptsPerCandidate: 1,
      cooldownMs: 60_000,
      fetchImpl: stubFetch({ first: "quota", second: "ok" }),
    });

    await provider.generate(request());

    expect(provider.stats().coolingDown.first).toBeGreaterThan(Date.now());
  });

  test("a cooling candidate is still tried when nothing else is left", async () => {
    // Availability failures are transient by nature; refusing to retry a
    // cooling candidate would fail the whole run over a temporary blip.
    let firstCallDone = false;
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("only")) {
        if (!firstCallDone) {
          firstCallDone = true;
          return new Response("rate limit", { status: 429 });
        }
        return new Response(
          JSON.stringify({
            model: "only",
            choices: [
              { message: { content: JSON.stringify({ answer: "recovered" }) } },
            ],
            usage: {},
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("nope", { status: 500 });
    }) as unknown as typeof fetch;

    const provider = createPoolProvider({
      candidates: [candidate("only")],
      attemptsPerCandidate: 1,
      fetchImpl,
    });

    await expect(provider.generate(request())).rejects.toThrow();
    const second = await provider.generate(request());
    expect(second.value.answer).toBe("recovered");
  });

  test("schema failures count as capability, not availability", async () => {
    const provider = createPoolProvider({
      candidates: [candidate("weak"), candidate("strong")],
      attemptsPerCandidate: 1,
      fetchImpl: stubFetch({ weak: "garbage", strong: "ok" }),
    });

    const result = await provider.generate(request());

    expect(result.value.answer).toBe("strong");
    // A model that answers but cannot follow the schema is not "down": putting
    // it on an availability cooldown would hide a quality problem as an outage.
    expect(provider.stats().capabilityFailures.weak).toBe(1);
    expect(provider.stats().availabilityFailures.weak).toBeUndefined();
  });

  test("the result carries the model that actually answered", async () => {
    const provider = createPoolProvider({
      candidates: [candidate("first"), candidate("second")],
      attemptsPerCandidate: 1,
      fetchImpl: stubFetch({ first: "quota", second: "ok" }),
    });

    const result = await provider.generate(request());

    // Attribution matters more than it looks: the benchmark uses this to warn
    // that two arms were not served by the same model.
    expect(result.model).toBe("second");
    expect(provider.model).toBe("first");
  });

  test("exhausting every candidate reports all of them", async () => {
    const provider = createPoolProvider({
      candidates: [candidate("a"), candidate("b")],
      attemptsPerCandidate: 1,
      fetchImpl: stubFetch({ a: "quota", b: "quota" }),
    });

    await expect(provider.generate(request())).rejects.toThrow(/a:.*\n.*b:/s);
  });

  test("an empty pool fails loudly at construction", () => {
    expect(() => createPoolProvider({ candidates: [] })).toThrow(/пуст/);
  });
});

describe("buildOpenRouterCandidates", () => {
  test("makes a candidate for every key × model pair", () => {
    const candidates = buildOpenRouterCandidates({
      env: {
        OPENROUTER_API_KEYS: "k1,k2",
        OPENROUTER_MODELS: "m1:free,m2:free",
      } as NodeJS.ProcessEnv,
    });

    expect(candidates).toHaveLength(4);
    expect(candidates.map((item) => item.model)).toEqual([
      "m1:free",
      "m1:free",
      "m2:free",
      "m2:free",
    ]);
    expect(new Set(candidates.map((item) => item.apiKey))).toEqual(
      new Set(["k1", "k2"]),
    );
  });

  test("defaults to the curated free models", () => {
    const candidates = buildOpenRouterCandidates({
      env: { OPENROUTER_API_KEY: "k" } as NodeJS.ProcessEnv,
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((item) => item.model.endsWith(":free"))).toBe(true);
  });

  test("no key means no candidates rather than a broken one", () => {
    expect(buildOpenRouterCandidates({ env: {} as NodeJS.ProcessEnv })).toEqual(
      [],
    );
  });

  test("never claims native structured outputs", () => {
    // OpenRouter proxies many backends and support varies per model; assuming
    // it works is what silently produced prose instead of JSON before.
    const candidates = buildOpenRouterCandidates({
      env: { OPENROUTER_API_KEY: "k" } as NodeJS.ProcessEnv,
    });

    expect(
      candidates.every((item) => item.supportsStructuredOutputs === false),
    ).toBe(true);
  });
});

describe("исчерпание квоты аккаунта", () => {
  test("дневной лимит выводит из ротации все модели на этом ключе сразу", async () => {
    // OpenRouter метрит бесплатные запросы по аккаунту: получив
    // "free-models-per-day" на одной модели, бессмысленно пробовать остальные
    // на том же ключе — счётчик у них общий.
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(
        JSON.stringify({
          error: {
            message:
              "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock",
          },
        }),
        { status: 429, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const sameKey = (name: string): PoolCandidate => ({
      id: name,
      vendor: "openai-compatible",
      model: name,
      apiKey: "shared-key",
      baseUrl: "https://openrouter.test/v1",
      supportsStructuredOutputs: false,
    });

    const provider = createPoolProvider({
      candidates: [sameKey("a"), sameKey("b"), sameKey("c")],
      attemptsPerCandidate: 1,
      fetchImpl,
    });

    await expect(provider.generate(request())).rejects.toThrow();

    // Первая модель отказала — остальные ушли в кулдаун вместе с ней.
    const cooling = provider.stats().coolingDown;
    expect(Object.keys(cooling).sort()).toEqual(["a", "b", "c"]);
    // И на следующем запросе мы не тратим по вызову на каждую модель заново.
    const callsAfterFirst = calls;
    await expect(provider.generate(request())).rejects.toThrow();
    expect(calls - callsAfterFirst).toBeLessThanOrEqual(3);
  });

  test("отдельные ключи не тянут друг друга в кулдаун", async () => {
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("spent")) {
        return new Response("Rate limit exceeded: free-models-per-day", {
          status: 429,
        });
      }
      return new Response(
        JSON.stringify({
          choices: [
            { message: { content: JSON.stringify({ answer: "fresh" }) } },
          ],
          usage: {},
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const provider = createPoolProvider({
      candidates: [
        {
          id: "spent",
          vendor: "openai-compatible",
          model: "m",
          apiKey: "k1",
          baseUrl: "https://spent.test/v1",
          supportsStructuredOutputs: false,
        },
        {
          id: "fresh",
          vendor: "openai-compatible",
          model: "m",
          apiKey: "k2",
          baseUrl: "https://fresh.test/v1",
          supportsStructuredOutputs: false,
        },
      ],
      attemptsPerCandidate: 1,
      fetchImpl,
    });

    const result = await provider.generate(request());

    expect(result.value.answer).toBe("fresh");
    expect(provider.stats().coolingDown.fresh).toBeUndefined();
  });
});
