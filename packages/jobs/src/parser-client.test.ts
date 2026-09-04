import { afterEach, describe, expect, test } from "bun:test";

import { parseWithService } from "./parser-client";

const originalFetch = globalThis.fetch;
const baseUrl = "http://parser.local";

function mockFetch(handler: typeof fetch) {
  globalThis.fetch = handler;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("parseWithService", () => {
  test("reports not-configured when no base URL is given", async () => {
    await expect(
      parseWithService({
        baseUrl: undefined,
        timeoutMs: 1000,
        buffer: Buffer.from("x"),
        filename: "doc.pdf",
      }),
    ).resolves.toEqual({ ok: false, reason: "not-configured" });
  });

  test("returns the parsed text on a healthy response", async () => {
    mockFetch(async () =>
      Response.json({
        text: "a".repeat(200),
        page_count: 2,
        table_count: 1,
        avg_chars_per_page: 100,
      }),
    );

    await expect(
      parseWithService({
        baseUrl,
        timeoutMs: 1000,
        buffer: Buffer.from("x"),
        filename: "doc.pdf",
      }),
    ).resolves.toEqual({
      ok: true,
      text: "a".repeat(200),
      pageCount: 2,
      tableCount: 1,
    });
  });

  test("falls back when the response text is too sparse", async () => {
    mockFetch(async () =>
      Response.json({
        text: "",
        page_count: 3,
        table_count: 0,
        avg_chars_per_page: 0,
      }),
    );

    await expect(
      parseWithService({
        baseUrl,
        timeoutMs: 1000,
        buffer: Buffer.from("x"),
        filename: "doc.pdf",
      }),
    ).resolves.toEqual({ ok: false, reason: "low-quality" });
  });

  test.each([
    ["text", { page_count: 2, table_count: 1, avg_chars_per_page: 100 }],
    [
      "page_count",
      { text: "a".repeat(200), table_count: 1, avg_chars_per_page: 100 },
    ],
    [
      "table_count",
      { text: "a".repeat(200), page_count: 2, avg_chars_per_page: 100 },
    ],
    [
      "avg_chars_per_page",
      { text: "a".repeat(200), page_count: 2, table_count: 1 },
    ],
  ])(
    "falls back when %s is missing from the response",
    async (_field, body) => {
      mockFetch(async () => Response.json(body));

      await expect(
        parseWithService({
          baseUrl,
          timeoutMs: 1000,
          buffer: Buffer.from("x"),
          filename: "doc.pdf",
        }),
      ).resolves.toEqual({ ok: false, reason: "malformed-response" });
    },
  );

  test("falls back on a non-2xx response", async () => {
    mockFetch(async () => new Response("bad", { status: 422 }));

    await expect(
      parseWithService({
        baseUrl,
        timeoutMs: 1000,
        buffer: Buffer.from("x"),
        filename: "doc.pdf",
      }),
    ).resolves.toEqual({ ok: false, reason: "http-422" });
  });

  test("falls back when the request throws (service unreachable)", async () => {
    mockFetch(async () => {
      throw new Error("connect ECONNREFUSED");
    });

    await expect(
      parseWithService({
        baseUrl,
        timeoutMs: 1000,
        buffer: Buffer.from("x"),
        filename: "doc.pdf",
      }),
    ).resolves.toEqual({ ok: false, reason: "connect ECONNREFUSED" });
  });
});
