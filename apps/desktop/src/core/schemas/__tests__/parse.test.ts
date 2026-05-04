import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  JobRequirementSchema,
  CandidateHighlightSchema,
  CandidateRiskSchema,
  ProjectHookSchema,
  MatchScoreSchema,
  MatchAdvantageSchema,
  GapSchema,
  InterviewFocusSchema,
  ProjectHookV32Schema,
  CandidateProfileSchema,
  ParseResultPayloadSchema,
  ParseRequestResponseSchema,
  ParseResultResponseSchema,
  ParseResultPreviewSchema,
} from "../parse";

const VALID_UUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_UUID2 = "550e8400-e29b-41d4-a716-446655440000";
const VALID_ISO = "2024-01-15T10:30:00.000Z";
const VALID_ISO2 = "2024-01-15T11:00:00.000Z";

// Minimal valid ParseResultPayload — all optional fields omitted, arrays use defaults
function makeMinimalPayload() {
  return {};
}

// Full valid ParseResultPayload
function makeFullPayload(overrides: Record<string, unknown> = {}) {
  return {
    job_requirements: [],
    candidate_highlights: [],
    candidate_risks: [],
    project_hooks: [],
    match_summary: null,
    candidate_profile: null,
    match_score: null,
    profile_summary: null,
    match_advantages: [],
    gaps: [],
    interview_focus: [],
    project_hooks_v32: [],
    jd_company_name: null,
    jd_role_title: null,
    jd_industry_hints: [],
    ...overrides,
  };
}

function makeValidTimestampedBase() {
  return {
    id: VALID_UUID,
    created_at: VALID_ISO,
    updated_at: VALID_ISO2,
  };
}

function makeQuestions(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    category: "company-business",
    question: `Question number ${i + 1} about the role and strategy of the organization.`,
    why_likely: "JD mentions market expansion.",
    related_evidence: "Resume shows PM experience at a B2C company.",
  }));
}

function makeValidBank(questionCount: number) {
  return {
    questions: makeQuestions(questionCount),
    generated_at: VALID_ISO,
    sources: ["jd"],
  };
}

describe("parse.ts schemas", () => {
  describe("MatchScoreSchema — cross-field refine (★ semantic L0 ★)", () => {
    it("score=50 + level=LOW — valid (score < 60 → LOW)", () => {
      const result = MatchScoreSchema.parse({ score: 50, level: "LOW", one_line: "Below average match" });
      expect(result.level).toBe("LOW");
    });

    it("score=50 + level=MID — invalid (score < 60 must be LOW)", () => {
      expect(() =>
        MatchScoreSchema.parse({ score: 50, level: "MID", one_line: "Below average match" }),
      ).toThrow(z.ZodError);
    });

    it("score=70 + level=MID — valid (60 ≤ score < 76 → MID)", () => {
      const result = MatchScoreSchema.parse({ score: 70, level: "MID", one_line: "Moderate match" });
      expect(result.level).toBe("MID");
    });

    it("score=70 + level=HIGH — invalid (score < 76 must be MID)", () => {
      expect(() =>
        MatchScoreSchema.parse({ score: 70, level: "HIGH", one_line: "Moderate match" }),
      ).toThrow(z.ZodError);
    });

    it("score=80 + level=HIGH — valid (score ≥ 76 → HIGH)", () => {
      const result = MatchScoreSchema.parse({ score: 80, level: "HIGH", one_line: "Strong match" });
      expect(result.level).toBe("HIGH");
    });

    it("score=80 + level=LOW — invalid (score ≥ 76 must be HIGH)", () => {
      expect(() =>
        MatchScoreSchema.parse({ score: 80, level: "LOW", one_line: "Strong match" }),
      ).toThrow(z.ZodError);
    });

    it("score=59 + level=LOW — valid (boundary: 59 < 60 → LOW)", () => {
      expect(MatchScoreSchema.parse({ score: 59, level: "LOW", one_line: "Near threshold" }).level).toBe("LOW");
    });

    it("score=60 + level=MID — valid (boundary: 60 ≥ 60 → MID)", () => {
      expect(MatchScoreSchema.parse({ score: 60, level: "MID", one_line: "At threshold" }).level).toBe("MID");
    });

    it("score=75 + level=MID — valid (boundary: 75 < 76 → MID)", () => {
      expect(MatchScoreSchema.parse({ score: 75, level: "MID", one_line: "Near high threshold" }).level).toBe("MID");
    });

    it("score=76 + level=HIGH — valid (boundary: 76 ≥ 76 → HIGH)", () => {
      expect(MatchScoreSchema.parse({ score: 76, level: "HIGH", one_line: "At high threshold" }).level).toBe("HIGH");
    });

    it("rejects one_line exceeding max 80 chars", () => {
      expect(() =>
        MatchScoreSchema.parse({ score: 80, level: "HIGH", one_line: "x".repeat(81) }),
      ).toThrow(z.ZodError);
    });

    it("rejects score > 100", () => {
      expect(() =>
        MatchScoreSchema.parse({ score: 101, level: "HIGH", one_line: "overflow" }),
      ).toThrow(z.ZodError);
    });

    it("rejects score < 0", () => {
      expect(() =>
        MatchScoreSchema.parse({ score: -1, level: "LOW", one_line: "negative" }),
      ).toThrow(z.ZodError);
    });

    it("rejects extra field via .strict()", () => {
      expect(() =>
        MatchScoreSchema.parse({ score: 80, level: "HIGH", one_line: "ok", extra: "evil" }),
      ).toThrow(z.ZodError);
    });
  });

  describe("ParseResultPayloadSchema", () => {
    it("accepts minimal empty payload (all defaults)", () => {
      const result = ParseResultPayloadSchema.parse(makeMinimalPayload());
      expect(result.job_requirements).toEqual([]);
      expect(result.match_advantages).toEqual([]);
      expect(result.jd_industry_hints).toEqual([]);
    });

    it("accepts full valid payload", () => {
      const result = ParseResultPayloadSchema.parse(makeFullPayload());
      expect(result.jd_company_name).toBeNull();
      expect(result.jd_role_title).toBeNull();
      expect(result.jd_industry_hints).toEqual([]);
    });

    it("rejects extra field via .strict()", () => {
      expect(() =>
        ParseResultPayloadSchema.parse(makeFullPayload({ unknown_field: "evil" })),
      ).toThrow(z.ZodError);
    });

    it("rejects interview_focus.length > 3", () => {
      const tooMany = Array.from({ length: 4 }, () => ({
        direction_id: "ai-insight",
        priority: "high",
        title: "Focus area",
        description: "A description of the focus area for the interview.",
      }));
      expect(() =>
        ParseResultPayloadSchema.parse(makeFullPayload({ interview_focus: tooMany })),
      ).toThrow(z.ZodError);
    });

    it("rejects gaps.length > 5", () => {
      const tooMany = Array.from({ length: 6 }, () => ({
        label: "Skill gap",
        tag: "需补充",
        evidence: "Candidate lacks experience in this domain area.",
      }));
      expect(() =>
        ParseResultPayloadSchema.parse(makeFullPayload({ gaps: tooMany })),
      ).toThrow(z.ZodError);
    });

    it("rejects match_advantages.length > 5", () => {
      const tooMany = Array.from({ length: 6 }, () => ({
        label: "Advantage",
        tag: "强匹配",
        evidence: "Candidate has strong experience in this domain area.",
      }));
      expect(() =>
        ParseResultPayloadSchema.parse(makeFullPayload({ match_advantages: tooMany })),
      ).toThrow(z.ZodError);
    });

    describe("★ L0 privacy guard — jd_* fields ★", () => {
      it("jd_company_name accepts exactly 80 chars (max boundary)", () => {
        const result = ParseResultPayloadSchema.parse(
          makeFullPayload({ jd_company_name: "Acme Corp".padEnd(80, "X") }),
        );
        expect(result.jd_company_name).toHaveLength(80);
      });

      it("jd_company_name rejects 81-char string (§A0.4 max 80)", () => {
        expect(() =>
          ParseResultPayloadSchema.parse(
            makeFullPayload({ jd_company_name: "Acme Corp".padEnd(81, "X") }),
          ),
        ).toThrow(z.ZodError);
      });

      it("jd_role_title accepts exactly 80 chars (max boundary)", () => {
        const result = ParseResultPayloadSchema.parse(
          makeFullPayload({ jd_role_title: "Senior PM".padEnd(80, "X") }),
        );
        expect(result.jd_role_title).toHaveLength(80);
      });

      it("jd_role_title rejects 81-char string (§A0.4 max 80)", () => {
        expect(() =>
          ParseResultPayloadSchema.parse(
            makeFullPayload({ jd_role_title: "Senior PM".padEnd(81, "X") }),
          ),
        ).toThrow(z.ZodError);
      });

      it("jd_industry_hints accepts exactly 5 items (max boundary)", () => {
        const result = ParseResultPayloadSchema.parse(
          makeFullPayload({
            jd_industry_hints: [
              "Test Industry A",
              "Test Industry B",
              "Test Industry C",
              "Test Industry D",
              "Test Industry E",
            ],
          }),
        );
        expect(result.jd_industry_hints).toHaveLength(5);
      });

      it("jd_industry_hints rejects 6-item array (§A0.4 max 5)", () => {
        expect(() =>
          ParseResultPayloadSchema.parse(
            makeFullPayload({
              jd_industry_hints: [
                "Test Industry A",
                "Test Industry B",
                "Test Industry C",
                "Test Industry D",
                "Test Industry E",
                "Test Industry F",
              ],
            }),
          ),
        ).toThrow(z.ZodError);
      });

      it("jd_company_name accepts null", () => {
        const result = ParseResultPayloadSchema.parse(makeFullPayload({ jd_company_name: null }));
        expect(result.jd_company_name).toBeNull();
      });

      it("jd_role_title accepts null", () => {
        const result = ParseResultPayloadSchema.parse(makeFullPayload({ jd_role_title: null }));
        expect(result.jd_role_title).toBeNull();
      });

      it("jd_company_name accepts undefined (omitted)", () => {
        const payload = makeFullPayload();
        const { jd_company_name: _omit, ...rest } = payload as Record<string, unknown>;
        const result = ParseResultPayloadSchema.parse(rest);
        expect(result.jd_company_name).toBeUndefined();
      });
    });
  });

  describe("ParseResultPreviewSchema", () => {
    it("accepts valid preview with all required fields", () => {
      const result = ParseResultPreviewSchema.parse({
        match_summary: "Strong candidate for senior PM role.",
        candidate_risk_count: 2,
        project_hook_count: 3,
      });
      expect(result.match_summary).toBe("Strong candidate for senior PM role.");
      expect(result.candidate_risk_count).toBe(2);
      expect(result.project_hook_count).toBe(3);
    });

    it("accepts candidate_risk_count = 0 (ge=0 boundary)", () => {
      const result = ParseResultPreviewSchema.parse({
        match_summary: "Minimal match summary.",
        candidate_risk_count: 0,
        project_hook_count: 0,
      });
      expect(result.candidate_risk_count).toBe(0);
    });

    it("rejects candidate_risk_count < 0", () => {
      expect(() =>
        ParseResultPreviewSchema.parse({
          match_summary: "Summary",
          candidate_risk_count: -1,
          project_hook_count: 0,
        }),
      ).toThrow(z.ZodError);
    });

    it("rejects project_hook_count < 0", () => {
      expect(() =>
        ParseResultPreviewSchema.parse({
          match_summary: "Summary",
          candidate_risk_count: 0,
          project_hook_count: -1,
        }),
      ).toThrow(z.ZodError);
    });

    it("rejects extra field via .strict()", () => {
      expect(() =>
        ParseResultPreviewSchema.parse({
          match_summary: "Summary",
          candidate_risk_count: 0,
          project_hook_count: 0,
          extra: "evil",
        }),
      ).toThrow(z.ZodError);
    });
  });

  describe("ParseRequestResponseSchema", () => {
    const baseRequest = {
      asset_bundle_id: VALID_UUID,
      status: "COMPLETED",
      payload: makeFullPayload(),
    };

    it("accepts research_payload as null", () => {
      const result = ParseRequestResponseSchema.parse({
        ...baseRequest,
        research_payload: null,
      });
      expect(result.research_payload).toBeNull();
    });

    it("accepts research_payload as undefined (omitted, forward-ref resolved in M3.1.1.d)", () => {
      const result = ParseRequestResponseSchema.parse({
        ...baseRequest,
      });
      expect(result.research_payload).toBeUndefined();
    });

    it("accepts research_payload as undefined (omitted)", () => {
      const result = ParseRequestResponseSchema.parse(baseRequest);
      expect(result.research_payload).toBeUndefined();
    });

    it("accepts predicted_questions as null", () => {
      const result = ParseRequestResponseSchema.parse({
        ...baseRequest,
        predicted_questions: null,
      });
      expect(result.predicted_questions).toBeNull();
    });

    it("accepts predicted_questions as undefined (omitted)", () => {
      const result = ParseRequestResponseSchema.parse(baseRequest);
      expect(result.predicted_questions).toBeUndefined();
    });

    it("accepts predicted_questions with 10 valid questions", () => {
      const result = ParseRequestResponseSchema.parse({
        ...baseRequest,
        predicted_questions: makeValidBank(10),
      });
      expect(result.predicted_questions?.questions).toHaveLength(10);
    });

    it("rejects extra field via .strict()", () => {
      expect(() =>
        ParseRequestResponseSchema.parse({ ...baseRequest, extra: "evil" }),
      ).toThrow(z.ZodError);
    });
  });

  describe("ParseResultResponseSchema", () => {
    const validResponse = {
      ...makeValidTimestampedBase(),
      candidate_asset_id: VALID_UUID2,
      status: "ANALYSIS_READY",
      payload: makeFullPayload(),
    };

    it("accepts valid response with all required fields", () => {
      const result = ParseResultResponseSchema.parse(validResponse);
      expect(result.candidate_asset_id).toBe(VALID_UUID2);
      expect(result.status).toBe("ANALYSIS_READY");
      expect(result.id).toBe(VALID_UUID);
    });

    it("rejects missing TimestampedResponse fields", () => {
      const { id: _omit, ...partial } = validResponse;
      expect(() => ParseResultResponseSchema.parse(partial)).toThrow(z.ZodError);
    });

    it("rejects extra field via .strict()", () => {
      expect(() =>
        ParseResultResponseSchema.parse({ ...validResponse, extra: "evil" }),
      ).toThrow(z.ZodError);
    });
  });

  describe("JobRequirementSchema", () => {
    it("accepts valid requirement", () => {
      const result = JobRequirementSchema.parse({ title: "5+ years PM", detail: "Product management experience required." });
      expect(result.title).toBe("5+ years PM");
    });

    it("rejects extra field via .strict()", () => {
      expect(() =>
        JobRequirementSchema.parse({ title: "PM", detail: "Detail", extra: "evil" }),
      ).toThrow(z.ZodError);
    });
  });

  describe("CandidateProfileSchema", () => {
    it("accepts valid profile with all fields", () => {
      const result = CandidateProfileSchema.parse({
        role: "Senior Product Manager",
        years: 7,
        companies: ["Acme Corp", "Test Co"],
        domain_tags: ["B2C", "Growth"],
      });
      expect(result.years).toBe(7);
    });

    it("accepts profile with defaults for arrays", () => {
      const result = CandidateProfileSchema.parse({ role: "PM", years: 3 });
      expect(result.companies).toEqual([]);
      expect(result.domain_tags).toEqual([]);
    });

    it("rejects years > 60", () => {
      expect(() =>
        CandidateProfileSchema.parse({ role: "PM", years: 61 }),
      ).toThrow(z.ZodError);
    });

    it("rejects years < 0", () => {
      expect(() =>
        CandidateProfileSchema.parse({ role: "PM", years: -1 }),
      ).toThrow(z.ZodError);
    });

    it("rejects role exceeding max 40 chars", () => {
      expect(() =>
        CandidateProfileSchema.parse({ role: "x".repeat(41), years: 5 }),
      ).toThrow(z.ZodError);
    });
  });

  describe("MatchAdvantageSchema", () => {
    it("accepts valid advantage", () => {
      const result = MatchAdvantageSchema.parse({
        label: "AI experience",
        tag: "强匹配",
        evidence: "Candidate has led AI product teams for 3 years.",
      });
      expect(result.tag).toBe("强匹配");
    });

    it("rejects invalid tag", () => {
      expect(() =>
        MatchAdvantageSchema.parse({ label: "AI", tag: "INVALID", evidence: "Some evidence text." }),
      ).toThrow(z.ZodError);
    });
  });

  describe("GapSchema", () => {
    it("accepts valid gap with tag 需补充", () => {
      const result = GapSchema.parse({
        label: "Enterprise sales",
        tag: "需补充",
        evidence: "No enterprise B2B experience found in resume.",
      });
      expect(result.tag).toBe("需补充");
    });

    it("accepts valid gap with tag 待评估", () => {
      const result = GapSchema.parse({
        label: "Technical depth",
        tag: "待评估",
        evidence: "Limited technical details in resume.",
      });
      expect(result.tag).toBe("待评估");
    });
  });

  describe("InterviewFocusSchema", () => {
    it("accepts valid focus with all valid direction_id values", () => {
      const validIds = [
        "ai-insight",
        "data-driven",
        "cross-func",
        "zero-to-one",
        "user-research",
        "strategy",
      ] as const;
      for (const id of validIds) {
        const result = InterviewFocusSchema.parse({
          direction_id: id,
          priority: "high",
          title: "Focus area",
          description: "A description of the focus area.",
        });
        expect(result.direction_id).toBe(id);
      }
    });

    it("rejects invalid priority", () => {
      expect(() =>
        InterviewFocusSchema.parse({
          direction_id: "ai-insight",
          priority: "INVALID",
          title: "Focus",
          description: "Description.",
        }),
      ).toThrow(z.ZodError);
    });
  });
});
