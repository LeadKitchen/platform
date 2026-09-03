import { describe, expect, test } from "bun:test";

import { type ChannelHit, fuseChannels } from "./fusion";

function hit(id: string, score: number, text = id): ChannelHit {
  return { id, score, text, source: "test" };
}

describe("fuseChannels", () => {
  test("returns nothing when every channel is empty", () => {
    expect(fuseChannels({ channels: [[], [], [], []], pool: 5 })).toEqual([]);
  });

  test("an id ranked highly in two channels outranks one only a single channel likes", () => {
    // "shared" is rank 0 in both lexical and vector; "lexical-only" is rank 0
    // in lexical alone. RRF sums 1/(60+rank) across channels, so "shared"
    // must come out on top even though "lexical-only" also holds a rank-0 spot.
    const lexical = [hit("shared", 10), hit("lexical-only", 9)];
    const vector = [hit("shared", 0.9), hit("vector-only", 0.5)];

    const result = fuseChannels({ channels: [lexical, vector], pool: 10 });

    expect(result[0]?.id).toBe("shared");
    expect(result.map((snippet) => snippet.id)).toEqual(
      expect.arrayContaining(["shared", "lexical-only", "vector-only"]),
    );
  });

  test("normalizes scores to 0..1 against the top fused score", () => {
    const result = fuseChannels({
      channels: [[hit("a", 1), hit("b", 1)]],
      pool: 10,
    });

    expect(result[0]?.score).toBe(1);
    expect(result[1]?.score).toBeGreaterThan(0);
    expect(result[1]?.score).toBeLessThan(1);
  });

  test("truncates to pool size", () => {
    const channel = Array.from({ length: 20 }, (_, index) =>
      hit(`id-${index}`, 20 - index),
    );

    expect(fuseChannels({ channels: [channel], pool: 3 })).toHaveLength(3);
  });

  test("channels that never overlap still all contribute (graph/facts alongside lexical/vector)", () => {
    const lexical = [hit("chunk-1", 5)];
    const vector = [hit("chunk-2", 0.8)];
    const graph = [hit("edge-1->edge-2", 1, "employee knows rule")];
    const facts = [hit("fact-1", 1, "срок изготовления — 72 часа")];

    const result = fuseChannels({
      channels: [lexical, vector, graph, facts],
      pool: 10,
    });

    expect(result.map((snippet) => snippet.id).sort()).toEqual(
      ["chunk-1", "chunk-2", "edge-1->edge-2", "fact-1"].sort(),
    );
  });

  test("the first channel to mention an id wins its text/source", () => {
    const lexical = [
      { id: "x", score: 1, text: "lexical text", source: "org-lexical" },
    ];
    const vector = [
      { id: "x", score: 1, text: "vector text", source: "org-vector" },
    ];

    const result = fuseChannels({ channels: [lexical, vector], pool: 5 });

    expect(result[0]).toMatchObject({
      text: "lexical text",
      source: "org-lexical",
    });
  });
});
