import { describe, expect, test } from "bun:test";

import { createMockProvider } from "../provider/mock";
import { classifyChunkAudience } from "./audience-classifier";
import { chunkText } from "./chunk";
import { createEmbeddingProvider } from "./embeddings";

describe("chunkText", () => {
  test("rejects a non-positive target size", () => {
    expect(() => chunkText("text", { targetChars: 0 })).toThrow(RangeError);
    expect(() => chunkText("text", { targetChars: -1 })).toThrow(RangeError);
  });

  test("clamps a negative overlap to zero", () => {
    expect(
      chunkText("abcde\n\nfghij", { targetChars: 5, overlapChars: -10 }),
    ).toEqual([
      { index: 0, text: "abcde" },
      { index: 1, text: "fghij" },
    ]);
  });
});

describe("classifyChunkAudience", () => {
  const chunks = [
    { index: 10, text: "first" },
    { index: 20, text: "second" },
  ];

  test("accepts every requested index exactly once", async () => {
    const provider = createMockProvider(() => ({
      chunks: [
        { index: 20, audience: "both", reason: "neutral" },
        { index: 10, audience: "character", reason: "known fact" },
      ],
    }));

    await expect(classifyChunkAudience(chunks, { provider })).resolves.toEqual([
      { index: 20, audience: "both", reason: "neutral" },
      { index: 10, audience: "character", reason: "known fact" },
    ]);
  });

  test.each([
    [
      { index: 10, audience: "character", reason: "duplicate" },
      { index: 10, audience: "both", reason: "duplicate" },
    ],
    [
      { index: 10, audience: "character", reason: "known" },
      { index: 30, audience: "both", reason: "unknown" },
    ],
    [{ index: 10, audience: "character", reason: "missing" }],
  ])("rejects duplicate, unknown, or missing indexes", async (...response) => {
    const provider = createMockProvider(() => ({ chunks: response }));

    await expect(classifyChunkAudience(chunks, { provider })).rejects.toThrow(
      "Invalid audience classification indexes",
    );
  });
});

describe("createEmbeddingProvider", () => {
  test("rejects models with an incompatible dimension contract", () => {
    expect(() =>
      createEmbeddingProvider({ model: "text-embedding-3-small" }),
    ).toThrow("knowledge vectors require 1024 dimensions");
  });
});
