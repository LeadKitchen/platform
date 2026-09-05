import { afterEach, describe, expect, test } from "bun:test";

import { parseWithMinerU } from "./mineru-client";

const originalFetch = globalThis.fetch;
const baseUrl = "http://mineru.local";

function mockFetch(handler: typeof fetch) {
  globalThis.fetch = handler;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// Exhaustive response-handling cases live in parser-client.test.ts against
// the shared `parseWithService` this wraps — these just confirm the
// wrapper plumbs its own options/env through correctly.
describe("parseWithMinerU", () => {
  test("reports not-configured when no base URL is available", async () => {
    // No `baseUrl` option and MINERU_SERVICE_URL is unset in this env.
    await expect(parseWithMinerU(Buffer.from("x"), "doc.pdf")).resolves.toEqual(
      { ok: false, reason: "not-configured" },
    );
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
      parseWithMinerU(Buffer.from("x"), "doc.pdf", { baseUrl }),
    ).resolves.toEqual({
      ok: true,
      text: "a".repeat(200),
      pageCount: 2,
      tableCount: 1,
    });
  });
});
