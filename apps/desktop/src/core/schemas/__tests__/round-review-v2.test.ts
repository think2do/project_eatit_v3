/**
 * G-9: round-review-v2 tests — RoundReviewV2Schema all fields, tone enum, score boundaries.
 * Ported from apps/api/tests/agents/test_round_review_v2.py (KEEP).
 * §A0: No Tauri imports. §C3: No secret access.
 */

import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import { RoundReviewV2Schema } from "../reports";

function makeValidV2(overrides: Record<string, unknown> = {}) {
  return {
    turn_index: 0,
    question_tag: "专业知识",
    question_text: "请描述你最近一个产品项目",
    score: 75,
    tone: "ok",
    answer_summary: "候选人描述了数据平台项目,结构清晰",
    ai_feedback: "可在 Result 环节加入量化数据",
    ...overrides,
  };
}

// MARK: - All 7 required fields

describe("RoundReviewV2Schema — 7 required fields (G-9)", () => {
  it("accepts valid RoundReviewV2 with all 7 required fields", () => {
    const result = RoundReviewV2Schema.parse(makeValidV2());
    expect(result.turn_index).toBe(0);
    expect(result.question_tag).toBe("专业知识");
    expect(result.question_text).toBe("请描述你最近一个产品项目");
    expect(result.score).toBe(75);
    expect(result.tone).toBe("ok");
    expect(result.answer_summary).toBe("候选人描述了数据平台项目,结构清晰");
    expect(result.ai_feedback).toBe("可在 Result 环节加入量化数据");
  });

  it("rejects missing turn_index (required field)", () => {
    const { turn_index: _omit, ...rest } = makeValidV2();
    expect(() => RoundReviewV2Schema.parse(rest)).toThrow(ZodError);
  });

  it("rejects missing question_tag (required field)", () => {
    const { question_tag: _omit, ...rest } = makeValidV2();
    expect(() => RoundReviewV2Schema.parse(rest)).toThrow(ZodError);
  });

  it("rejects missing question_text (required field)", () => {
    const { question_text: _omit, ...rest } = makeValidV2();
    expect(() => RoundReviewV2Schema.parse(rest)).toThrow(ZodError);
  });

  it("rejects missing score (required field)", () => {
    const { score: _omit, ...rest } = makeValidV2();
    expect(() => RoundReviewV2Schema.parse(rest)).toThrow(ZodError);
  });

  it("rejects missing tone (required field)", () => {
    const { tone: _omit, ...rest } = makeValidV2();
    expect(() => RoundReviewV2Schema.parse(rest)).toThrow(ZodError);
  });

  it("rejects missing answer_summary (required field)", () => {
    const { answer_summary: _omit, ...rest } = makeValidV2();
    expect(() => RoundReviewV2Schema.parse(rest)).toThrow(ZodError);
  });

  it("rejects missing ai_feedback (required field)", () => {
    const { ai_feedback: _omit, ...rest } = makeValidV2();
    expect(() => RoundReviewV2Schema.parse(rest)).toThrow(ZodError);
  });
});

// MARK: - tone enum 3-value lock

describe("RoundReviewV2Schema — tone enum ['good','ok','warn'] (G-9)", () => {
  it("accepts tone='good'", () => {
    expect(RoundReviewV2Schema.parse(makeValidV2({ tone: "good" })).tone).toBe("good");
  });

  it("accepts tone='ok'", () => {
    expect(RoundReviewV2Schema.parse(makeValidV2({ tone: "ok" })).tone).toBe("ok");
  });

  it("accepts tone='warn'", () => {
    expect(RoundReviewV2Schema.parse(makeValidV2({ tone: "warn" })).tone).toBe("warn");
  });

  it("rejects tone='bad' (not in enum)", () => {
    expect(() => RoundReviewV2Schema.parse(makeValidV2({ tone: "bad" }))).toThrow(ZodError);
  });

  it("rejects tone='neutral' (not in enum)", () => {
    expect(() => RoundReviewV2Schema.parse(makeValidV2({ tone: "neutral" }))).toThrow(ZodError);
  });

  it("rejects tone='' (empty string)", () => {
    expect(() => RoundReviewV2Schema.parse(makeValidV2({ tone: "" }))).toThrow(ZodError);
  });

  it("rejects tone='GOOD' (case-sensitive)", () => {
    expect(() => RoundReviewV2Schema.parse(makeValidV2({ tone: "GOOD" }))).toThrow(ZodError);
  });
});

// MARK: - score boundaries

describe("RoundReviewV2Schema — score boundaries ge=0 le=100 (G-9)", () => {
  it("accepts score=0 (min boundary)", () => {
    expect(RoundReviewV2Schema.parse(makeValidV2({ score: 0 })).score).toBe(0);
  });

  it("accepts score=100 (max boundary)", () => {
    expect(RoundReviewV2Schema.parse(makeValidV2({ score: 100 })).score).toBe(100);
  });

  it("rejects score=-1 (below min 0)", () => {
    expect(() => RoundReviewV2Schema.parse(makeValidV2({ score: -1 }))).toThrow(ZodError);
  });

  it("rejects score=101 (above max 100)", () => {
    expect(() => RoundReviewV2Schema.parse(makeValidV2({ score: 101 }))).toThrow(ZodError);
  });

  it("accepts score=50 (midpoint)", () => {
    expect(RoundReviewV2Schema.parse(makeValidV2({ score: 50 })).score).toBe(50);
  });

  it("rejects non-integer score=75.5 (int constraint)", () => {
    expect(() => RoundReviewV2Schema.parse(makeValidV2({ score: 75.5 }))).toThrow(ZodError);
  });
});

// MARK: - .strict() guard

describe("RoundReviewV2Schema — .strict() rejects extra fields (G-9)", () => {
  it("rejects extra field (PII guard)", () => {
    expect(() =>
      RoundReviewV2Schema.parse(makeValidV2({ candidate_email: "evil@test.com" })),
    ).toThrow(ZodError);
  });
});

// MARK: - turn_index accepts negative values (schema allows int, no min constraint)

describe("RoundReviewV2Schema — turn_index accepts any integer (G-9)", () => {
  it("accepts turn_index=0 (first turn)", () => {
    expect(RoundReviewV2Schema.parse(makeValidV2({ turn_index: 0 })).turn_index).toBe(0);
  });

  it("accepts turn_index=10 (later turn)", () => {
    expect(RoundReviewV2Schema.parse(makeValidV2({ turn_index: 10 })).turn_index).toBe(10);
  });
});
