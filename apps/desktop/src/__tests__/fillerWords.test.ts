import { describe, it, expect } from "vitest";

import { FILLER_WORDS_CN, FILLER_WORDS_LENGTH } from "@/lib/fillerWords";

describe("FILLER_WORDS_CN — L0 lock (red line A9)", () => {
  it("declared length is exactly 7", () => {
    expect(FILLER_WORDS_LENGTH).toBe(7);
  });

  it("array length matches declared length", () => {
    expect(FILLER_WORDS_CN.length).toBe(FILLER_WORDS_LENGTH);
  });

  it("contains the exact 7 specified words (no add / no remove)", () => {
    expect(new Set(FILLER_WORDS_CN)).toEqual(
      new Set(["嗯", "呃", "那个", "就是", "这个", "反正", "然后然后"]),
    );
  });

  it("preserves the spec ordering (so backend grep stays in lockstep)", () => {
    expect([...FILLER_WORDS_CN]).toEqual([
      "嗯",
      "呃",
      "那个",
      "就是",
      "这个",
      "反正",
      "然后然后",
    ]);
  });

  it("has no duplicates", () => {
    expect(new Set(FILLER_WORDS_CN).size).toBe(FILLER_WORDS_CN.length);
  });
});
