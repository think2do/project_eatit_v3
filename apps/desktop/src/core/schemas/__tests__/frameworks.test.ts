import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  InterviewStyleSchema,
  InterviewDirectionSchema,
  InterviewStyleV32Schema,
  InterviewDirectionV32Schema,
  InterviewDurationV32Schema,
  FrameworkStageSchema,
  DirectionFrameworkSchema,
  PredictedCategorySchema,
  PredictedSourceSchema,
  PredictedQuestionSchema,
  PredictedQuestionBankSchema,
} from "../frameworks";

const VALID_ISO = "2024-01-15T10:30:00.000Z";

function makeQuestion(overrides: Partial<{
  category: string;
  question: string;
  why_likely: string;
  related_evidence: string;
}> = {}) {
  return {
    category: "company-business",
    question: "Tell me about this company's business model.",
    why_likely: "JD mentions market expansion.",
    related_evidence: "Resume shows PM experience at a B2C company.",
    ...overrides,
  };
}

function makeQuestions(count: number) {
  return Array.from({ length: count }, (_, i) =>
    makeQuestion({ question: `Question number ${i + 1} about the role and company strategy.` }),
  );
}

function makeValidBank(questionCount: number) {
  return {
    questions: makeQuestions(questionCount),
    generated_at: VALID_ISO,
    sources: ["jd"],
  };
}

describe("frameworks.ts schemas", () => {
  describe("InterviewStyleSchema (v3.1)", () => {
    it("accepts all 3 v3.1 values", () => {
      const values = [
        "friendly_guided",
        "standard_professional",
        "high_pressure_followup",
      ] as const;
      for (const v of values) {
        expect(InterviewStyleSchema.parse(v)).toBe(v);
      }
    });

    it("rejects invalid value", () => {
      expect(() => InterviewStyleSchema.parse("INVALID")).toThrow(z.ZodError);
    });

    it("rejects v3.2 value 'structured' (wrong enum)", () => {
      expect(() => InterviewStyleSchema.parse("structured")).toThrow(z.ZodError);
    });
  });

  describe("InterviewDirectionSchema (v3.1)", () => {
    it("accepts all 3 v3.1 values", () => {
      const values = [
        "role_match",
        "project_deep_dive",
        "behavioral_comprehensive",
      ] as const;
      for (const v of values) {
        expect(InterviewDirectionSchema.parse(v)).toBe(v);
      }
    });

    it("rejects invalid value", () => {
      expect(() => InterviewDirectionSchema.parse("INVALID")).toThrow(z.ZodError);
    });
  });

  describe("InterviewStyleV32Schema (v3.2)", () => {
    it("accepts all 4 v3.2 values", () => {
      const values = ["structured", "pressure", "friendly", "expert"] as const;
      for (const v of values) {
        expect(InterviewStyleV32Schema.parse(v)).toBe(v);
      }
    });

    it("rejects invalid value", () => {
      expect(() => InterviewStyleV32Schema.parse("INVALID")).toThrow(z.ZodError);
    });

    it("rejects v3.1 value 'friendly_guided' (wrong enum)", () => {
      expect(() => InterviewStyleV32Schema.parse("friendly_guided")).toThrow(z.ZodError);
    });
  });

  describe("InterviewDirectionV32Schema (v3.2)", () => {
    it("accepts all 6 v3.2 values", () => {
      const values = [
        "ai-insight",
        "data-driven",
        "cross-func",
        "zero-to-one",
        "user-research",
        "strategy",
      ] as const;
      for (const v of values) {
        expect(InterviewDirectionV32Schema.parse(v)).toBe(v);
      }
    });

    it("rejects invalid value", () => {
      expect(() => InterviewDirectionV32Schema.parse("INVALID")).toThrow(z.ZodError);
    });
  });

  describe("InterviewDurationV32Schema", () => {
    it("accepts valid durations 15, 30, 45, 60", () => {
      for (const v of [15, 30, 45, 60] as const) {
        expect(InterviewDurationV32Schema.parse(v)).toBe(v);
      }
    });

    it("rejects 20 (not a valid duration literal)", () => {
      expect(() => InterviewDurationV32Schema.parse(20)).toThrow(z.ZodError);
    });

    it("rejects 0", () => {
      expect(() => InterviewDurationV32Schema.parse(0)).toThrow(z.ZodError);
    });
  });

  describe("FrameworkStageSchema", () => {
    const validStage = {
      name: "Opening",
      goal: "Set context and build rapport",
      question_budget: 2,
    };

    it("accepts valid stage", () => {
      const result = FrameworkStageSchema.parse(validStage);
      expect(result.name).toBe("Opening");
      expect(result.question_budget).toBe(2);
    });

    it("rejects question_budget < 1 (ge=1)", () => {
      expect(() =>
        FrameworkStageSchema.parse({ ...validStage, question_budget: 0 }),
      ).toThrow(z.ZodError);
    });

    it("rejects extra field via .strict()", () => {
      expect(() =>
        FrameworkStageSchema.parse({ ...validStage, extra: "evil" }),
      ).toThrow(z.ZodError);
    });
  });

  describe("DirectionFrameworkSchema", () => {
    const validFramework = {
      style: "structured",
      direction: "ai-insight",
      duration_minutes: 45,
      stages: [
        { name: "Opening", goal: "Set context", question_budget: 2 },
        { name: "Deep Dive", goal: "Explore projects", question_budget: 5 },
      ],
      focus_points: ["AI strategy", "Data pipeline ownership"],
      risk_points: ["Limited startup experience"],
    };

    it("accepts valid framework with v3.2 style and direction", () => {
      const result = DirectionFrameworkSchema.parse(validFramework);
      expect(result.style).toBe("structured");
      expect(result.direction).toBe("ai-insight");
    });

    it("accepts v3.1 style and direction (union backward-compat)", () => {
      const result = DirectionFrameworkSchema.parse({
        ...validFramework,
        style: "friendly_guided",
        direction: "role_match",
      });
      expect(result.style).toBe("friendly_guided");
      expect(result.direction).toBe("role_match");
    });

    it("accepts mixed v3.2 style with v3.1 direction", () => {
      const result = DirectionFrameworkSchema.parse({
        ...validFramework,
        style: "pressure",
        direction: "project_deep_dive",
      });
      expect(result.style).toBe("pressure");
      expect(result.direction).toBe("project_deep_dive");
    });

    it("rejects duration_minutes < 1", () => {
      expect(() =>
        DirectionFrameworkSchema.parse({ ...validFramework, duration_minutes: 0 }),
      ).toThrow(z.ZodError);
    });

    it("rejects extra field via .strict()", () => {
      expect(() =>
        DirectionFrameworkSchema.parse({ ...validFramework, extra: "evil" }),
      ).toThrow(z.ZodError);
    });

    it("rejects invalid style value", () => {
      expect(() =>
        DirectionFrameworkSchema.parse({ ...validFramework, style: "INVALID" }),
      ).toThrow(z.ZodError);
    });
  });

  describe("PredictedQuestionBankSchema — ★ L0 8-15 lock ★", () => {
    it("accepts exactly 8 questions (min boundary)", () => {
      const result = PredictedQuestionBankSchema.parse(makeValidBank(8));
      expect(result.questions).toHaveLength(8);
    });

    it("accepts exactly 15 questions (max boundary)", () => {
      const result = PredictedQuestionBankSchema.parse(makeValidBank(15));
      expect(result.questions).toHaveLength(15);
    });

    it("rejects 7 questions (below min 8)", () => {
      expect(() =>
        PredictedQuestionBankSchema.parse(makeValidBank(7)),
      ).toThrow(z.ZodError);
    });

    it("rejects 16 questions (above max 15)", () => {
      expect(() =>
        PredictedQuestionBankSchema.parse(makeValidBank(16)),
      ).toThrow(z.ZodError);
    });

    it("rejects empty sources [] (min 1)", () => {
      expect(() =>
        PredictedQuestionBankSchema.parse({
          ...makeValidBank(10),
          sources: [],
        }),
      ).toThrow(z.ZodError);
    });

    it("accepts multiple sources", () => {
      const result = PredictedQuestionBankSchema.parse({
        ...makeValidBank(10),
        sources: ["jd", "resume", "research"],
      });
      expect(result.sources).toHaveLength(3);
    });

    it("rejects extra field via .strict()", () => {
      expect(() =>
        PredictedQuestionBankSchema.parse({
          ...makeValidBank(10),
          extra: "evil",
        }),
      ).toThrow(z.ZodError);
    });
  });

  describe("PredictedQuestionSchema", () => {
    const validQuestion = makeQuestion();

    it("accepts valid question", () => {
      const result = PredictedQuestionSchema.parse(validQuestion);
      expect(result.category).toBe("company-business");
    });

    it("rejects question exceeding max 200 chars", () => {
      expect(() =>
        PredictedQuestionSchema.parse({
          ...validQuestion,
          question: "x".repeat(201),
        }),
      ).toThrow(z.ZodError);
    });

    it("rejects why_likely exceeding max 80 chars", () => {
      expect(() =>
        PredictedQuestionSchema.parse({
          ...validQuestion,
          why_likely: "x".repeat(81),
        }),
      ).toThrow(z.ZodError);
    });

    it("rejects related_evidence exceeding max 120 chars", () => {
      expect(() =>
        PredictedQuestionSchema.parse({
          ...validQuestion,
          related_evidence: "x".repeat(121),
        }),
      ).toThrow(z.ZodError);
    });

    it("rejects invalid category", () => {
      expect(() =>
        PredictedQuestionSchema.parse({
          ...validQuestion,
          category: "INVALID",
        }),
      ).toThrow(z.ZodError);
    });

    it("rejects extra field via .strict()", () => {
      expect(() =>
        PredictedQuestionSchema.parse({ ...validQuestion, extra: "evil" }),
      ).toThrow(z.ZodError);
    });
  });

  describe("PredictedCategorySchema", () => {
    it("accepts all 4 category values", () => {
      const values = [
        "company-business",
        "industry-judgment",
        "project-deepdive",
        "general-pm",
      ] as const;
      for (const v of values) {
        expect(PredictedCategorySchema.parse(v)).toBe(v);
      }
    });
  });

  describe("PredictedSourceSchema", () => {
    it("accepts all 3 source values", () => {
      for (const v of ["jd", "resume", "research"] as const) {
        expect(PredictedSourceSchema.parse(v)).toBe(v);
      }
    });
  });
});
