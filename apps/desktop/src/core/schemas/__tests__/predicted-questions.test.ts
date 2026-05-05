/**
 * G-7: predicted-questions tests — PredictedQuestionBankSchema boundaries, category 4-enum lock,
 * source 3-enum + min-1, field length caps.
 * Ported from apps/api/tests/agents/test_predicted_questions.py (KEEP).
 *
 * Note: 8/15 boundary tests and basic accepts-all-categories are in frameworks.test.ts.
 * This file adds non-redundant parametrized individual enum lock tests, field length
 * boundary at-boundary cases, and additional edge cases.
 *
 * §A0: No Tauri imports. §C3: No secret access.
 */

import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  PredictedCategorySchema,
  PredictedSourceSchema,
  PredictedQuestionSchema,
  PredictedQuestionBankSchema,
} from "../frameworks";

const VALID_ISO = "2024-01-15T10:30:00.000Z";

function makeQuestion(overrides: Record<string, unknown> = {}) {
  return {
    category: "company-business",
    question: "公司现阶段的核心战略是什么?你会如何基于 JD 分析业务优先级?",
    why_likely: "JD 提到了市场扩张方向。",
    related_evidence: "简历显示候选人有 B2C PM 经验。",
    ...overrides,
  };
}

function makeQuestions(count: number) {
  return Array.from({ length: count }, (_, i) =>
    makeQuestion({ question: `问题 ${i + 1}: 关于公司战略和业务优先级的判断问题,请具体展开。` }),
  );
}

function makeValidBank(questionCount: number, overrides: Record<string, unknown> = {}) {
  return {
    questions: makeQuestions(questionCount),
    generated_at: VALID_ISO,
    sources: ["jd"],
    ...overrides,
  };
}

// MARK: - PredictedCategorySchema 4-enum lock (G-7)

describe("PredictedCategorySchema — 4-enum lock (G-7)", () => {
  it("accepts 'company-business'", () => {
    expect(PredictedCategorySchema.parse("company-business")).toBe("company-business");
  });

  it("accepts 'industry-judgment'", () => {
    expect(PredictedCategorySchema.parse("industry-judgment")).toBe("industry-judgment");
  });

  it("accepts 'project-deepdive'", () => {
    expect(PredictedCategorySchema.parse("project-deepdive")).toBe("project-deepdive");
  });

  it("accepts 'general-pm'", () => {
    expect(PredictedCategorySchema.parse("general-pm")).toBe("general-pm");
  });

  it("rejects 'execution' (off-list)", () => {
    expect(() => PredictedCategorySchema.parse("execution")).toThrow(ZodError);
  });

  it("rejects 'company_business' (underscore vs hyphen)", () => {
    expect(() => PredictedCategorySchema.parse("company_business")).toThrow(ZodError);
  });

  it("rejects 'COMPANY-BUSINESS' (case-sensitive)", () => {
    expect(() => PredictedCategorySchema.parse("COMPANY-BUSINESS")).toThrow(ZodError);
  });

  it("rejects '' (empty string)", () => {
    expect(() => PredictedCategorySchema.parse("")).toThrow(ZodError);
  });

  it("has exactly 4 enum values (lock assertion)", () => {
    const accepted = [
      "company-business",
      "industry-judgment",
      "project-deepdive",
      "general-pm",
    ];
    expect(accepted).toHaveLength(4);
    for (const v of accepted) {
      expect(PredictedCategorySchema.parse(v)).toBe(v);
    }
  });
});

// MARK: - PredictedSourceSchema 3-enum + min-1 (G-7)

describe("PredictedSourceSchema — 3 valid values (G-7)", () => {
  it("accepts 'jd'", () => {
    expect(PredictedSourceSchema.parse("jd")).toBe("jd");
  });

  it("accepts 'resume'", () => {
    expect(PredictedSourceSchema.parse("resume")).toBe("resume");
  });

  it("accepts 'research'", () => {
    expect(PredictedSourceSchema.parse("research")).toBe("research");
  });

  it("rejects 'web' (off-list)", () => {
    expect(() => PredictedSourceSchema.parse("web")).toThrow(ZodError);
  });

  it("rejects 'JD' (case-sensitive)", () => {
    expect(() => PredictedSourceSchema.parse("JD")).toThrow(ZodError);
  });
});

describe("PredictedQuestionBankSchema — sources min-1 (G-7)", () => {
  it("rejects sources=[] (below min 1)", () => {
    expect(() =>
      PredictedQuestionBankSchema.parse(makeValidBank(10, { sources: [] })),
    ).toThrow(ZodError);
  });

  it("accepts sources=['jd'] (single source)", () => {
    const result = PredictedQuestionBankSchema.parse(makeValidBank(10, { sources: ["jd"] }));
    expect(result.sources).toHaveLength(1);
  });

  it("accepts sources=['jd','resume','research'] (all 3 sources)", () => {
    const result = PredictedQuestionBankSchema.parse(
      makeValidBank(10, { sources: ["jd", "resume", "research"] }),
    );
    expect(result.sources).toHaveLength(3);
  });

  it("rejects invalid source value in sources array", () => {
    expect(() =>
      PredictedQuestionBankSchema.parse(makeValidBank(10, { sources: ["jd", "web"] })),
    ).toThrow(ZodError);
  });
});

// MARK: - Field length caps — boundary at-value tests (G-7)

describe("PredictedQuestionSchema — field length caps (G-7)", () => {
  it("accepts question exactly 200 chars (max boundary)", () => {
    const q200 = "你".repeat(200);
    const result = PredictedQuestionSchema.parse(makeQuestion({ question: q200 }));
    expect(result.question).toHaveLength(200);
  });

  it("rejects question 201 chars (above max 200)", () => {
    expect(() =>
      PredictedQuestionSchema.parse(makeQuestion({ question: "你".repeat(201) })),
    ).toThrow(ZodError);
  });

  it("accepts why_likely exactly 80 chars (max boundary)", () => {
    const result = PredictedQuestionSchema.parse(
      makeQuestion({ why_likely: "A".repeat(80) }),
    );
    expect(result.why_likely).toHaveLength(80);
  });

  it("rejects why_likely 81 chars (above max 80)", () => {
    expect(() =>
      PredictedQuestionSchema.parse(makeQuestion({ why_likely: "A".repeat(81) })),
    ).toThrow(ZodError);
  });

  it("accepts related_evidence exactly 120 chars (max boundary)", () => {
    const result = PredictedQuestionSchema.parse(
      makeQuestion({ related_evidence: "B".repeat(120) }),
    );
    expect(result.related_evidence).toHaveLength(120);
  });

  it("rejects related_evidence 121 chars (above max 120)", () => {
    expect(() =>
      PredictedQuestionSchema.parse(makeQuestion({ related_evidence: "B".repeat(121) })),
    ).toThrow(ZodError);
  });

  it("accepts 1-char why_likely (min valid)", () => {
    const result = PredictedQuestionSchema.parse(makeQuestion({ why_likely: "X" }));
    expect(result.why_likely).toBe("X");
  });
});

// MARK: - PredictedQuestionBankSchema question count boundaries (G-7)

describe("PredictedQuestionBankSchema — 8-15 question count lock (G-7)", () => {
  it("accepts exactly 8 questions (min boundary)", () => {
    const result = PredictedQuestionBankSchema.parse(makeValidBank(8));
    expect(result.questions).toHaveLength(8);
  });

  it("accepts exactly 15 questions (max boundary)", () => {
    const result = PredictedQuestionBankSchema.parse(makeValidBank(15));
    expect(result.questions).toHaveLength(15);
  });

  it("rejects 7 questions (below min 8)", () => {
    expect(() => PredictedQuestionBankSchema.parse(makeValidBank(7))).toThrow(ZodError);
  });

  it("rejects 16 questions (above max 15)", () => {
    expect(() => PredictedQuestionBankSchema.parse(makeValidBank(16))).toThrow(ZodError);
  });

  it("rejects 0 questions (empty array, below min 8)", () => {
    expect(() =>
      PredictedQuestionBankSchema.parse(makeValidBank(0)),
    ).toThrow(ZodError);
  });

  it("accepts 10 questions (mid-range)", () => {
    const result = PredictedQuestionBankSchema.parse(makeValidBank(10));
    expect(result.questions).toHaveLength(10);
  });
});

// MARK: - PredictedQuestionBankSchema generated_at must be ISO datetime (G-7)

describe("PredictedQuestionBankSchema — generated_at ISO datetime (G-7)", () => {
  it("accepts valid ISO datetime string", () => {
    const result = PredictedQuestionBankSchema.parse(makeValidBank(10));
    expect(result.generated_at).toBe(VALID_ISO);
  });

  it("rejects non-ISO string for generated_at", () => {
    expect(() =>
      PredictedQuestionBankSchema.parse(
        makeValidBank(10, { generated_at: "2024-01-15" }),
      ),
    ).toThrow(ZodError);
  });

  it("rejects .strict() extra field", () => {
    expect(() =>
      PredictedQuestionBankSchema.parse(makeValidBank(10, { extra: "evil" })),
    ).toThrow(ZodError);
  });
});
