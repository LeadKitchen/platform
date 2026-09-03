import { describe, expect, test } from "bun:test";

import { createMockProvider } from "../provider/mock";
import type { KnowledgeSnippet } from "../types";
import { rerankSnippets } from "./rerank";

function snippet(id: string): KnowledgeSnippet {
  return { id, text: `text ${id}`, score: 1, source: "test" };
}

describe("rerankSnippets", () => {
  test("skips the model call when there are no more candidates than topK", async () => {
    const provider = createMockProvider(() => {
      throw new Error("should not be called");
    });
    const candidates = [snippet("a"), snippet("b")];

    const result = await rerankSnippets({
      provider,
      query: "q",
      candidates,
      topK: 2,
    });

    expect(result.reranked).toBe(false);
    expect(result.rerankReason).toBeDefined();
    expect(result.snippets).toEqual(candidates);
  });

  test("reorders candidates per the model's returned index order", async () => {
    const provider = createMockProvider(() => ({ order: [2, 0] }));
    const candidates = [snippet("a"), snippet("b"), snippet("c")];

    const result = await rerankSnippets({
      provider,
      query: "q",
      candidates,
      topK: 2,
    });

    expect(result.reranked).toBe(true);
    expect(result.snippets.map((s) => s.id)).toEqual(["c", "a"]);
  });

  test("always keeps the pinned snippet even if the model drops it", async () => {
    const provider = createMockProvider(() => ({ order: [1] }));
    const candidates = [snippet("profile:anna"), snippet("b"), snippet("c")];

    const result = await rerankSnippets({
      provider,
      query: "q",
      candidates,
      topK: 1,
      pinId: "profile:anna",
    });

    expect(result.snippets.map((s) => s.id)).toContain("profile:anna");
  });

  test("falls back to the deterministic order when the model returns no usable indexes", async () => {
    const provider = createMockProvider(() => ({ order: [] }));
    const candidates = [snippet("a"), snippet("b"), snippet("c")];

    const result = await rerankSnippets({
      provider,
      query: "q",
      candidates,
      topK: 2,
    });

    expect(result.reranked).toBe(false);
    expect(result.snippets.map((s) => s.id)).toEqual(["a", "b"]);
  });

  test("degrades to the deterministic order when the model call throws", async () => {
    const provider = createMockProvider(() => {
      throw new Error("gateway down");
    });
    const candidates = [snippet("a"), snippet("b"), snippet("c")];

    const result = await rerankSnippets({
      provider,
      query: "q",
      candidates,
      topK: 2,
    });

    expect(result.rerankFailed).toBe(true);
    expect(result.snippets.map((s) => s.id)).toEqual(["a", "b"]);
  });
});
