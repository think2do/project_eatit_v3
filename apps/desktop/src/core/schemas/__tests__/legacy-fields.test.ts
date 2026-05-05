/**
 * G-4: legacy-schema-fields tests.
 * Ported from apps/api/tests/agents/test_legacy_schema_fields.py (KEEP).
 *
 * Verifies that v3.4 TS schemas correctly retain legacy fields from earlier versions:
 * - InterviewReportPayloadSchema accepts pass_probability (int), next_actions (list[str]),
 *   reasons (list) alongside new v3.4 fields.
 * - RoundReviewSchema (legacy, not V2) is still parsable as a standalone type.
 * - v3.1 enum values (InterviewStyle / InterviewDirection) still pass schema parsing.
 *
 * §A0: No Tauri imports. §C3: No secret access.
 */

import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  InterviewReportPayloadSchema,
  RoundReviewSchema,
  RoundReviewV2Schema,
} from "../reports";
import {
  InterviewStyleSchema,
  InterviewDirectionSchema,
  InterviewStyleV32Schema,
  InterviewDirectionV32Schema,
} from "../frameworks";

// MARK: - InterviewReportPayloadSchema accepts legacy fields (G-4)

// Minimal valid RoundReview (legacy) — matches NormalizedQuestion/Answer/Assessment schemas
function makeValidRoundReview() {
  return {
    question: {
      turn_index: 1,
      stage_name: "深挖阶段",
      question_tag: "项目深挖",
      question_text: "请介绍你最近一个项目",
    },
    answer: {
      turn_index: 1,
      transcript_text: "我负责了一个数据平台的设计与落地",
      cleaned_sentences: ["我负责了一个数据平台的设计与落地"],
      key_points: ["数据平台", "设计与落地"],
    },
    assessment: {
      turn_index: 1,
      strengths: ["表达清晰"],
      weaknesses: [],
      risks: [],
      suggestions: ["可加强量化"],
      evidence: [],
    },
  };
}

function makeMinimalPayload(overrides: Record<string, unknown> = {}) {
  return {
    overall_summary: "候选人综合表现良好",
    ...overrides,
  };
}

describe("InterviewReportPayloadSchema — legacy fields retained (G-4)", () => {
  it("accepts pass_probability int field (legacy L0 A10 retained)", () => {
    const result = InterviewReportPayloadSchema.parse(
      makeMinimalPayload({ pass_probability: 72 }),
    );
    expect(result.pass_probability).toBe(72);
  });

  it("accepts pass_probability=0 (min boundary)", () => {
    const result = InterviewReportPayloadSchema.parse(
      makeMinimalPayload({ pass_probability: 0 }),
    );
    expect(result.pass_probability).toBe(0);
  });

  it("accepts pass_probability=100 (max boundary)", () => {
    const result = InterviewReportPayloadSchema.parse(
      makeMinimalPayload({ pass_probability: 100 }),
    );
    expect(result.pass_probability).toBe(100);
  });

  it("rejects pass_probability=-1 (below min 0)", () => {
    expect(() =>
      InterviewReportPayloadSchema.parse(makeMinimalPayload({ pass_probability: -1 })),
    ).toThrow(ZodError);
  });

  it("rejects pass_probability=101 (above max 100)", () => {
    expect(() =>
      InterviewReportPayloadSchema.parse(makeMinimalPayload({ pass_probability: 101 })),
    ).toThrow(ZodError);
  });

  it("accepts next_actions list[str] (legacy field)", () => {
    const result = InterviewReportPayloadSchema.parse(
      makeMinimalPayload({
        next_actions: ["加强结构化表达", "多练习数据驱动回答"],
      }),
    );
    expect(result.next_actions).toHaveLength(2);
    expect(result.next_actions[0]).toBe("加强结构化表达");
  });

  it("accepts empty next_actions [] (default)", () => {
    const result = InterviewReportPayloadSchema.parse(
      makeMinimalPayload({ next_actions: [] }),
    );
    expect(result.next_actions).toEqual([]);
  });

  it("accepts reasons list (legacy field)", () => {
    const result = InterviewReportPayloadSchema.parse(
      makeMinimalPayload({
        reasons: [
          {
            aspect: "专业基础",
            verdict: "solid",
            evidence_turn_index: 0,
            quote: "B2C 产品从 0 到 1",
          },
        ],
      }),
    );
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0].aspect).toBe("专业基础");
  });

  it("accepts all legacy fields together with new v3.4 fields", () => {
    const result = InterviewReportPayloadSchema.parse(
      makeMinimalPayload({
        pass_probability: 65,
        next_actions: ["加强练习"],
        reasons: [
          {
            aspect: "综合表现",
            verdict: "mixed",
            evidence_turn_index: 1,
            quote: "部分回答缺乏数据支撑",
          },
        ],
        pass_likelihood: "中",
        overall_score: 65,
        ai_verdict: "综合表现中等",
      }),
    );
    expect(result.pass_probability).toBe(65);
    expect(result.next_actions).toHaveLength(1);
    expect(result.reasons).toHaveLength(1);
    expect(result.pass_likelihood).toBe("中");
    expect(result.overall_score).toBe(65);
  });

  it("rejects unknown extra field via .strict()", () => {
    expect(() =>
      InterviewReportPayloadSchema.parse(
        makeMinimalPayload({ evil_field: "injection" }),
      ),
    ).toThrow(ZodError);
  });
});

// MARK: - RoundReviewSchema (legacy) still parsable (G-4)

describe("RoundReviewSchema (legacy v3.1) — still parsable as standalone type (G-4)", () => {
  it("parses valid legacy RoundReview with question/answer/assessment", () => {
    const result = RoundReviewSchema.parse(makeValidRoundReview());
    expect(result.question.turn_index).toBe(1);
    expect(result.answer.transcript_text).toBe("我负责了一个数据平台的设计与落地");
  });

  it("rejects extra field via .strict()", () => {
    expect(() =>
      RoundReviewSchema.parse({ ...makeValidRoundReview(), extra: "evil" }),
    ).toThrow(ZodError);
  });
});

// MARK: - v3.1 enum values still pass schema (L0 backward compat) (G-4)

describe("InterviewStyleSchema v3.1 — 3 enum values still parsable (G-4)", () => {
  const V31_STYLES = [
    "friendly_guided",
    "standard_professional",
    "high_pressure_followup",
  ] as const;

  for (const style of V31_STYLES) {
    it(`InterviewStyleSchema.parse("${style}") succeeds (L0 retention)`, () => {
      expect(InterviewStyleSchema.parse(style)).toBe(style);
    });
  }
});

describe("InterviewDirectionSchema v3.1 — 3 enum values still parsable (G-4)", () => {
  const V31_DIRECTIONS = [
    "role_match",
    "project_deep_dive",
    "behavioral_comprehensive",
  ] as const;

  for (const dir of V31_DIRECTIONS) {
    it(`InterviewDirectionSchema.parse("${dir}") succeeds (L0 retention)`, () => {
      expect(InterviewDirectionSchema.parse(dir)).toBe(dir);
    });
  }
});

// MARK: - RoundReviewV2Schema all 7 required fields present (G-9 overlap)

describe("RoundReviewV2Schema — 7 required fields (G-4 / G-9)", () => {
  const VALID_V2 = {
    turn_index: 0,
    question_tag: "专业知识",
    question_text: "请描述你的项目",
    score: 75,
    tone: "ok",
    answer_summary: "回答结构清晰",
    ai_feedback: "可加强数据支撑",
  };

  it("accepts valid RoundReviewV2 with all 7 required fields", () => {
    const result = RoundReviewV2Schema.parse(VALID_V2);
    expect(result.turn_index).toBe(0);
    expect(result.tone).toBe("ok");
    expect(result.score).toBe(75);
  });

  it("rejects missing turn_index (required field)", () => {
    const { turn_index: _omit, ...rest } = VALID_V2;
    expect(() => RoundReviewV2Schema.parse(rest)).toThrow(ZodError);
  });

  it("rejects missing question_tag (required field)", () => {
    const { question_tag: _omit, ...rest } = VALID_V2;
    expect(() => RoundReviewV2Schema.parse(rest)).toThrow(ZodError);
  });

  it("rejects missing ai_feedback (required field)", () => {
    const { ai_feedback: _omit, ...rest } = VALID_V2;
    expect(() => RoundReviewV2Schema.parse(rest)).toThrow(ZodError);
  });
});
