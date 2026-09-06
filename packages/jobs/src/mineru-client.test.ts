import { afterEach, describe, expect, test } from "bun:test";

import { parseWithMinerU } from "./mineru-client";

const originalFetch = globalThis.fetch;
const baseUrl = "http://mineru.local";

function mockFetch(handler: typeof fetch) {
  globalThis.fetch = handler;
}

function urlPath(input: RequestInfo | URL): string {
  return new URL(String(input)).pathname;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("parseWithMinerU", () => {
  test("reports not-configured when no base URL is available", async () => {
    // No `baseUrl` option and MINERU_SERVICE_URL is unset in this env.
    await expect(parseWithMinerU(Buffer.from("x"), "doc.pdf")).resolves.toEqual(
      { ok: false, reason: "not-configured" },
    );
  });

  test("submits, polls to a terminal status, and returns the result's text", async () => {
    const calls: string[] = [];
    mockFetch(async (input, init) => {
      const path = urlPath(input);
      calls.push(path);
      if (path === "/tasks") {
        const form = init?.body as FormData;
        expect(form.get("backend")).toBe("pipeline");
        expect(form.get("parse_method")).toBe("auto");
        expect(form.get("lang_list")).toBe("east_slavic");
        return Response.json({ task_id: "t1", status: "pending" });
      }
      if (path === "/tasks/t1") {
        return Response.json({ task_id: "t1", status: "completed" });
      }
      if (path === "/tasks/t1/result") {
        return Response.json({
          results: { doc: { md_content: "a".repeat(200) } },
        });
      }
      throw new Error(`unexpected request: ${path}`);
    });

    await expect(
      parseWithMinerU(Buffer.from("x"), "doc.pdf", {
        baseUrl,
        pollIntervalMs: 1,
      }),
    ).resolves.toEqual({ ok: true, text: "a".repeat(200) });
    expect(calls).toEqual(["/tasks", "/tasks/t1", "/tasks/t1/result"]);
  });

  test("accepts a terminal status straight from the submit response", async () => {
    mockFetch(async (input) => {
      const path = urlPath(input);
      if (path === "/tasks") {
        return Response.json({ task_id: "t1", status: "completed" });
      }
      if (path === "/tasks/t1/result") {
        return Response.json({
          results: { doc: { md_content: "a".repeat(200) } },
        });
      }
      throw new Error(`unexpected request: ${path}`);
    });

    await expect(
      parseWithMinerU(Buffer.from("x"), "doc.pdf", { baseUrl }),
    ).resolves.toEqual({ ok: true, text: "a".repeat(200) });
  });

  test("falls back when the result text is too sparse", async () => {
    mockFetch(async (input) => {
      const path = urlPath(input);
      if (path === "/tasks") {
        return Response.json({ task_id: "t1", status: "completed" });
      }
      return Response.json({ results: { doc: { md_content: "  " } } });
    });

    await expect(
      parseWithMinerU(Buffer.from("x"), "doc.pdf", { baseUrl }),
    ).resolves.toEqual({ ok: false, reason: "low-quality" });
  });

  test("surfaces the real reason when MinerU's own backend fails", async () => {
    mockFetch(async () =>
      Response.json({
        task_id: "t1",
        status: "failed",
        error: "No module named 'six'",
      }),
    );

    await expect(
      parseWithMinerU(Buffer.from("x"), "doc.pdf", { baseUrl }),
    ).resolves.toEqual({ ok: false, reason: "No module named 'six'" });
  });

  test("gives up once the overall deadline passes without a terminal status", async () => {
    mockFetch(async (input) => {
      const path = urlPath(input);
      if (path === "/tasks") {
        return Response.json({ task_id: "t1", status: "pending" });
      }
      // Never reaches a terminal status — parseWithMinerU must stop
      // polling once its own deadline (timeoutMs) elapses.
      return Response.json({ task_id: "t1", status: "processing" });
    });

    await expect(
      parseWithMinerU(Buffer.from("x"), "doc.pdf", { baseUrl, timeoutMs: 5 }),
    ).resolves.toEqual({ ok: false, reason: "timeout" });
  });

  test("falls back when the submit response doesn't match MinerU's shape", async () => {
    mockFetch(async () => Response.json({ unexpected: true }));

    await expect(
      parseWithMinerU(Buffer.from("x"), "doc.pdf", { baseUrl }),
    ).resolves.toEqual({ ok: false, reason: "malformed-response" });
  });

  test("falls back on a non-2xx response", async () => {
    mockFetch(async () => new Response("bad", { status: 404 }));

    await expect(
      parseWithMinerU(Buffer.from("x"), "doc.pdf", { baseUrl }),
    ).resolves.toEqual({ ok: false, reason: "http-404" });
  });

  test("falls back when the request throws (service unreachable)", async () => {
    mockFetch(async () => {
      throw new Error("connect ECONNREFUSED");
    });

    await expect(
      parseWithMinerU(Buffer.from("x"), "doc.pdf", { baseUrl }),
    ).resolves.toEqual({ ok: false, reason: "connect ECONNREFUSED" });
  });
});
