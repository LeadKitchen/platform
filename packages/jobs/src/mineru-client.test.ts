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

describe("parseWithMinerU", () => {
  test("reports not-configured when no base URL is available", async () => {
    // No `baseUrl` option and MINERU_SERVICE_URL is unset in this env.
    await expect(parseWithMinerU(Buffer.from("x"), "doc.pdf")).resolves.toEqual(
      { ok: false, reason: "not-configured" },
    );
  });

  test("returns the parsed text on a healthy response", async () => {
    mockFetch(async (input, init) => {
      expect(String(input)).toBe("http://mineru.local/file_parse");
      const form = init?.body as FormData;
      expect(form.get("backend")).toBe("pipeline");
      expect(form.get("parse_method")).toBe("auto");
      expect(form.get("lang_list")).toBe("east_slavic");
      return Response.json({
        results: { doc: { md_content: "a".repeat(200) } },
      });
    });

    await expect(
      parseWithMinerU(Buffer.from("x"), "doc.pdf", { baseUrl }),
    ).resolves.toEqual({ ok: true, text: "a".repeat(200) });
  });

  test("falls back when the response text is too sparse", async () => {
    mockFetch(async () =>
      Response.json({ results: { doc: { md_content: "  " } } }),
    );

    await expect(
      parseWithMinerU(Buffer.from("x"), "doc.pdf", { baseUrl }),
    ).resolves.toEqual({ ok: false, reason: "low-quality" });
  });

  test("surfaces the real reason when MinerU's own backend fails", async () => {
    mockFetch(async () =>
      Response.json({ status: "failed", error: "No module named 'six'" }),
    );

    await expect(
      parseWithMinerU(Buffer.from("x"), "doc.pdf", { baseUrl }),
    ).resolves.toEqual({ ok: false, reason: "No module named 'six'" });
  });

  test("falls back when the response doesn't match MinerU's shape", async () => {
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
