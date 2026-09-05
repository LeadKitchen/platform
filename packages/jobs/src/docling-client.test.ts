import { afterEach, describe, expect, test } from "bun:test";

import { parseWithDocling } from "./docling-client";

const originalFetch = globalThis.fetch;
const baseUrl = "http://docling.local";

function mockFetch(handler: typeof fetch) {
  globalThis.fetch = handler;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// Exhaustive response-handling cases (malformed fields, low quality, HTTP
// and network errors) live in parser-client.test.ts against the shared
// `parseWithService` both this and mineru-client.ts wrap — these just
// confirm the wrapper plumbs its own options/env through correctly.
describe("parseWithDocling", () => {
  test("reports not-configured when no base URL is available", async () => {
    // No `baseUrl` option and DOCLING_SERVICE_URL is unset in this env.
    await expect(
      parseWithDocling(Buffer.from("x"), "doc.pdf"),
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
      parseWithDocling(Buffer.from("x"), "doc.pdf", { baseUrl }),
    ).resolves.toEqual({
      ok: true,
      text: "a".repeat(200),
      pageCount: 2,
      tableCount: 1,
    });
  });
});
