import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { csvField } from "./csv";

describe("csvField", () => {
  for (const [value, expected] of [
    ["\t=1+1", `"'\t=1+1"`],
    ["\r=1+1", `"'\r=1+1"`],
    ["\n=1+1", `"'\n=1+1"`],
  ] as const) {
    it(`neutralizes and quotes ${JSON.stringify(value)}`, () => {
      assert.equal(csvField(value), expected);
    });
  }

  it("preserves formula and CSV escaping behavior", () => {
    assert.equal(csvField("=1+1"), `"'=1+1"`);
    assert.equal(csvField('say "hello", please'), `"say ""hello"", please"`);
    assert.equal(csvField("plain text"), "plain text");
  });
});
