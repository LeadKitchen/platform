import { afterEach, describe, expect, test } from "bun:test";

import { parseWithDocling } from "./docling-client";

const originalFetch = globalThis.fetch;
const baseUrl = "http://docling.local";

function mockFetch(handler: typeof fetch) {
  globalThis.fetch = handler;
}

function urlPath(input: RequestInfo | URL): string {
  return new URL(String(input)).pathname;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("parseWithDocling", () => {
  test("reports not-configured when no base URL is available", async () => {
    // No `baseUrl` option and DOCLING_SERVICE_URL is unset in this env.
    await expect(
      parseWithDocling(Buffer.from("x"), "doc.pdf"),
    ).resolves.toEqual({ ok: false, reason: "not-configured" });
  });

  test("submits, polls to a terminal status, and returns the result's text", async () => {
    const calls: string[] = [];
    mockFetch(async (input) => {
      const path = urlPath(input);
      calls.push(path);
      if (path === "/v1/convert/file/async") {
        return Response.json({ task_id: "t1", task_status: "started" });
      }
      if (path === "/v1/status/poll/t1") {
        return Response.json({ task_id: "t1", task_status: "success" });
      }
      if (path === "/v1/result/t1") {
        return Response.json({
          status: "success",
          document: { md_content: "a".repeat(200) },
        });
      }
      throw new Error(`unexpected request: ${path}`);
    });

    await expect(
      parseWithDocling(Buffer.from("x"), "doc.pdf", { baseUrl }),
    ).resolves.toEqual({ ok: true, text: "a".repeat(200) });
    expect(calls).toEqual([
      "/v1/convert/file/async",
      "/v1/status/poll/t1",
      "/v1/result/t1",
    ]);
  });

  test("accepts a terminal status straight from the submit response", async () => {
    mockFetch(async (input) => {
      const path = urlPath(input);
      if (path === "/v1/convert/file/async") {
        return Response.json({ task_id: "t1", task_status: "success" });
      }
      if (path === "/v1/result/t1") {
        return Response.json({
          status: "success",
          document: { md_content: "a".repeat(200) },
        });
      }
      throw new Error(`unexpected request: ${path}`);
    });

    await expect(
      parseWithDocling(Buffer.from("x"), "doc.pdf", { baseUrl }),
    ).resolves.toEqual({ ok: true, text: "a".repeat(200) });
  });

  test("falls back when the result text is too sparse", async () => {
    mockFetch(async (input) => {
      const path = urlPath(input);
      if (path === "/v1/convert/file/async") {
        return Response.json({ task_id: "t1", task_status: "success" });
      }
      return Response.json({
        status: "success",
        document: { md_content: "  " },
      });
    });

    await expect(
      parseWithDocling(Buffer.from("x"), "doc.pdf", { baseUrl }),
    ).resolves.toEqual({ ok: false, reason: "low-quality" });
  });

  test("surfaces the real reason when the task fails", async () => {
    mockFetch(async (input) => {
      const path = urlPath(input);
      if (path === "/v1/convert/file/async") {
        return Response.json({ task_id: "t1", task_status: "failure" });
      }
      return Response.json({
        kind: "TaskFailureResult",
        failure: {
          category: "internal",
          message: "conversion crashed",
          retryable: false,
          phase: "convert",
        },
      });
    });

    await expect(
      parseWithDocling(Buffer.from("x"), "doc.pdf", { baseUrl }),
    ).resolves.toEqual({ ok: false, reason: "conversion crashed" });
  });

  test("gives up once the overall deadline passes without a terminal status", async () => {
    mockFetch(async (input) => {
      const path = urlPath(input);
      if (path === "/v1/convert/file/async") {
        return Response.json({ task_id: "t1", task_status: "pending" });
      }
      // Never reaches a terminal status — parseWithDocling must stop
      // polling once its own deadline (timeoutMs) elapses.
      return Response.json({ task_id: "t1", task_status: "started" });
    });

    await expect(
      parseWithDocling(Buffer.from("x"), "doc.pdf", { baseUrl, timeoutMs: 5 }),
    ).resolves.toEqual({ ok: false, reason: "timeout" });
  });

  test("falls back when the submit response doesn't match docling-serve's shape", async () => {
    mockFetch(async () => Response.json({ unexpected: true }));

    await expect(
      parseWithDocling(Buffer.from("x"), "doc.pdf", { baseUrl }),
    ).resolves.toEqual({ ok: false, reason: "malformed-response" });
  });

  test("falls back on a non-2xx response", async () => {
    mockFetch(async () => new Response("bad", { status: 404 }));

    await expect(
      parseWithDocling(Buffer.from("x"), "doc.pdf", { baseUrl }),
    ).resolves.toEqual({ ok: false, reason: "http-404" });
  });

  test("falls back when the request throws (service unreachable)", async () => {
    mockFetch(async () => {
      throw new Error("connect ECONNREFUSED");
    });

    await expect(
      parseWithDocling(Buffer.from("x"), "doc.pdf", { baseUrl }),
    ).resolves.toEqual({ ok: false, reason: "connect ECONNREFUSED" });
  });
});
