import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ResearchAgentInputSchema } from "../research";
import { CoachAgentInputSchema } from "../coach";
import { ReflectionAgentInputSchema } from "../reflection";

// ===== Deterministic LCG RNG (seed=42) for fuzz — avoids CI flake =====
// LCG parameters: multiplier=1664525, increment=1013904223, modulus=2^32
function makeLcg(seed: number) {
  let s = seed >>> 0;
  return function next(): number {
    s = ((Math.imul(1664525, s) + 1013904223) >>> 0);
    return s / 0x100000000;
  };
}

// Generate a random alphanumeric string of given length
function randomAlpha(rng: () => number, length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(rng() * chars.length)];
  }
  return result;
}

// PII field names that must be rejected by ResearchAgentInputSchema
const PII_FIELD_POOL = [
  "resume_text",
  "candidate_email",
  "candidate_phone",
  "身份证号",
  "address",
  "passport_number",
  "social_security_number",
  "date_of_birth",
  "home_address",
  "bank_account",
  "credit_card",
  "national_id",
  "phone_number",
  "email_address",
  "linkedin_url",
  "github_url",
  "salary_expectation",
  "current_employer",
  "reference_contact",
  "emergency_contact",
];

// Valid base for ResearchAgentInputSchema (minimal valid input)
const VALID_RESEARCH_BASE = {
  company_name: "Acme Corp",
  role_title: "Product Manager",
  industry_hints: ["B2C", "SaaS"],
};

// Valid base for CoachAgentInputSchema
const VALID_COACH_BASE = {
  user_id: "user-123",
  based_on_session_count: 5,
  based_on_last_session_id: "session-456",
  recent_reports: [
    { id: "r1", score: 80 },
    { id: "r2", score: 75 },
    { id: "r3", score: 70 },
  ],
};

// Valid base for ReflectionAgentInputSchema
const VALID_REFLECTION_BASE = {
  session_id: "session-789",
  report_id: "report-123",
  report_payload: { status: "ok" },
};

// ===== ★ Research ResearchAgentInput .strict() — N=300 PII fuzz ★ =====

describe("★ L0-5 ResearchAgentInput .strict() — N=300 PII fuzz ★", () => {
  it("valid 3-field input passes (baseline)", () => {
    const result = ResearchAgentInputSchema.parse(VALID_RESEARCH_BASE);
    expect(result.company_name).toBe("Acme Corp");
    expect(result.role_title).toBe("Product Manager");
    expect(result.industry_hints).toEqual(["B2C", "SaaS"]);
  });

  it("rejects empty industry_hints (min 1)", () => {
    expect(() =>
      ResearchAgentInputSchema.parse({ ...VALID_RESEARCH_BASE, industry_hints: [] }),
    ).toThrow(z.ZodError);
  });

  it("rejects industry_hints with 6 items (max 5)", () => {
    expect(() =>
      ResearchAgentInputSchema.parse({
        ...VALID_RESEARCH_BASE,
        industry_hints: ["A", "B", "C", "D", "E", "F"],
      }),
    ).toThrow(z.ZodError);
  });

  it("rejects company_name length 81 (max 80)", () => {
    expect(() =>
      ResearchAgentInputSchema.parse({
        ...VALID_RESEARCH_BASE,
        company_name: "x".repeat(81),
      }),
    ).toThrow(z.ZodError);
  });

  it("accepts company_name length 80 (max boundary)", () => {
    const result = ResearchAgentInputSchema.parse({
      ...VALID_RESEARCH_BASE,
      company_name: "x".repeat(80),
    });
    expect(result.company_name).toHaveLength(80);
  });

  it("rejects role_title length 0 (min 1)", () => {
    expect(() =>
      ResearchAgentInputSchema.parse({ ...VALID_RESEARCH_BASE, role_title: "" }),
    ).toThrow(z.ZodError);
  });

  it("rejects resume_text extra field (PII)", () => {
    expect(() =>
      ResearchAgentInputSchema.parse({ ...VALID_RESEARCH_BASE, resume_text: "my resume content" }),
    ).toThrow(z.ZodError);
  });

  it("rejects candidate_email extra field (PII)", () => {
    expect(() =>
      ResearchAgentInputSchema.parse({ ...VALID_RESEARCH_BASE, candidate_email: "user@example.com" }),
    ).toThrow(z.ZodError);
  });

  it("rejects candidate_phone extra field (PII)", () => {
    expect(() =>
      ResearchAgentInputSchema.parse({ ...VALID_RESEARCH_BASE, candidate_phone: "+86-13800138000" }),
    ).toThrow(z.ZodError);
  });

  it("rejects 身份证号 extra field (PII)", () => {
    expect(() =>
      ResearchAgentInputSchema.parse({ ...VALID_RESEARCH_BASE, 身份证号: "110101199001011234" }),
    ).toThrow(z.ZodError);
  });

  it("rejects address extra field (PII)", () => {
    expect(() =>
      ResearchAgentInputSchema.parse({ ...VALID_RESEARCH_BASE, address: "123 Main St" }),
    ).toThrow(z.ZodError);
  });

  it("★ FUZZ N=300 ★ — ALL PII extra fields 100% rejected by ResearchAgentInputSchema", () => {
    const rng = makeLcg(42);
    let passCount = 0;

    for (let i = 0; i < 300; i++) {
      // Pick a PII field name from pool OR generate a random 8-char alphanumeric key
      let extraField: string;
      if (rng() < 0.7) {
        // 70% pick from known PII pool
        extraField = PII_FIELD_POOL[Math.floor(rng() * PII_FIELD_POOL.length)];
      } else {
        // 30% random 8-char key (any unknown field must also be rejected)
        extraField = randomAlpha(rng, 8);
      }

      const extraValue = randomAlpha(rng, 8 + Math.floor(rng() * 16));

      const input = { ...VALID_RESEARCH_BASE, [extraField]: extraValue };

      try {
        ResearchAgentInputSchema.parse(input);
        // If parse succeeds without error, the extra field was NOT rejected
        passCount++;
      } catch (err) {
        // Expected: every extra field must throw ZodError
        expect(err).toBeInstanceOf(z.ZodError);
      }
    }

    // 100% rejection rate — no iteration should have passed
    expect(passCount).toBe(0);
  });
});

// ===== CoachAgentInput .strict() — N=50 PII fuzz =====

describe("CoachAgentInput .strict() — N=50 PII fuzz", () => {
  it("valid 4-field input passes (baseline)", () => {
    const result = CoachAgentInputSchema.parse(VALID_COACH_BASE);
    expect(result.user_id).toBe("user-123");
    expect(result.based_on_session_count).toBe(5);
  });

  it("rejects based_on_session_count < 3 (ge=3)", () => {
    expect(() =>
      CoachAgentInputSchema.parse({ ...VALID_COACH_BASE, based_on_session_count: 2 }),
    ).toThrow(z.ZodError);
  });

  it("rejects recent_reports with 2 items (min 3)", () => {
    expect(() =>
      CoachAgentInputSchema.parse({
        ...VALID_COACH_BASE,
        recent_reports: [{ id: "r1" }, { id: "r2" }],
      }),
    ).toThrow(z.ZodError);
  });

  it("rejects recent_reports with 11 items (max 10)", () => {
    expect(() =>
      CoachAgentInputSchema.parse({
        ...VALID_COACH_BASE,
        recent_reports: Array.from({ length: 11 }, (_, i) => ({ id: `r${i}` })),
      }),
    ).toThrow(z.ZodError);
  });

  it("accepts candidate_profile as null", () => {
    const result = CoachAgentInputSchema.parse({ ...VALID_COACH_BASE, candidate_profile: null });
    expect(result.candidate_profile).toBeNull();
  });

  it("★ FUZZ N=50 ★ — ALL PII extra fields 100% rejected by CoachAgentInputSchema", () => {
    const rng = makeLcg(42);
    let passCount = 0;

    for (let i = 0; i < 50; i++) {
      let extraField: string;
      if (rng() < 0.7) {
        extraField = PII_FIELD_POOL[Math.floor(rng() * PII_FIELD_POOL.length)];
      } else {
        extraField = randomAlpha(rng, 8);
      }

      const extraValue = randomAlpha(rng, 8 + Math.floor(rng() * 16));
      const input = { ...VALID_COACH_BASE, [extraField]: extraValue };

      try {
        CoachAgentInputSchema.parse(input);
        passCount++;
      } catch (err) {
        expect(err).toBeInstanceOf(z.ZodError);
      }
    }

    expect(passCount).toBe(0);
  });
});

// ===== ReflectionAgentInput .strict() — N=50 PII fuzz =====

describe("ReflectionAgentInput .strict() — N=50 PII fuzz", () => {
  it("valid 3-field input passes (baseline)", () => {
    const result = ReflectionAgentInputSchema.parse(VALID_REFLECTION_BASE);
    expect(result.session_id).toBe("session-789");
    expect(result.report_id).toBe("report-123");
  });

  it("rejects session_id length 0 (min 1)", () => {
    expect(() =>
      ReflectionAgentInputSchema.parse({ ...VALID_REFLECTION_BASE, session_id: "" }),
    ).toThrow(z.ZodError);
  });

  it("rejects turns with 31 items (max 30)", () => {
    expect(() =>
      ReflectionAgentInputSchema.parse({
        ...VALID_REFLECTION_BASE,
        turns: Array.from({ length: 31 }, (_, i) => ({ index: i })),
      }),
    ).toThrow(z.ZodError);
  });

  it("accepts parse_payload as null", () => {
    const result = ReflectionAgentInputSchema.parse({ ...VALID_REFLECTION_BASE, parse_payload: null });
    expect(result.parse_payload).toBeNull();
  });

  it("accepts research_payload as null", () => {
    const result = ReflectionAgentInputSchema.parse({ ...VALID_REFLECTION_BASE, research_payload: null });
    expect(result.research_payload).toBeNull();
  });

  it("★ FUZZ N=50 ★ — ALL PII extra fields 100% rejected by ReflectionAgentInputSchema", () => {
    const rng = makeLcg(42);
    let passCount = 0;

    for (let i = 0; i < 50; i++) {
      let extraField: string;
      if (rng() < 0.7) {
        extraField = PII_FIELD_POOL[Math.floor(rng() * PII_FIELD_POOL.length)];
      } else {
        extraField = randomAlpha(rng, 8);
      }

      const extraValue = randomAlpha(rng, 8 + Math.floor(rng() * 16));
      const input = { ...VALID_REFLECTION_BASE, [extraField]: extraValue };

      try {
        ReflectionAgentInputSchema.parse(input);
        passCount++;
      } catch (err) {
        expect(err).toBeInstanceOf(z.ZodError);
      }
    }

    expect(passCount).toBe(0);
  });
});
