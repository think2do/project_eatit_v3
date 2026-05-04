import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { runResearchAgent } from "../index";
import type { LLMProvider } from "@/core/llm/types";

// Same LCG params as core/schemas/__tests__/research-privacy.fuzz.test.ts
// seed=42, multiplier=1664525, increment=1013904223, modulus=2^32
function makeLcg(seed: number) {
  let s = seed >>> 0;
  return function next(): number {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function randomAlpha(rng: () => number, length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) result += chars[Math.floor(rng() * chars.length)];
  return result;
}

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

const VALID_BASE = {
  company_name: "Acme Corp",
  role_title: "Product Manager",
  industry_hints: ["B2C", "SaaS"],
};

// MARK: - ★ N=300 Agent-Layer PII Fuzz ★

describe("★ L0 A11 ResearchAgent agent-layer PII fuzz ★", () => {
  it("★ FUZZ N=300 ★ runResearchAgent rejects ALL PII attempts via schema layer", async () => {
    const rng = makeLcg(42);
    let leakCount = 0;
    const generateObject = vi.fn();
    const mockLLM = {
      chat: vi.fn(),
      chatStream: vi.fn(),
      generateObject,
    } as unknown as LLMProvider;

    for (let i = 0; i < 300; i++) {
      let extraField: string;
      if (rng() < 0.7) {
        extraField = PII_FIELD_POOL[Math.floor(rng() * PII_FIELD_POOL.length)];
      } else {
        extraField = randomAlpha(rng, 8);
      }
      const extraValue = randomAlpha(rng, 8 + Math.floor(rng() * 16));
      const poisoned = { ...VALID_BASE, [extraField]: extraValue };

      try {
        await runResearchAgent(poisoned as never, { llm: mockLLM });
        leakCount++;
      } catch (err) {
        expect(err).toBeInstanceOf(z.ZodError);
      }
    }

    // ★ L0 #11 acceptance criteria — BOTH must hold:
    // 1. Zero PII attempts leaked through to the LLM call
    expect(leakCount).toBe(0);
    // 2. Layer 1 stopped all attempts before LLM provider was ever called
    expect(generateObject).not.toHaveBeenCalled();
  });
});
