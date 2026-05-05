/**
 * all-locks-fuzz.test.ts — M5.2.d multi-schema fuzz sweep
 *
 * Consolidated fuzz suite exercising all L0 locks against random inputs.
 * Uses a deterministic LCG (seed=42) for reproducible CI runs — no flake.
 *
 * L0 locks fuzzed:
 *   #1  DimensionNameSchema rejects alien names
 *   #2  PassLikelihoodSchema rejects random tier strings
 *   #3  scanForbiddenTone catches injected banned words
 *   §A11 multi-PII simultaneous injection across 4 agent input schemas
 *
 * §A0: no Tauri import.
 * §C3: no keychain.read, no process.env reads, no secret material.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { DimensionNameSchema, PassLikelihoodSchema, FORBIDDEN_TONE_WORDS, scanForbiddenTone } from "@/core/schemas/reports";
import { ResearchAgentInputSchema } from "@/core/schemas/research";
import { CoachAgentInputSchema } from "@/core/schemas/coach";
import { ReflectionAgentInputSchema } from "@/core/schemas/reflection";
import { ParseAgentInputSchema } from "@/core/schemas/parse";

// ─── Deterministic LCG RNG (seed=42) ─────────────────────────────────────────
// Parameters: multiplier=1664525, increment=1013904223, modulus=2^32
// Matches the LCG used in contracts-locks.test.ts and research-privacy.fuzz.test.ts.

function makeLcg(seed: number) {
  let s = seed >>> 0;
  return function next(): number {
    s = ((Math.imul(1664525, s) + 1013904223) >>> 0);
    return s / 0x100000000;
  };
}

// ─── L0 #1: DimensionNameSchema rejects alien Chinese strings ─────────────────

describe("FUZZ L0 #1 — DimensionNameSchema rejects random alien names", () => {
  // 10 deterministic alien dimension-like strings (not in the locked 5-item set)
  const ALIEN_DIMENSIONS = [
    "沟通技巧",
    "情绪管理",
    "创新能力",
    "团队协作",
    "学习能力",
    "执行力强",
    "领导潜力",
    "抗压能力",
    "数据分析",
    "项目管理",
  ] as const;

  it.each(ALIEN_DIMENSIONS)("rejects alien dimension '%s'", (alien) => {
    expect(() => DimensionNameSchema.parse(alien)).toThrow(z.ZodError);
  });
});

// ─── L0 #2: PassLikelihoodSchema rejects random tier strings ─────────────────

describe("FUZZ L0 #2 — PassLikelihoodSchema rejects random tier strings", () => {
  // 10 deterministic plausible-but-wrong tier strings
  const ALIEN_TIERS = [
    "中等",
    "良好",
    "优秀",
    "高",
    "低",
    "high",
    "low",
    "medium",
    "pass",
    "fail",
  ] as const;

  it.each(ALIEN_TIERS)("rejects tier '%s'", (tier) => {
    expect(() => PassLikelihoodSchema.parse(tier)).toThrow(z.ZodError);
  });
});

// ─── L0 #3: scanForbiddenTone detects injected banned substrings ──────────────

describe("FUZZ L0 #3 — scanForbiddenTone detects banned words in fuzz texts", () => {
  const rng = makeLcg(42);

  // Build 5 fuzz texts each embedding a different forbidden word plus noise
  const SAFE_NOISE = "表现优秀进步显著成长";

  function pickForbidden(r: () => number): string {
    return (FORBIDDEN_TONE_WORDS as readonly string[])[
      Math.floor(r() * FORBIDDEN_TONE_WORDS.length)
    ];
  }

  it("fuzz text with 1 injected banned word triggers scanForbiddenTone (round 1)", () => {
    const word = pickForbidden(rng);
    const text = SAFE_NOISE + word + SAFE_NOISE;
    const hits = scanForbiddenTone(text);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits).toContain(word);
  });

  it("fuzz text with 1 injected banned word triggers scanForbiddenTone (round 2)", () => {
    const word = pickForbidden(rng);
    const text = word + SAFE_NOISE;
    const hits = scanForbiddenTone(text);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits).toContain(word);
  });

  it("fuzz text with 1 injected banned word triggers scanForbiddenTone (round 3)", () => {
    const word = pickForbidden(rng);
    const text = SAFE_NOISE + word;
    const hits = scanForbiddenTone(text);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits).toContain(word);
  });

  it("fuzz text with 2 injected banned words triggers scanForbiddenTone for both", () => {
    const word1 = pickForbidden(rng);
    const word2 = pickForbidden(rng);
    const text = word1 + SAFE_NOISE + word2;
    const hits = scanForbiddenTone(text);
    expect(hits).toContain(word1);
    expect(hits).toContain(word2);
  });

  it("pure safe text never triggers scanForbiddenTone", () => {
    const text = "继续努力" + SAFE_NOISE + "加油前进能力提升";
    const hits = scanForbiddenTone(text);
    expect(hits).toHaveLength(0);
  });
});

// ─── §A11: Multi-PII simultaneous injection fuzz across 4 agent schemas ───────

describe("FUZZ §A11 — ResearchAgentInput rejects simultaneous multi-PII injection", () => {
  const rng = makeLcg(42);

  // Valid base for ResearchAgentInput
  const validResearch = {
    company_name: "Acme Corp",
    role_title: "Senior PM",
    industry_hints: ["tech", "saas"],
  };

  // PII fields to inject simultaneously
  const PII_FIELDS = {
    resume_text: "my full resume content here",
    candidate_email: "user@example.com",
    candidate_phone: "13800138000",
    身份证号: "110101199001011234",
    address: "北京市朝阳区某某路1号",
  } as const;

  // LCG-seeded fuzz: N=50 attempts with rotating PII combos
  it("LCG fuzz N=50: random PII field combos all rejected by ResearchAgentInputSchema", () => {
    const piiKeys = Object.keys(PII_FIELDS) as (keyof typeof PII_FIELDS)[];
    for (let i = 0; i < 50; i++) {
      // Pick 1-5 PII fields deterministically via LCG
      const count = 1 + Math.floor(rng() * piiKeys.length);
      const injected: Record<string, unknown> = { ...validResearch };
      for (let j = 0; j < count; j++) {
        const key = piiKeys[Math.floor(rng() * piiKeys.length)];
        injected[key] = PII_FIELDS[key];
      }
      expect(() => ResearchAgentInputSchema.parse(injected)).toThrow(z.ZodError);
    }
  });
});

describe("FUZZ §A11 — CoachAgentInput rejects simultaneous multi-PII injection", () => {
  const rng = makeLcg(99);

  const validCoach = {
    user_id: "u-abc-123",
    based_on_session_count: 3,
    based_on_last_session_id: "sess-xyz",
    recent_reports: [{}, {}, {}],
  };

  const PII_FIELDS = {
    resume_text: "full resume text",
    candidate_email: "hack@example.com",
    candidate_phone: "13900139000",
    身份证号: "320101199012315678",
    address: "上海市浦东新区某路2号",
  } as const;

  it("LCG fuzz N=50: random PII field combos all rejected by CoachAgentInputSchema", () => {
    const piiKeys = Object.keys(PII_FIELDS) as (keyof typeof PII_FIELDS)[];
    for (let i = 0; i < 50; i++) {
      const count = 1 + Math.floor(rng() * piiKeys.length);
      const injected: Record<string, unknown> = { ...validCoach };
      for (let j = 0; j < count; j++) {
        const key = piiKeys[Math.floor(rng() * piiKeys.length)];
        injected[key] = PII_FIELDS[key];
      }
      expect(() => CoachAgentInputSchema.parse(injected)).toThrow(z.ZodError);
    }
  });
});

describe("FUZZ §A11 — ReflectionAgentInput rejects simultaneous multi-PII injection", () => {
  const rng = makeLcg(7);

  const validReflection = {
    session_id: "sess-001",
    report_id: "report-001",
    report_payload: {},
  };

  const PII_FIELDS = {
    resume_text: "candidate resume here",
    candidate_email: "private@corp.com",
    candidate_phone: "18600000001",
    身份证号: "440101198505152222",
    address: "广州市天河区某某街3号",
  } as const;

  it("LCG fuzz N=50: random PII field combos all rejected by ReflectionAgentInputSchema", () => {
    const piiKeys = Object.keys(PII_FIELDS) as (keyof typeof PII_FIELDS)[];
    for (let i = 0; i < 50; i++) {
      const count = 1 + Math.floor(rng() * piiKeys.length);
      const injected: Record<string, unknown> = { ...validReflection };
      for (let j = 0; j < count; j++) {
        const key = piiKeys[Math.floor(rng() * piiKeys.length)];
        injected[key] = PII_FIELDS[key];
      }
      expect(() => ReflectionAgentInputSchema.parse(injected)).toThrow(z.ZodError);
    }
  });
});

describe("FUZZ §A11 — ParseAgentInput rejects simultaneous multi-PII injection", () => {
  const rng = makeLcg(1337);

  const validParse = {
    resume_text: "resume content here",
    jd_text: "job description here",
  };

  const PII_FIELDS = {
    candidate_email: "leak@example.com",
    candidate_phone: "15000000002",
    身份证号: "510101199203204567",
    address: "成都市锦江区某路4号",
    candidate_name: "张三",
  } as const;

  it("LCG fuzz N=50: random PII field combos all rejected by ParseAgentInputSchema", () => {
    const piiKeys = Object.keys(PII_FIELDS) as (keyof typeof PII_FIELDS)[];
    for (let i = 0; i < 50; i++) {
      const count = 1 + Math.floor(rng() * piiKeys.length);
      const injected: Record<string, unknown> = { ...validParse };
      for (let j = 0; j < count; j++) {
        const key = piiKeys[Math.floor(rng() * piiKeys.length)];
        injected[key] = PII_FIELDS[key];
      }
      expect(() => ParseAgentInputSchema.parse(injected)).toThrow(z.ZodError);
    }
  });
});
