/**
 * G-1: parse-v32-extended tests — MatchScore cross-field validator + jd_* boundary tests.
 * Ported from apps/api/tests/agents/test_parse_v32_extended.py (KEEP).
 * §A0: No Tauri imports. §C3: No secret access.
 */

import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  MatchScoreSchema,
  ParseResultPayloadSchema,
} from "../parse";

// MARK: - MatchScore cross-field validator (12 mismatch cases)

// score < 60 requires level=LOW; [60,75] requires MID; ≥76 requires HIGH

const MISMATCH_CASES: Array<{ score: number; level: "LOW" | "MID" | "HIGH"; valid: boolean; desc: string }> = [
  // LOW range (0-59) — valid with LOW, invalid with MID or HIGH
  { score: 0,   level: "LOW",  valid: true,  desc: "score=0 + LOW → valid (min boundary)" },
  { score: 0,   level: "MID",  valid: false, desc: "score=0 + MID → invalid mismatch" },
  { score: 0,   level: "HIGH", valid: false, desc: "score=0 + HIGH → invalid mismatch" },
  { score: 59,  level: "LOW",  valid: true,  desc: "score=59 + LOW → valid (max of LOW range)" },
  { score: 59,  level: "MID",  valid: false, desc: "score=59 + MID → invalid mismatch" },
  { score: 59,  level: "HIGH", valid: false, desc: "score=59 + HIGH → invalid mismatch" },
  // MID range (60-75) — valid with MID, invalid with LOW or HIGH
  { score: 60,  level: "MID",  valid: true,  desc: "score=60 + MID → valid (min boundary of MID)" },
  { score: 60,  level: "LOW",  valid: false, desc: "score=60 + LOW → invalid mismatch" },
  { score: 60,  level: "HIGH", valid: false, desc: "score=60 + HIGH → invalid mismatch" },
  { score: 65,  level: "MID",  valid: true,  desc: "score=65 + MID → valid (mid-range)" },
  { score: 65,  level: "LOW",  valid: false, desc: "score=65 + LOW → invalid mismatch" },
  { score: 65,  level: "HIGH", valid: false, desc: "score=65 + HIGH → invalid mismatch" },
  { score: 75,  level: "MID",  valid: true,  desc: "score=75 + MID → valid (max of MID range)" },
  { score: 75,  level: "LOW",  valid: false, desc: "score=75 + LOW → invalid mismatch" },
  { score: 75,  level: "HIGH", valid: false, desc: "score=75 + HIGH → invalid mismatch" },
  // HIGH range (76-100) — valid with HIGH, invalid with LOW or MID
  { score: 76,  level: "HIGH", valid: true,  desc: "score=76 + HIGH → valid (min boundary of HIGH)" },
  { score: 76,  level: "LOW",  valid: false, desc: "score=76 + LOW → invalid mismatch" },
  { score: 76,  level: "MID",  valid: false, desc: "score=76 + MID → invalid mismatch" },
  { score: 90,  level: "HIGH", valid: true,  desc: "score=90 + HIGH → valid" },
  { score: 90,  level: "LOW",  valid: false, desc: "score=90 + LOW → invalid mismatch" },
  { score: 90,  level: "MID",  valid: false, desc: "score=90 + MID → invalid mismatch" },
  { score: 100, level: "HIGH", valid: true,  desc: "score=100 + HIGH → valid (max boundary)" },
  { score: 100, level: "LOW",  valid: false, desc: "score=100 + LOW → invalid mismatch" },
  { score: 100, level: "MID",  valid: false, desc: "score=100 + MID → invalid mismatch" },
];

describe("MatchScoreSchema — cross-field level/score mismatch (G-1, parametrized 24 cases)", () => {
  for (const tc of MISMATCH_CASES) {
    it(tc.desc, () => {
      const input = { score: tc.score, level: tc.level, one_line: "test" };
      if (tc.valid) {
        const result = MatchScoreSchema.parse(input);
        expect(result.level).toBe(tc.level);
        expect(result.score).toBe(tc.score);
      } else {
        expect(() => MatchScoreSchema.parse(input)).toThrow(ZodError);
      }
    });
  }
});

// MARK: - jd_company_name max-80 chars boundary

describe("ParseResultPayloadSchema — jd_company_name max-80 boundary (G-1)", () => {
  function makePayload(overrides: Record<string, unknown> = {}) {
    return { ...overrides };
  }

  it("jd_company_name exactly 80 chars accepted", () => {
    const result = ParseResultPayloadSchema.parse(
      makePayload({ jd_company_name: "A".repeat(80) }),
    );
    expect(result.jd_company_name).toHaveLength(80);
  });

  it("jd_company_name 81 chars rejected (ZodError — §A0.4 max 80)", () => {
    expect(() =>
      ParseResultPayloadSchema.parse(makePayload({ jd_company_name: "A".repeat(81) })),
    ).toThrow(ZodError);
  });

  it("jd_company_name 1 char accepted (min valid string)", () => {
    const result = ParseResultPayloadSchema.parse(makePayload({ jd_company_name: "X" }));
    expect(result.jd_company_name).toBe("X");
  });
});

// MARK: - jd_role_title max-80 chars boundary

describe("ParseResultPayloadSchema — jd_role_title max-80 boundary (G-1)", () => {
  function makePayload(overrides: Record<string, unknown> = {}) {
    return { ...overrides };
  }

  it("jd_role_title exactly 80 chars accepted", () => {
    const result = ParseResultPayloadSchema.parse(
      makePayload({ jd_role_title: "B".repeat(80) }),
    );
    expect(result.jd_role_title).toHaveLength(80);
  });

  it("jd_role_title 81 chars rejected (ZodError — §A0.4 max 80)", () => {
    expect(() =>
      ParseResultPayloadSchema.parse(makePayload({ jd_role_title: "B".repeat(81) })),
    ).toThrow(ZodError);
  });
});

// MARK: - jd_industry_hints max-5 items boundary

describe("ParseResultPayloadSchema — jd_industry_hints max-5 boundary (G-1)", () => {
  function makePayload(overrides: Record<string, unknown> = {}) {
    return { ...overrides };
  }

  it("jd_industry_hints exactly 5 items accepted", () => {
    const result = ParseResultPayloadSchema.parse(
      makePayload({ jd_industry_hints: ["A", "B", "C", "D", "E"] }),
    );
    expect(result.jd_industry_hints).toHaveLength(5);
  });

  it("jd_industry_hints 6 items rejected (ZodError — §A0.4 max 5)", () => {
    expect(() =>
      ParseResultPayloadSchema.parse(
        makePayload({ jd_industry_hints: ["A", "B", "C", "D", "E", "F"] }),
      ),
    ).toThrow(ZodError);
  });

  it("jd_industry_hints 0 items accepted (default [])", () => {
    const result = ParseResultPayloadSchema.parse(
      makePayload({ jd_industry_hints: [] }),
    );
    expect(result.jd_industry_hints).toHaveLength(0);
  });

  it("jd_industry_hints 1 item accepted", () => {
    const result = ParseResultPayloadSchema.parse(
      makePayload({ jd_industry_hints: ["AI"] }),
    );
    expect(result.jd_industry_hints).toEqual(["AI"]);
  });
});
