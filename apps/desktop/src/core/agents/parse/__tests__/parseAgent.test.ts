import { describe, it, expect, vi } from "vitest";
import { ZodError } from "zod";
import {
  runParseAgent,
  deriveMatchScore,
  ensureInterviewFocus,
  type ParseAgentDeps,
} from "../index";
import {
  ParseAgentInputSchema,
  ParseOutputSchema,
  MatchScoreSchema,
  type ParseOutput,
  type InterviewFocus,
} from "@/core/schemas/parse";
import type { LLMProvider } from "@/core/llm/types";

// MARK: - Fixtures

const VALID_INPUT = {
  resume_text: "5年AI产品经理经验,曾主导LLM应用从0到1落地。",
  jd_text: "招聘AI产品经理,要求3年以上AI产品经验,熟悉B端SaaS产品。",
};

const FOCUS_1: InterviewFocus = {
  direction_id: "ai-insight",
  priority: "high",
  title: "AI洞察力",
  description: "考察候选人对AI产品的深度理解与应用能力。",
};

const FOCUS_2: InterviewFocus = {
  direction_id: "data-driven",
  priority: "mid",
  title: "数据驱动",
  description: "考察候选人基于数据做决策的能力与习惯。",
};

const FOCUS_3: InterviewFocus = {
  direction_id: "strategy",
  priority: "low",
  title: "战略思维",
  description: "考察候选人的产品战略规划与执行能力。",
};

function buildValidOutput(overrides: Partial<ParseOutput> = {}): ParseOutput {
  return ParseOutputSchema.parse({
    job_requirements: [{ title: "AI产品经验", detail: "要求3年以上AI产品经验" }],
    candidate_highlights: [{ title: "LLM落地经验", detail: "曾主导LLM应用从0到1全链路落地" }],
    candidate_risks: [{ title: "C端经验不足", detail: "简历中未见纯C端产品案例" }],
    project_hooks: [
      {
        project_name: "智能客服助手",
        reason: "LLM应用主打项目",
        focus_points: ["指标设计", "上线复盘"],
      },
    ],
    match_score: { score: 82, level: "HIGH", one_line: "AI产品落地经验对齐度高" },
    candidate_profile: {
      role: "AI产品经理",
      years: 5,
      companies: ["公司A"],
      domain_tags: ["LLM", "B端"],
    },
    profile_summary: "候选人具有丰富的AI产品经验,熟悉LLM应用落地全链路。",
    match_advantages: [
      { label: "LLM应用经验", tag: "强匹配", evidence: "曾主导LLM应用从0到1全链路落地。" },
      { label: "跨职能协作", tag: "匹配", evidence: "与工程/设计/数据团队深度协作经验丰富。" },
    ],
    gaps: [
      { label: "C端经验", tag: "待评估", evidence: "简历中未见纯C端产品案例,需进一步了解。" },
    ],
    interview_focus: [FOCUS_1, FOCUS_2],
    project_hooks_v32: [{ name: "智能客服LLM助手", why: "主打项目,可深挖指标设计与上线复盘" }],
    jd_company_name: "某AI科技公司",
    jd_role_title: "AI产品经理",
    jd_industry_hints: ["AI应用", "B端SaaS"],
    ...overrides,
  });
}

// MARK: - Mock LLMProvider

class MockLLMProvider implements LLMProvider {
  private generateObjectImpl: () => Promise<unknown>;

  constructor(generateObjectImpl: () => Promise<unknown>) {
    this.generateObjectImpl = generateObjectImpl;
  }

  chat = vi.fn();
  chatStream = vi.fn();

  generateObject<T>(_req: {
    schema: import("zod").ZodSchema<T>;
    messages: import("@/core/llm/types").Message[];
    model?: string;
  }): Promise<T> {
    return this.generateObjectImpl() as Promise<T>;
  }
}

function makeProvider(output: ParseOutput): ParseAgentDeps {
  return {
    llm: new MockLLMProvider(() => Promise.resolve(output)) as LLMProvider,
  };
}

// MARK: - Test suite

describe("runParseAgent", () => {
  // MARK: Case 1: Happy path

  it("happy path — valid input + mock generateObject returns valid ParseOutput → equal result", async () => {
    const output = buildValidOutput();
    const deps = makeProvider(output);

    const result = await runParseAgent(VALID_INPUT, deps);

    expect(result).toEqual(output);
  });

  // MARK: Case 2: ParseAgentInputSchema rejects empty resume_text

  it("ParseAgentInputSchema rejects empty resume_text — throws ZodError (min 1)", () => {
    expect(() =>
      ParseAgentInputSchema.parse({ resume_text: "", jd_text: VALID_INPUT.jd_text }),
    ).toThrow(ZodError);
  });

  // MARK: Case 3: ParseAgentInputSchema rejects empty jd_text

  it("ParseAgentInputSchema rejects empty jd_text — throws ZodError (min 1)", () => {
    expect(() =>
      ParseAgentInputSchema.parse({ resume_text: VALID_INPUT.resume_text, jd_text: "" }),
    ).toThrow(ZodError);
  });

  // MARK: Case 4: ParseAgentInputSchema rejects extra field via .strict()

  it("ParseAgentInputSchema .strict() rejects extra field (PII guard) — throws ZodError", () => {
    expect(() =>
      ParseAgentInputSchema.parse({
        ...VALID_INPUT,
        candidate_email: "evil@example.com",
      }),
    ).toThrow(ZodError);
  });

  // MARK: Case 5: Fallback #1 — match_score derived when null (delta ≥ 2 → MID/65)

  it("Fallback #1 (delta=2) — match_score null + 3 advantages / 1 gap → derived score=65/MID", async () => {
    const output = buildValidOutput({
      match_score: null,
      match_advantages: [
        { label: "LLM经验", tag: "强匹配", evidence: "丰富的LLM应用落地经验。" },
        { label: "跨职能", tag: "匹配", evidence: "跨团队协作能力强。" },
        { label: "数据能力", tag: "匹配", evidence: "熟悉数据驱动的产品决策方法。" },
      ],
      gaps: [{ label: "C端经验", tag: "待评估", evidence: "缺乏C端产品经验。" }],
    });
    const deps = makeProvider(output);

    const result = await runParseAgent(VALID_INPUT, deps);

    expect(result.match_score).toEqual({
      score: 65,
      level: "MID",
      one_line: "自动估算:优势略多于缺口",
    });
  });

  // MARK: Case 6: Fallback #1 boundary — delta=1 → score=50/LOW

  it("Fallback #1 (delta=1) — 2 advantages / 1 gap → derived score=50/LOW", async () => {
    const output = buildValidOutput({
      match_score: null,
      match_advantages: [
        { label: "LLM经验", tag: "强匹配", evidence: "丰富的LLM应用落地经验。" },
        { label: "跨职能", tag: "匹配", evidence: "跨团队协作能力强。" },
      ],
      gaps: [{ label: "C端经验", tag: "待评估", evidence: "缺乏C端产品经验。" }],
    });
    const deps = makeProvider(output);

    const result = await runParseAgent(VALID_INPUT, deps);

    expect(result.match_score).toEqual({
      score: 50,
      level: "LOW",
      one_line: "自动估算:优劣势接近持平",
    });
  });

  // MARK: Case 7: Fallback #1 boundary — delta=0 → score=50/LOW

  it("Fallback #1 (delta=0) — 1 advantage / 1 gap → derived score=50/LOW", async () => {
    const output = buildValidOutput({
      match_score: null,
      match_advantages: [{ label: "LLM经验", tag: "强匹配", evidence: "丰富的LLM应用落地经验。" }],
      gaps: [{ label: "C端经验", tag: "待评估", evidence: "缺乏C端产品经验。" }],
    });
    const deps = makeProvider(output);

    const result = await runParseAgent(VALID_INPUT, deps);

    expect(result.match_score).toEqual({
      score: 50,
      level: "LOW",
      one_line: "自动估算:优劣势接近持平",
    });
  });

  // MARK: Case 8: Fallback #1 boundary — delta=-1 → score=40/LOW

  it("Fallback #1 (delta=-1) — 0 advantages / 1 gap → derived score=40/LOW", async () => {
    const output = buildValidOutput({
      match_score: null,
      match_advantages: [],
      gaps: [{ label: "C端经验", tag: "待评估", evidence: "缺乏C端产品经验。" }],
    });
    const deps = makeProvider(output);

    const result = await runParseAgent(VALID_INPUT, deps);

    expect(result.match_score).toEqual({
      score: 40,
      level: "LOW",
      one_line: "自动估算:缺口多于优势",
    });
  });

  // MARK: Case 9: Fallback #2 — interview_focus < 2 → prepend 2 defaults

  it("Fallback #2 — interview_focus=[1 item] → output prepends 2 defaults → length=3", async () => {
    const output = buildValidOutput({ interview_focus: [FOCUS_3] });
    const deps = makeProvider(output);

    const result = await runParseAgent(VALID_INPUT, deps);

    expect(result.interview_focus).toHaveLength(3);
    expect(result.interview_focus[0].direction_id).toBe("cross-func");
    expect(result.interview_focus[1].direction_id).toBe("zero-to-one");
    expect(result.interview_focus[2]).toEqual(FOCUS_3);
  });

  // MARK: Case 10: Fallback #2 noop — interview_focus has 2+ items

  it("Fallback #2 noop — interview_focus=[2 items] → no change", async () => {
    const output = buildValidOutput({ interview_focus: [FOCUS_1, FOCUS_2] });
    const deps = makeProvider(output);

    const result = await runParseAgent(VALID_INPUT, deps);

    expect(result.interview_focus).toHaveLength(2);
    expect(result.interview_focus).toEqual([FOCUS_1, FOCUS_2]);
  });

  // MARK: Case 11: Fallback #2 noop — interview_focus empty → prepend 2 defaults → length=2

  it("Fallback #2 — interview_focus=[] → prepend 2 defaults → length=2", async () => {
    const output = buildValidOutput({ interview_focus: [] });
    const deps = makeProvider(output);

    const result = await runParseAgent(VALID_INPUT, deps);

    expect(result.interview_focus).toHaveLength(2);
    expect(result.interview_focus[0].direction_id).toBe("cross-func");
    expect(result.interview_focus[1].direction_id).toBe("zero-to-one");
  });

  // MARK: Case 12: runParseAgent propagates ZodError for invalid input

  it("runParseAgent propagates ZodError when input fails ParseAgentInputSchema.parse", async () => {
    const deps = makeProvider(buildValidOutput());

    await expect(
      runParseAgent({ resume_text: "", jd_text: VALID_INPUT.jd_text }, deps),
    ).rejects.toThrow(ZodError);
  });
});

// MARK: - deriveMatchScore unit tests

describe("deriveMatchScore", () => {
  it("delta ≥ 2 → score=65/MID", () => {
    const result = deriveMatchScore(3, 1);
    expect(result.score).toBe(65);
    expect(result.level).toBe("MID");
    expect(result.one_line).toBe("自动估算:优势略多于缺口");
  });

  it("delta=2 (exact boundary) → score=65/MID", () => {
    const result = deriveMatchScore(2, 0);
    expect(result.score).toBe(65);
    expect(result.level).toBe("MID");
  });

  it("delta=1 → score=50/LOW", () => {
    const result = deriveMatchScore(2, 1);
    expect(result.score).toBe(50);
    expect(result.level).toBe("LOW");
  });

  it("delta=0 → score=50/LOW", () => {
    const result = deriveMatchScore(1, 1);
    expect(result.score).toBe(50);
    expect(result.level).toBe("LOW");
  });

  it("delta=-1 → score=40/LOW", () => {
    const result = deriveMatchScore(0, 1);
    expect(result.score).toBe(40);
    expect(result.level).toBe("LOW");
  });

  it("MatchScore cross-field refine sanity — all derived values pass MatchScoreSchema.parse", () => {
    const cases = [
      deriveMatchScore(5, 0),   // delta=5 → 65/MID
      deriveMatchScore(2, 1),   // delta=1 → 50/LOW
      deriveMatchScore(1, 1),   // delta=0 → 50/LOW
      deriveMatchScore(0, 1),   // delta=-1 → 40/LOW
      deriveMatchScore(0, 5),   // delta=-5 → 40/LOW
    ];
    for (const c of cases) {
      expect(() => MatchScoreSchema.parse(c)).not.toThrow();
    }
  });
});

// MARK: - ensureInterviewFocus unit tests

describe("ensureInterviewFocus", () => {
  it("empty list → [cross-func, zero-to-one]", () => {
    const result = ensureInterviewFocus([]);
    expect(result).toHaveLength(2);
    expect(result[0].direction_id).toBe("cross-func");
    expect(result[1].direction_id).toBe("zero-to-one");
  });

  it("1 item → [cross-func, zero-to-one, original]", () => {
    const result = ensureInterviewFocus([FOCUS_3]);
    expect(result).toHaveLength(3);
    expect(result[2]).toEqual(FOCUS_3);
  });

  it("2 items → unchanged", () => {
    const result = ensureInterviewFocus([FOCUS_1, FOCUS_2]);
    expect(result).toEqual([FOCUS_1, FOCUS_2]);
  });

  it("3 items → unchanged", () => {
    const result = ensureInterviewFocus([FOCUS_1, FOCUS_2, FOCUS_3]);
    expect(result).toEqual([FOCUS_1, FOCUS_2, FOCUS_3]);
  });
});
