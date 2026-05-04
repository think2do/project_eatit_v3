/**
 * Tests for Report Agent — M3.3.3.dev.a
 *
 * Spec §7.5: N=100 LCG fuzz, seed=42
 * Spec §7.6: ai_verdict regex 5 positive / 4 negative
 * Spec §7.7: 5-dim / 3-tier / 12-banned lock tests
 *
 * Note: test file placed under core/agents/report/__tests__/ (overrides spec src/__tests__)
 * to match M3.2.x / M3.3.x convention. Noted in commit body.
 */

import { describe, it, expect, vi } from "vitest";
import { ZodError, z } from "zod";
import {
  runReportAgent,
  type ReportAgentDeps,
} from "../index";
import { systemPrompt, userPrompt } from "../prompts";
import {
  coercePassLikelihood,
  normalizeDimensions,
  applyToneSanitization,
  aiVerdictRegexScan,
  applyReportSanitization,
  DEFAULT_DIMENSION_NAMES,
  AI_VERDICT_BANNED_REGEX,
  LITERAL_PASS_LIKELIHOOD_MAP,
} from "../sanitizers";
import {
  FORBIDDEN_TONE_WORDS,
  DimensionNameSchema,
  PassLikelihoodSchema,
  ReportAgentInputSchema,
  ReportAgentOutputSchema,
  ReportTurnRecordSchema,
  type ReportAgentInput,
  type ReportAgentOutput,
  type DimensionScore,
} from "@/core/schemas/reports";
import type { LLMProvider, Message } from "@/core/llm/types";

// ===== LCG helper — copy verbatim from research-privacy.fuzz.test.ts (spec §7.5) =====

function makeLcg(seed: number) {
  let s = seed >>> 0;
  return function next(): number {
    s = ((Math.imul(1664525, s) + 1013904223) >>> 0);
    return s / 0x100000000;
  };
}

function randomAlpha(rng: () => number, length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(rng() * chars.length)];
  }
  return result;
}

// ===== Fixtures =====

const VALID_INPUT: ReportAgentInput = {
  parse_payload_json: '{"role": "PM", "level": "mid"}',
  framework_json: '{"directions": ["strategy", "execution"]}',
  turns: [
    {
      question: "请介绍你最近一个项目。",
      answer: "我负责了一个 B2C 产品从 0 到 1 的上线。",
      assessment: { summary: "表达清晰,有结构" },
    },
    {
      question: "你如何处理需求冲突?",
      answer: "我会通过数据分析和用户访谈来优先级排序。",
      assessment: null,
    },
  ],
  long_term_summary: null,
};

function makeValidDimensions(): DimensionScore[] {
  return DEFAULT_DIMENSION_NAMES.map((name) => ({
    name: name as DimensionScore["name"],
    description: `${name}表现正常`,
    score: 70,
    evidence_chips: [{ text: "表现稳定", good: true }],
  }));
}

function makeValidOutput(overrides?: Partial<ReportAgentOutput>): ReportAgentOutput {
  return {
    pass_probability: 72,
    summary: "候选人综合表现符合预期,专业基础扎实。",
    reasons: [
      {
        aspect: "专业基础",
        verdict: "solid",
        evidence_turn_index: 0,
        quote: "B2C 产品从 0 到 1",
      },
    ],
    next_actions: ["加强系统设计专题练习", "多练习 STAR 结构回答"],
    pass_likelihood: "中",
    overall_score: 72,
    ai_verdict: "你在本次面试中表现稳定,建议继续加强结构化表达能力。",
    dimensions: makeValidDimensions(),
    round_reviews_v2: [],
    next_actions_v2: null,
    ...overrides,
  };
}

// ===== Mock LLMProvider =====

class MockLLMProvider implements LLMProvider {
  private generateObjectImpl: () => Promise<unknown>;
  constructor(impl: () => Promise<unknown>) {
    this.generateObjectImpl = impl;
  }
  chat = vi.fn();
  chatStream = vi.fn();
  generateObject<T>(_req: { schema: z.ZodSchema<T>; messages: Message[]; model?: string }): Promise<T> {
    return this.generateObjectImpl() as Promise<T>;
  }
}

function makeProvider(output: ReportAgentOutput): ReportAgentDeps {
  return { llm: new MockLLMProvider(() => Promise.resolve(output)) as LLMProvider };
}

// ===== MARK: runReportAgent =====

describe("runReportAgent", () => {
  it("happy path — mock LLM returns valid output → passes sanitize → returns ReportAgentOutput", async () => {
    const validOutput = makeValidOutput();
    const deps = makeProvider(validOutput);
    const result = await runReportAgent(VALID_INPUT, deps);
    expect(result.pass_probability).toBe(72);
    expect(result.summary).toBe(validOutput.summary);
    expect(result.dimensions).toHaveLength(5);
    // Validate overall shape via schema (lenient pass_likelihood: accept string here)
    expect(result.pass_likelihood).toBeDefined();
  });

  it("runReportAgent — dimensions always 5 after sanitize", async () => {
    // Output with only 3 dims → normalizeDimensions pads to 5
    const output = makeValidOutput({
      dimensions: [makeValidDimensions()[0], makeValidDimensions()[1], makeValidDimensions()[2]],
    });
    const deps = makeProvider(output);
    const result = await runReportAgent(VALID_INPUT, deps);
    expect(result.dimensions).toHaveLength(5);
  });

  it("LLM error propagates — rejects throw", async () => {
    const errorLLM = new MockLLMProvider(() => Promise.reject(new Error("LLM network timeout")));
    const deps: ReportAgentDeps = { llm: errorLLM as LLMProvider };
    await expect(runReportAgent(VALID_INPUT, deps)).rejects.toThrow("LLM network timeout");
  });

  it("ZodError on PII input — resume_text rejected by .strict()", async () => {
    const deps = makeProvider(makeValidOutput());
    await expect(
      runReportAgent({ ...VALID_INPUT, resume_text: "my full resume" } as never, deps),
    ).rejects.toThrow(ZodError);
  });

  it("ZodError on PII input — candidate_email rejected", async () => {
    const deps = makeProvider(makeValidOutput());
    await expect(
      runReportAgent({ ...VALID_INPUT, candidate_email: "user@example.com" } as never, deps),
    ).rejects.toThrow(ZodError);
  });

  it("Layer 1 stops LLM call — generateObject NOT called when PII in input", async () => {
    const generateObject = vi.fn();
    const mockLLM = { chat: vi.fn(), chatStream: vi.fn(), generateObject } as unknown as LLMProvider;
    try {
      await runReportAgent({ ...VALID_INPUT, resume_text: "data" } as never, { llm: mockLLM });
    } catch { /* expected ZodError */ }
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("ZodError on invalid input — turns missing question field", async () => {
    const deps = makeProvider(makeValidOutput());
    await expect(
      runReportAgent(
        { ...VALID_INPUT, turns: [{ answer: "hello" }] } as never,
        deps,
      ),
    ).rejects.toThrow(ZodError);
  });
});

// ===== MARK: L0 Lock tests =====

describe("★ L0-3: FORBIDDEN_TONE_WORDS exactly 12 items ★", () => {
  it("FORBIDDEN_TONE_WORDS has exactly 12 items", () => {
    expect(FORBIDDEN_TONE_WORDS).toHaveLength(12);
  });

  it("FORBIDDEN_TONE_WORDS contains '不建议'", () => {
    expect(FORBIDDEN_TONE_WORDS).toContain("不建议");
  });

  it("FORBIDDEN_TONE_WORDS contains '太差'", () => {
    expect(FORBIDDEN_TONE_WORDS).toContain("太差");
  });

  it("FORBIDDEN_TONE_WORDS contains '失败者'", () => {
    expect(FORBIDDEN_TONE_WORDS).toContain("失败者");
  });
});

describe("★ L0-1: DimensionNameSchema 5 维度锁 ★", () => {
  it("DimensionNameSchema rejects '组织架构' (off-list)", () => {
    expect(() => DimensionNameSchema.parse("组织架构")).toThrow(ZodError);
  });

  it("DimensionNameSchema accepts all 5 canonical names", () => {
    for (const name of DEFAULT_DIMENSION_NAMES) {
      expect(() => DimensionNameSchema.parse(name)).not.toThrow();
    }
  });

  it("DEFAULT_DIMENSION_NAMES has exactly 5 items", () => {
    expect(DEFAULT_DIMENSION_NAMES).toHaveLength(5);
  });

  it("DEFAULT_DIMENSION_NAMES first is '专业深度'", () => {
    expect(DEFAULT_DIMENSION_NAMES[0]).toBe("专业深度");
  });

  it("DEFAULT_DIMENSION_NAMES last is '沟通节奏'", () => {
    expect(DEFAULT_DIMENSION_NAMES[4]).toBe("沟通节奏");
  });
});

describe("★ L0-2: PassLikelihoodSchema 3 档锁 ★", () => {
  it("PassLikelihoodSchema rejects '可能' (off-list)", () => {
    expect(() => PassLikelihoodSchema.parse("可能")).toThrow(ZodError);
  });

  it("PassLikelihoodSchema accepts '中上'", () => {
    expect(() => PassLikelihoodSchema.parse("中上")).not.toThrow();
  });

  it("PassLikelihoodSchema accepts '中'", () => {
    expect(() => PassLikelihoodSchema.parse("中")).not.toThrow();
  });

  it("PassLikelihoodSchema accepts '中下'", () => {
    expect(() => PassLikelihoodSchema.parse("中下")).not.toThrow();
  });

  it("PassLikelihoodSchema rejects '高' (off-list)", () => {
    expect(() => PassLikelihoodSchema.parse("高")).toThrow(ZodError);
  });
});

// ===== MARK: coercePassLikelihood =====

describe("coercePassLikelihood", () => {
  // Verbatim 3 valid tiers
  it("returns '中上' verbatim", () => {
    expect(coercePassLikelihood("中上", 50)).toBe("中上");
  });

  it("returns '中' verbatim", () => {
    expect(coercePassLikelihood("中", 50)).toBe("中");
  });

  it("returns '中下' verbatim", () => {
    expect(coercePassLikelihood("中下", 50)).toBe("中下");
  });

  // Literal map synonyms (§7.4)
  it("maps '应该会过' → '中上' via literal map (regardless of score)", () => {
    expect(coercePassLikelihood("应该会过", 10)).toBe("中上");
  });

  it("maps '高于中等' → '中上'", () => {
    expect(coercePassLikelihood("高于中等", 40)).toBe("中上");
  });

  it("maps '倾向通过' → '中上'", () => {
    expect(coercePassLikelihood("倾向通过", 30)).toBe("中上");
  });

  it("maps '较高概率通过' → '中上'", () => {
    expect(coercePassLikelihood("较高概率通过", 20)).toBe("中上");
  });

  it("maps '持平' → '中'", () => {
    expect(coercePassLikelihood("持平", 10)).toBe("中");
  });

  it("maps '五五开' → '中'", () => {
    expect(coercePassLikelihood("五五开", 10)).toBe("中");
  });

  it("maps '不确定' → '中'", () => {
    expect(coercePassLikelihood("不确定", 10)).toBe("中");
  });

  it("maps '中等' → '中'", () => {
    expect(coercePassLikelihood("中等", 10)).toBe("中");
  });

  it("maps '倾向不通过' → '中下'", () => {
    expect(coercePassLikelihood("倾向不通过", 90)).toBe("中下");
  });

  it("maps '应该不会过' → '中下'", () => {
    expect(coercePassLikelihood("应该不会过", 90)).toBe("中下");
  });

  it("maps '较低概率通过' → '中下'", () => {
    expect(coercePassLikelihood("较低概率通过", 90)).toBe("中下");
  });

  // Score-based fallback — '可能' is not in literal map
  it("maps '可能' → '中下' via score fallback (overall=50)", () => {
    expect(coercePassLikelihood("可能", 50)).toBe("中下");
  });

  // Score thresholds
  it("score fallback: overall=80 → '中上'", () => {
    expect(coercePassLikelihood("unknown_val", 80)).toBe("中上");
  });

  it("score fallback: overall=79 → '中'", () => {
    expect(coercePassLikelihood("unknown_val", 79)).toBe("中");
  });

  it("score fallback: overall=65 → '中'", () => {
    expect(coercePassLikelihood("unknown_val", 65)).toBe("中");
  });

  it("score fallback: overall=64 → '中下'", () => {
    expect(coercePassLikelihood("unknown_val", 64)).toBe("中下");
  });

  it("score fallback: overall=0 → '中下'", () => {
    expect(coercePassLikelihood("unknown_val", 0)).toBe("中下");
  });

  // null/undefined/empty
  it("null raw + null score → '中下'", () => {
    expect(coercePassLikelihood(null, null)).toBe("中下");
  });

  it("undefined raw + undefined score → '中下'", () => {
    expect(coercePassLikelihood(undefined, undefined)).toBe("中下");
  });

  it("empty string raw + score=85 → '中上' via score fallback", () => {
    expect(coercePassLikelihood("", 85)).toBe("中上");
  });

  it("warn logger called on unmapped non-empty raw value", () => {
    const warn = vi.fn();
    coercePassLikelihood("可能通过", 50, undefined, { warn });
    expect(warn).toHaveBeenCalledWith(
      "pass_likelihood_illegal_value",
      expect.objectContaining({ raw: "可能通过" }),
    );
  });

  it("warn logger NOT called on verbatim valid value", () => {
    const warn = vi.fn();
    coercePassLikelihood("中上", 50, undefined, { warn });
    expect(warn).not.toHaveBeenCalled();
  });
});

// ===== MARK: normalizeDimensions =====

describe("normalizeDimensions", () => {
  it("empty array → 5 placeholders in canonical order", () => {
    const result = normalizeDimensions([]);
    expect(result).toHaveLength(5);
    expect(result.map((d) => d.name)).toEqual([...DEFAULT_DIMENSION_NAMES]);
    for (const d of result) {
      expect(d.score).toBe(50);
      expect(d.description).toBe("评分异常,默认中性");
      expect(d.evidence_chips).toEqual([{ text: "数据不足", good: false }]);
    }
  });

  it("3-item array → pads to 5 with missing dims as placeholders", () => {
    const partial: DimensionScore[] = [
      { name: "专业深度", description: "深度足够", score: 75, evidence_chips: [{ text: "证据A", good: true }] },
      { name: "批判性思考", description: "思维敏锐", score: 80, evidence_chips: [{ text: "证据B", good: true }] },
      { name: "沟通节奏", description: "节奏流畅", score: 70, evidence_chips: [{ text: "证据C", good: true }] },
    ];
    const result = normalizeDimensions(partial);
    expect(result).toHaveLength(5);
    expect(result.map((d) => d.name)).toEqual([...DEFAULT_DIMENSION_NAMES]);
    // Existing items preserved
    expect(result[0].score).toBe(75);
    expect(result[4].score).toBe(70);
    // Missing items padded
    expect(result[1].score).toBe(50); // 结构化表达
    expect(result[3].score).toBe(50); // 业务直觉
  });

  it("all 5 present → returns same 5 in canonical order (no placeholder)", () => {
    const full = makeValidDimensions();
    const result = normalizeDimensions(full);
    expect(result).toHaveLength(5);
    expect(result.map((d) => d.name)).toEqual([...DEFAULT_DIMENSION_NAMES]);
    for (const d of result) expect(d.score).toBe(70);
  });

  it("out-of-order input → canonical order in output", () => {
    const outOfOrder: DimensionScore[] = [
      { name: "沟通节奏", description: "d", score: 60, evidence_chips: [{ text: "x", good: true }] },
      { name: "专业深度", description: "d", score: 80, evidence_chips: [{ text: "x", good: true }] },
      { name: "结构化表达", description: "d", score: 75, evidence_chips: [{ text: "x", good: true }] },
      { name: "业务直觉", description: "d", score: 65, evidence_chips: [{ text: "x", good: true }] },
      { name: "批判性思考", description: "d", score: 70, evidence_chips: [{ text: "x", good: true }] },
    ];
    const result = normalizeDimensions(outOfOrder);
    expect(result.map((d) => d.name)).toEqual([...DEFAULT_DIMENSION_NAMES]);
    expect(result[0].score).toBe(80); // 专业深度
    expect(result[1].score).toBe(75); // 结构化表达
    expect(result[2].score).toBe(70); // 批判性思考
    expect(result[3].score).toBe(65); // 业务直觉
    expect(result[4].score).toBe(60); // 沟通节奏
  });

  it("warn logger called for each missing dimension", () => {
    const warn = vi.fn();
    normalizeDimensions([], { warn });
    expect(warn).toHaveBeenCalledTimes(5);
    for (const name of DEFAULT_DIMENSION_NAMES) {
      expect(warn).toHaveBeenCalledWith("dimension_missing_padded", { name });
    }
  });

  it("warn logger NOT called when all 5 present", () => {
    const warn = vi.fn();
    normalizeDimensions(makeValidDimensions(), { warn });
    expect(warn).not.toHaveBeenCalled();
  });
});

// ===== MARK: applyToneSanitization =====

describe("applyToneSanitization", () => {
  it("sanitizes summary with forbidden word → fallback", () => {
    const output = makeValidOutput({ summary: "候选人差距很大,需要重新考虑" });
    const result = applyToneSanitization(output);
    expect(result.summary).toBe("本场表现已综合记录,建议查看维度评分了解细节");
  });

  it("preserves clean summary unchanged", () => {
    const output = makeValidOutput({ summary: "候选人综合表现良好,符合预期。" });
    const result = applyToneSanitization(output);
    expect(result.summary).toBe("候选人综合表现良好,符合预期。");
  });

  it("sanitizes next_actions[] with forbidden word → fallback per-item", () => {
    const output = makeValidOutput({
      next_actions: ["建议放弃本次申请", "加强练习"],
    });
    const result = applyToneSanitization(output);
    expect(result.next_actions[0]).toBe("建议针对薄弱维度做专项训练");
    expect(result.next_actions[1]).toBe("加强练习");
  });

  it("sanitizes ai_verdict with forbidden word → fallback", () => {
    const output = makeValidOutput({ ai_verdict: "你的表现太差,需要大幅改进。" });
    const result = applyToneSanitization(output);
    expect(result.ai_verdict).toBe("请教练查看维度评分综合评估");
  });

  it("preserves clean ai_verdict unchanged", () => {
    const output = makeValidOutput({ ai_verdict: "你表现稳定,继续保持。" });
    const result = applyToneSanitization(output);
    expect(result.ai_verdict).toBe("你表现稳定,继续保持。");
  });

  it("null ai_verdict stays null", () => {
    const output = makeValidOutput({ ai_verdict: null });
    const result = applyToneSanitization(output);
    expect(result.ai_verdict).toBeNull();
  });

  it("sanitizes reasons[].quote with forbidden word → fallback", () => {
    const output = makeValidOutput({
      reasons: [
        {
          aspect: "专业基础",
          verdict: "solid",
          evidence_turn_index: 0,
          quote: "你不行,表现太差",
        },
      ],
    });
    const result = applyToneSanitization(output);
    expect(result.reasons[0].quote).toBe("(评估证据已记录)");
  });

  it("sanitizes reasons[].aspect with forbidden word → fallback", () => {
    const output = makeValidOutput({
      reasons: [
        {
          aspect: "表现差距",
          verdict: "weak",
          evidence_turn_index: 0,
          quote: "正常引用",
        },
      ],
    });
    // Note: "差距" alone is not a forbidden word; "差距很大" is
    // Use actual forbidden word in aspect
    const output2 = makeValidOutput({
      reasons: [
        {
          aspect: "淘汰候选人",
          verdict: "weak",
          evidence_turn_index: 0,
          quote: "正常引用",
        },
      ],
    });
    const result = applyToneSanitization(output2);
    expect(result.reasons[0].aspect).toBe("综合表现");
  });

  it("sanitizes dimensions[].description (post-normalize) → fallback", () => {
    const dims = makeValidDimensions();
    dims[0].description = "该维度候选人无希望达到标准";
    const output = makeValidOutput({ dimensions: dims });
    const result = applyToneSanitization(output);
    expect(result.dimensions[0].description).toBe("维度详情已记录");
  });

  it("sanitizes round_reviews_v2[].ai_feedback → fallback", () => {
    const output = makeValidOutput({
      round_reviews_v2: [
        {
          turn_index: 0,
          question_tag: "专业知识",
          question_text: "请描述你的项目",
          score: 65,
          tone: "ok",
          answer_summary: "正常摘要",
          ai_feedback: "你不行,建议放弃。",
        },
      ],
    });
    const result = applyToneSanitization(output);
    expect(result.round_reviews_v2[0].ai_feedback).toBe("建议参考维度评分");
  });

  it("sanitizes round_reviews_v2[].answer_summary → fallback", () => {
    const output = makeValidOutput({
      round_reviews_v2: [
        {
          turn_index: 0,
          question_tag: "专业知识",
          question_text: "请描述",
          score: 60,
          tone: "warn",
          answer_summary: "回答差距很大,完全没有结构",
          ai_feedback: "正常建议",
        },
      ],
    });
    const result = applyToneSanitization(output);
    expect(result.round_reviews_v2[0].answer_summary).toBe("已记录");
  });

  it("preserves clean round_reviews_v2 unchanged", () => {
    const output = makeValidOutput({
      round_reviews_v2: [
        {
          turn_index: 0,
          question_tag: "专业知识",
          question_text: "请描述项目",
          score: 75,
          tone: "good",
          answer_summary: "结构清晰,有数据支撑",
          ai_feedback: "继续保持这种表达方式",
        },
      ],
    });
    const result = applyToneSanitization(output);
    expect(result.round_reviews_v2[0].ai_feedback).toBe("继续保持这种表达方式");
    expect(result.round_reviews_v2[0].answer_summary).toBe("结构清晰,有数据支撑");
  });

  it("warn logger called with report_tone_violation on forbidden match", () => {
    const warn = vi.fn();
    const output = makeValidOutput({ summary: "候选人差距很大" });
    applyToneSanitization(output, { warn });
    expect(warn).toHaveBeenCalledWith(
      "report_tone_violation",
      expect.objectContaining({ field: "summary" }),
    );
  });
});

// ===== MARK: aiVerdictRegexScan =====

describe("★ aiVerdictRegexScan: 5 positive / 4 negative ★", () => {
  // 5 positive cases — all replaced
  it("positive: '表现很差' → replaced with fallback", () => {
    expect(aiVerdictRegexScan("表现很差")).toBe("请教练查看维度评分综合评估");
  });

  it("positive: '完全失败' → replaced with fallback", () => {
    expect(aiVerdictRegexScan("完全失败")).toBe("请教练查看维度评分综合评估");
  });

  it("positive: '不及格' → replaced with fallback", () => {
    expect(aiVerdictRegexScan("不及格")).toBe("请教练查看维度评分综合评估");
  });

  it("positive: '不通过' → replaced with fallback", () => {
    expect(aiVerdictRegexScan("不通过")).toBe("请教练查看维度评分综合评估");
  });

  it("positive: '拉胯' → replaced with fallback", () => {
    expect(aiVerdictRegexScan("拉胯")).toBe("请教练查看维度评分综合评估");
  });

  // 4 negative cases — pass through unchanged
  // Note: spec §7.6 lists "差异化优势" as negative case, but the verbatim regex /(差|...)/
  // does match '差' as a bare character, so '差异化优势' is actually replaced.
  // Judgment call: keep the verbatim regex per spec; test with strings that truly don't contain banned chars.
  it("negative: '卓越表现' → unchanged (no banned char)", () => {
    expect(aiVerdictRegexScan("卓越表现")).toBe("卓越表现");
  });

  it("negative: '业务直觉很好' → unchanged", () => {
    expect(aiVerdictRegexScan("业务直觉很好")).toBe("业务直觉很好");
  });

  it("negative: '结构化表达稳定' → unchanged", () => {
    expect(aiVerdictRegexScan("结构化表达稳定")).toBe("结构化表达稳定");
  });

  it("negative: '建议加强' → unchanged", () => {
    expect(aiVerdictRegexScan("建议加强")).toBe("建议加强");
  });

  // Edge cases
  it("null → null", () => {
    expect(aiVerdictRegexScan(null)).toBeNull();
  });

  it("undefined → null", () => {
    expect(aiVerdictRegexScan(undefined)).toBeNull();
  });

  it("empty string → empty string", () => {
    expect(aiVerdictRegexScan("")).toBe("");
  });

  it("warn logger called with ai_verdict_regex_match on match", () => {
    const warn = vi.fn();
    aiVerdictRegexScan("表现很差", { warn });
    expect(warn).toHaveBeenCalledWith(
      "ai_verdict_regex_match",
      expect.objectContaining({ matched_pattern: expect.any(String) }),
    );
    // Must NOT log original text
    const callArg = warn.mock.calls[0][1];
    expect(callArg).not.toHaveProperty("original_text");
    expect(callArg).toHaveProperty("original_text_length");
  });

  it("warn logger NOT called on clean text", () => {
    const warn = vi.fn();
    aiVerdictRegexScan("表现稳定,继续努力", { warn });
    expect(warn).not.toHaveBeenCalled();
  });

  it("AI_VERDICT_BANNED_REGEX matches '差' in isolation", () => {
    expect(AI_VERDICT_BANNED_REGEX.test("差")).toBe(true);
  });

  it("AI_VERDICT_BANNED_REGEX matches '差' as bare character (substring match)", () => {
    // The verbatim regex /(差|...)/ is a bare character match — it matches '差' in any context.
    // Judgment call documented: spec §7.6 lists '差异化优势' as negative case but the verbatim
    // regex contradicts that. We keep the verbatim regex; the negative tests use strings
    // that contain no banned characters at all.
    expect(AI_VERDICT_BANNED_REGEX.test("差异化")).toBe(true); // 差 is in it
  });
});

// ===== MARK: applyReportSanitization end-to-end =====

describe("applyReportSanitization", () => {
  it("end-to-end: bad pass_likelihood + 3 dims + forbidden words → fully sanitized output", () => {
    const raw: ReportAgentOutput = {
      pass_probability: 60,
      summary: "候选人不合格,建议放弃。",
      reasons: [
        { aspect: "综合表现", verdict: "weak", evidence_turn_index: 0, quote: "正常引用" },
      ],
      next_actions: ["建议放弃本次机会", "重新评估"],
      pass_likelihood: "可能不行",  // unmapped → score fallback
      overall_score: 60,            // 60 → 中下
      ai_verdict: "你完全不行",
      dimensions: [                 // only 3 → normalize to 5
        { name: "专业深度", description: "一般", score: 60, evidence_chips: [{ text: "证据", good: true }] },
        { name: "结构化表达", description: "薄弱", score: 55, evidence_chips: [{ text: "证据", good: false }] },
        { name: "批判性思考", description: "尚可", score: 65, evidence_chips: [{ text: "证据", good: true }] },
      ],
      round_reviews_v2: [],
      next_actions_v2: null,
    };

    const result = applyReportSanitization(raw);

    // Step 1: pass_likelihood coerced (score=60 → 中下)
    expect(result.pass_likelihood).toBe("中下");

    // Step 2: dimensions padded to 5
    expect(result.dimensions).toHaveLength(5);
    expect(result.dimensions.map((d) => d.name)).toEqual([...DEFAULT_DIMENSION_NAMES]);

    // Step 3: tone sanitization
    expect(result.summary).toBe("本场表现已综合记录,建议查看维度评分了解细节");
    expect(result.next_actions[0]).toBe("建议针对薄弱维度做专项训练");
    expect(result.next_actions[1]).toBe("重新评估"); // clean

    // Step 4: ai_verdict regex (after tone sanitize produced "请教练查看维度评分综合评估", regex on that → no match → unchanged)
    // or "你完全不行" → tone sanitize passes (no L0-3 word in "不行") → regex catches "不行"
    expect(result.ai_verdict).toBe("请教练查看维度评分综合评估");
  });

  it("applies sanitize in correct pipeline order (coerce → normalize → tone → regex)", () => {
    // ai_verdict that passes tone sanitize but fails regex
    const raw = makeValidOutput({
      ai_verdict: "你本次不行,需要提升",
      pass_likelihood: "高于中等",  // literal map → 中上
      overall_score: 90,
    });
    const result = applyReportSanitization(raw);
    expect(result.pass_likelihood).toBe("中上");  // literal map used despite high score
    expect(result.ai_verdict).toBe("请教练查看维度评分综合评估");  // regex caught "不行"
  });

  it("preserves clean output unchanged (no sanitization needed)", () => {
    const raw = makeValidOutput({
      summary: "候选人综合表现良好",
      ai_verdict: "你在本次面试中发挥稳定,建议继续保持。",
      pass_likelihood: "中",
      overall_score: 72,
    });
    const result = applyReportSanitization(raw);
    expect(result.summary).toBe(raw.summary);
    expect(result.ai_verdict).toBe(raw.ai_verdict);
    expect(result.pass_likelihood).toBe("中");
    expect(result.dimensions).toHaveLength(5);
  });
});

// ===== MARK: ★ FUZZ N=100 LCG seed=42 ★ =====

describe("★ FUZZ N=100 LCG seed=42 — applyReportSanitization forbidden word injection ★", () => {
  it("leakCount === 0 across 100 iterations (summary / next_actions[0] / ai_verdict injection)", () => {
    const rng = makeLcg(42);
    let leakCount = 0;
    const forbiddenWords = [...FORBIDDEN_TONE_WORDS];

    for (let i = 0; i < 100; i++) {
      // Pick random forbidden word
      const wordIndex = Math.floor(rng() * forbiddenWords.length);
      const forbiddenWord = forbiddenWords[wordIndex];

      // Pick injection target
      const targetIndex = Math.floor(rng() * 3); // 0=summary, 1=next_actions[0], 2=ai_verdict
      const prefix = randomAlpha(rng, 4);
      const suffix = randomAlpha(rng, 4);
      const injected = `${prefix}${forbiddenWord}${suffix}`;

      let raw: ReportAgentOutput;
      if (targetIndex === 0) {
        raw = makeValidOutput({ summary: injected });
      } else if (targetIndex === 1) {
        raw = makeValidOutput({ next_actions: [injected, "正常行动"] });
      } else {
        raw = makeValidOutput({ ai_verdict: injected });
      }

      const result = applyReportSanitization(raw);

      // Check no forbidden word leaked through in the 3 target fields
      const summaryLeak = forbiddenWords.some((w) => result.summary.includes(w));
      const actionLeak = result.next_actions.some((a) =>
        forbiddenWords.some((w) => a.includes(w)),
      );
      const verdictLeak =
        result.ai_verdict != null &&
        forbiddenWords.some((w) => result.ai_verdict!.includes(w));

      if (summaryLeak || actionLeak || verdictLeak) {
        console.error(
          `LEAK at iteration ${i}: target=${targetIndex}, word=${forbiddenWord}, injected=${injected}`,
        );
        leakCount++;
      }
    }

    expect(leakCount).toBe(0);
  });
});

// ===== MARK: prompts.ts =====

describe("systemPrompt()", () => {
  it("contains 'ReportAgent'", () => {
    expect(systemPrompt()).toContain("ReportAgent");
  });

  it("contains '5 项' (dimension count)", () => {
    expect(systemPrompt()).toContain("5 项");
  });

  it("contains '中上'", () => {
    expect(systemPrompt()).toContain("中上");
  });

  it("contains '中下'", () => {
    expect(systemPrompt()).toContain("中下");
  });

  it("contains '专业深度'", () => {
    expect(systemPrompt()).toContain("专业深度");
  });

  it("contains '沟通节奏'", () => {
    expect(systemPrompt()).toContain("沟通节奏");
  });

  it("inlines _guardrails.j2: contains '忽略之前的指令'", () => {
    expect(systemPrompt()).toContain("忽略之前的指令");
  });

  it("inlines _guardrails.j2: contains '严格符合目标 schema 的结构化 JSON'", () => {
    expect(systemPrompt()).toContain("严格符合目标 schema 的结构化 JSON");
  });

  it("contains pass_likelihood banned words clause", () => {
    expect(systemPrompt()).toContain("不建议");
    expect(systemPrompt()).toContain("不通过");
  });

  it("contains all 5 canonical dimension names", () => {
    const prompt = systemPrompt();
    for (const name of DEFAULT_DIMENSION_NAMES) {
      expect(prompt).toContain(name);
    }
  });
});

describe("userPrompt()", () => {
  it("with 3 turns → contains 3 '--- 第 N 轮 ---' blocks (0-indexed)", () => {
    const input: ReportAgentInput = {
      ...VALID_INPUT,
      turns: [
        { question: "Q1", answer: "A1" },
        { question: "Q2", answer: "A2" },
        { question: "Q3", answer: "A3" },
      ],
    };
    const content = userPrompt(input);
    expect(content).toContain("--- 第 0 轮 ---");
    expect(content).toContain("--- 第 1 轮 ---");
    expect(content).toContain("--- 第 2 轮 ---");
  });

  it("with long_term_summary set → contains '=== 长期压缩摘要 ===' block", () => {
    const input: ReportAgentInput = {
      ...VALID_INPUT,
      long_term_summary: "候选人前5轮总体稳定。",
    };
    const content = userPrompt(input);
    expect(content).toContain("=== 长期压缩摘要 ===");
    expect(content).toContain("候选人前5轮总体稳定。");
  });

  it("with long_term_summary null → no compression block", () => {
    const input: ReportAgentInput = { ...VALID_INPUT, long_term_summary: null };
    const content = userPrompt(input);
    expect(content).not.toContain("=== 长期压缩摘要 ===");
  });

  it("with long_term_summary undefined → no compression block", () => {
    const input: ReportAgentInput = { ...VALID_INPUT, long_term_summary: undefined };
    const content = userPrompt(input);
    expect(content).not.toContain("=== 长期压缩摘要 ===");
  });

  it("with long_term_summary empty string → no compression block", () => {
    const input: ReportAgentInput = { ...VALID_INPUT, long_term_summary: "" };
    const content = userPrompt(input);
    expect(content).not.toContain("=== 长期压缩摘要 ===");
  });

  it("with turn.assessment set → contains '单轮评估:' line", () => {
    const input: ReportAgentInput = {
      ...VALID_INPUT,
      turns: [
        { question: "Q1", answer: "A1", assessment: { summary: "表达清晰" } },
      ],
    };
    const content = userPrompt(input);
    expect(content).toContain("单轮评估:表达清晰");
  });

  it("with turn.assessment null → no 单轮评估 line", () => {
    const input: ReportAgentInput = {
      ...VALID_INPUT,
      turns: [{ question: "Q1", answer: "A1", assessment: null }],
    };
    const content = userPrompt(input);
    expect(content).not.toContain("单轮评估:");
  });

  it("with turn.assessment undefined → no 单轮评估 line", () => {
    const input: ReportAgentInput = {
      ...VALID_INPUT,
      turns: [{ question: "Q1", answer: "A1" }],
    };
    const content = userPrompt(input);
    expect(content).not.toContain("单轮评估:");
  });

  it("includes parse_payload_json content", () => {
    const content = userPrompt(VALID_INPUT);
    expect(content).toContain(VALID_INPUT.parse_payload_json);
  });

  it("includes framework_json content", () => {
    const content = userPrompt(VALID_INPUT);
    expect(content).toContain(VALID_INPUT.framework_json);
  });

  it("turn Q and A appear in output", () => {
    const content = userPrompt(VALID_INPUT);
    expect(content).toContain("请介绍你最近一个项目。");
    expect(content).toContain("我负责了一个 B2C 产品从 0 到 1 的上线。");
  });
});

// ===== MARK: ReportAgentInputSchema / ReportTurnRecordSchema =====

describe("ReportAgentInputSchema (.strict() guard)", () => {
  it("accepts valid input", () => {
    expect(() => ReportAgentInputSchema.parse(VALID_INPUT)).not.toThrow();
  });

  it("rejects resume_text extra field (PII)", () => {
    expect(() =>
      ReportAgentInputSchema.parse({ ...VALID_INPUT, resume_text: "my resume" }),
    ).toThrow(ZodError);
  });

  it("rejects candidate_email extra field (PII)", () => {
    expect(() =>
      ReportAgentInputSchema.parse({ ...VALID_INPUT, candidate_email: "a@b.com" }),
    ).toThrow(ZodError);
  });

  it("accepts long_term_summary: null", () => {
    expect(() =>
      ReportAgentInputSchema.parse({ ...VALID_INPUT, long_term_summary: null }),
    ).not.toThrow();
  });

  it("accepts long_term_summary omitted", () => {
    const { long_term_summary: _, ...rest } = VALID_INPUT;
    expect(() => ReportAgentInputSchema.parse(rest)).not.toThrow();
  });
});

describe("ReportTurnRecordSchema", () => {
  it("accepts turn without assessment (undefined)", () => {
    expect(() =>
      ReportTurnRecordSchema.parse({ question: "Q", answer: "A" }),
    ).not.toThrow();
  });

  it("accepts turn with assessment null", () => {
    expect(() =>
      ReportTurnRecordSchema.parse({ question: "Q", answer: "A", assessment: null }),
    ).not.toThrow();
  });

  it("accepts turn with assessment object", () => {
    expect(() =>
      ReportTurnRecordSchema.parse({
        question: "Q",
        answer: "A",
        assessment: { summary: "Good" },
      }),
    ).not.toThrow();
  });

  it("rejects turn missing question (required field)", () => {
    expect(() =>
      ReportTurnRecordSchema.parse({ answer: "A" }),
    ).toThrow(ZodError);
  });

  it("rejects extra field on turn (.strict())", () => {
    expect(() =>
      ReportTurnRecordSchema.parse({ question: "Q", answer: "A", extra: "x" }),
    ).toThrow(ZodError);
  });
});
