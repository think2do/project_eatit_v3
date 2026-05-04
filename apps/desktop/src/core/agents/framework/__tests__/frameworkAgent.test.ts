import { describe, it, expect, vi } from "vitest";
import { ZodError, z } from "zod";
import { runFrameworkAgent, type FrameworkAgentDeps } from "../index";
import { systemPrompt, userPrompt } from "../prompts";
import {
  FrameworkAgentInputSchema,
  FrameworkAgentOutputSchema,
  FrameworkConfigInputSchema,
  PredictedQuestionBankSchema,
  type FrameworkAgentInput,
  type FrameworkAgentOutput,
} from "@/core/schemas/frameworks";
import type { LLMProvider, Message } from "@/core/llm/types";

// MARK: - Fixtures

const VALID_CONFIG = {
  level: "高级",
  style: "深入挖掘",
  duration_minutes: 30,
};

const VALID_INPUT: FrameworkAgentInput = {
  parse_payload_json: JSON.stringify({ project_hooks: [{ name: "LLM摘要Agent" }] }),
  config: VALID_CONFIG,
};

const VALID_INPUT_WITH_RESEARCH: FrameworkAgentInput = {
  parse_payload_json: JSON.stringify({ project_hooks: [{ name: "推荐系统重构" }] }),
  config: VALID_CONFIG,
  research_payload_json: JSON.stringify({ company: { recent_signals: ["IPO准备", "扩张东南亚"] } }),
};

function makeQuestion(i: number) {
  return {
    category: "general-pm" as const,
    question: `问题${i}：你如何定义产品成功`,
    why_likely: `这是 PM 面试核心题${i}`,
    related_evidence: `JD 要求数据驱动决策${i}`,
  };
}

function makeQuestions(count: number) {
  return Array.from({ length: count }, (_, i) => makeQuestion(i + 1));
}

const VALID_PACE_PLAN = {
  total_minutes: 30,
  segments: [
    { name: "暖场", rough_minutes: 3, goal: "引出简历" },
    { name: "项目深挖", rough_minutes: 20, goal: "考察项目能力" },
    { name: "反问", rough_minutes: 7, goal: "候选人提问" },
  ],
};

const VALID_PREDICTED_QUESTIONS_12 = {
  questions: makeQuestions(12),
  generated_at: new Date().toISOString(),
  sources: ["jd" as const],
};

function buildValidOutput(overrides: Partial<FrameworkAgentOutput> = {}): FrameworkAgentOutput {
  return FrameworkAgentOutputSchema.parse({
    direction: "project_deep_dive",
    focus_competencies: [
      { title: "需求抽象", why: "核心 PM 能力", probe_hint: "问具体的需求分析方法" },
      { title: "指标设计", why: "数据驱动要求", probe_hint: "问北极星指标选取" },
    ],
    opening_questions: ["请介绍一下你最近做的一个项目", "你在上一家公司的主要职责是什么"],
    deep_dive_anchors: [
      {
        anchor: "LLM摘要Agent",
        probe_chain: ["这个项目的背景是什么", "你负责哪些模块", "遇到了什么技术难点", "最终上线效果如何"],
      },
    ],
    pace_plan: VALID_PACE_PLAN,
    predicted_questions: VALID_PREDICTED_QUESTIONS_12,
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
    schema: z.ZodSchema<T>;
    messages: Message[];
    model?: string;
  }): Promise<T> {
    return this.generateObjectImpl() as Promise<T>;
  }
}

function makeProvider(output: FrameworkAgentOutput): FrameworkAgentDeps {
  return {
    llm: new MockLLMProvider(() => Promise.resolve(output)) as LLMProvider,
  };
}

// MARK: - runFrameworkAgent tests

describe("runFrameworkAgent", () => {
  // MARK: Case 1: Happy path — full output with 12 predicted_questions

  it("happy path — mock generateObject resolves with 12-question bank → result equals output", async () => {
    const output = buildValidOutput();
    const deps = makeProvider(output);

    const result = await runFrameworkAgent(VALID_INPUT, deps);

    expect(result).toEqual(output);
    expect(result.direction).toBe("project_deep_dive");
    expect(result.predicted_questions?.questions).toHaveLength(12);
  });

  // MARK: Case 2: LLM error propagates

  it("LLM error propagates as Error", async () => {
    const errorLLM = new MockLLMProvider(() => Promise.reject(new Error("LLM network error")));
    const deps: FrameworkAgentDeps = { llm: errorLLM as LLMProvider };

    await expect(runFrameworkAgent(VALID_INPUT, deps)).rejects.toThrow("LLM network error");
  });

  // MARK: Case 3: ZodError on invalid input (duration_minutes: 0 rejected)

  it("ZodError on invalid input — duration_minutes: 0 rejected", async () => {
    const deps = makeProvider(buildValidOutput());
    await expect(
      runFrameworkAgent(
        { ...VALID_INPUT, config: { ...VALID_CONFIG, duration_minutes: 0 } },
        deps,
      ),
    ).rejects.toThrow(ZodError);
  });

  // MARK: Case 4a: ★ predicted_questions 7 questions → REJECT (boundary test)

  it("★ boundary: predicted_questions with 7 questions → schema rejects (< 8 not allowed)", () => {
    expect(() =>
      FrameworkAgentOutputSchema.parse({
        direction: "project_deep_dive",
        focus_competencies: [{ title: "需求抽象", why: "核心", probe_hint: "问具体" }],
        opening_questions: ["请介绍项目"],
        deep_dive_anchors: [],
        pace_plan: VALID_PACE_PLAN,
        predicted_questions: {
          questions: makeQuestions(7),
          generated_at: new Date().toISOString(),
          sources: ["jd"],
        },
      }),
    ).toThrow(ZodError);
  });

  // MARK: Case 4b: ★ predicted_questions 8 questions → ACCEPT (boundary test)

  it("★ boundary: predicted_questions with 8 questions → schema accepts (= min)", () => {
    expect(() =>
      FrameworkAgentOutputSchema.parse({
        direction: "project_deep_dive",
        focus_competencies: [{ title: "需求抽象", why: "核心", probe_hint: "问具体" }],
        opening_questions: ["请介绍项目"],
        deep_dive_anchors: [],
        pace_plan: VALID_PACE_PLAN,
        predicted_questions: {
          questions: makeQuestions(8),
          generated_at: new Date().toISOString(),
          sources: ["jd"],
        },
      }),
    ).not.toThrow();
  });

  // MARK: Case 4c: ★ predicted_questions 15 questions → ACCEPT (boundary test)

  it("★ boundary: predicted_questions with 15 questions → schema accepts (= max)", () => {
    expect(() =>
      FrameworkAgentOutputSchema.parse({
        direction: "project_deep_dive",
        focus_competencies: [{ title: "需求抽象", why: "核心", probe_hint: "问具体" }],
        opening_questions: ["请介绍项目"],
        deep_dive_anchors: [],
        pace_plan: VALID_PACE_PLAN,
        predicted_questions: {
          questions: makeQuestions(15),
          generated_at: new Date().toISOString(),
          sources: ["jd"],
        },
      }),
    ).not.toThrow();
  });

  // MARK: Case 4d: ★ predicted_questions 16 questions → REJECT (boundary test)

  it("★ boundary: predicted_questions with 16 questions → schema rejects (> 15 not allowed)", () => {
    expect(() =>
      FrameworkAgentOutputSchema.parse({
        direction: "project_deep_dive",
        focus_competencies: [{ title: "需求抽象", why: "核心", probe_hint: "问具体" }],
        opening_questions: ["请介绍项目"],
        deep_dive_anchors: [],
        pace_plan: VALID_PACE_PLAN,
        predicted_questions: {
          questions: makeQuestions(16),
          generated_at: new Date().toISOString(),
          sources: ["jd"],
        },
      }),
    ).toThrow(ZodError);
  });

  // MARK: Case 5: predicted_questions: null accepted

  it("predicted_questions: null is accepted (legitimate no-bank case)", async () => {
    const output = buildValidOutput({ predicted_questions: null });
    const deps = makeProvider(output);

    const result = await runFrameworkAgent(VALID_INPUT, deps);

    expect(result.predicted_questions).toBeNull();
  });

  // MARK: Case 6: direction enum — 4 valid values accepted

  it("direction 'project_deep_dive' accepted", () => {
    expect(() =>
      FrameworkAgentOutputSchema.parse(buildValidOutput({ direction: "project_deep_dive" })),
    ).not.toThrow();
  });

  it("direction 'competency_probe' accepted", () => {
    expect(() =>
      FrameworkAgentOutputSchema.parse(buildValidOutput({ direction: "competency_probe" })),
    ).not.toThrow();
  });

  it("direction 'culture_fit' accepted", () => {
    expect(() =>
      FrameworkAgentOutputSchema.parse(buildValidOutput({ direction: "culture_fit" })),
    ).not.toThrow();
  });

  it("direction 'hybrid' accepted", () => {
    expect(() =>
      FrameworkAgentOutputSchema.parse(buildValidOutput({ direction: "hybrid" })),
    ).not.toThrow();
  });

  it("direction 'invalid_direction' rejected", () => {
    expect(() =>
      FrameworkAgentOutputSchema.parse(buildValidOutput({ direction: "invalid_direction" as never })),
    ).toThrow(ZodError);
  });
});

// MARK: - Schema unit tests

describe("FrameworkAgentInputSchema", () => {
  // MARK: §A11 — outer .strict() rejects extra PII field

  it("§A11: .strict() rejects extra PII field (resume_text) at outer level", () => {
    expect(() =>
      FrameworkAgentInputSchema.parse({
        parse_payload_json: "{}",
        config: VALID_CONFIG,
        resume_text: "candidate personal data",
      }),
    ).toThrow(ZodError);
  });

  // MARK: §A11 — nested config .strict() rejects extra field

  it("§A11: FrameworkConfigInputSchema.strict() rejects extra field at nested config level", () => {
    expect(() =>
      FrameworkAgentInputSchema.parse({
        parse_payload_json: "{}",
        config: { ...VALID_CONFIG, candidate_name: "张三" },
      }),
    ).toThrow(ZodError);
  });

  it("accepts research_payload_json as null", () => {
    expect(() =>
      FrameworkAgentInputSchema.parse({
        parse_payload_json: "{}",
        config: VALID_CONFIG,
        research_payload_json: null,
      }),
    ).not.toThrow();
  });

  it("accepts research_payload_json as omitted (undefined)", () => {
    expect(() =>
      FrameworkAgentInputSchema.parse({
        parse_payload_json: "{}",
        config: VALID_CONFIG,
      }),
    ).not.toThrow();
  });

  it("accepts research_payload_json as string", () => {
    expect(() =>
      FrameworkAgentInputSchema.parse({
        parse_payload_json: "{}",
        config: VALID_CONFIG,
        research_payload_json: '{"company": {}}',
      }),
    ).not.toThrow();
  });
});

describe("FrameworkConfigInputSchema", () => {
  it("rejects duration_minutes: 0 (ge=1 constraint)", () => {
    expect(() =>
      FrameworkConfigInputSchema.parse({ level: "高级", style: "深入挖掘", duration_minutes: 0 }),
    ).toThrow(ZodError);
  });

  it("accepts duration_minutes: 1 (min boundary)", () => {
    expect(() =>
      FrameworkConfigInputSchema.parse({ level: "初级", style: "友好", duration_minutes: 1 }),
    ).not.toThrow();
  });
});

describe("FrameworkAgentOutputSchema", () => {
  // MARK: §A11 — output .strict() rejects extra field

  it("§A11: .strict() rejects extra field on output", () => {
    expect(() =>
      FrameworkAgentOutputSchema.parse({
        ...buildValidOutput(),
        extra_field: "bad",
      }),
    ).toThrow(ZodError);
  });

  it("accepts predicted_questions as omitted (optional)", () => {
    expect(() =>
      FrameworkAgentOutputSchema.parse({
        direction: "hybrid",
        focus_competencies: [{ title: "协作", why: "文化适配", probe_hint: "问跨部门案例" }],
        opening_questions: ["请做个自我介绍"],
        deep_dive_anchors: [],
        pace_plan: VALID_PACE_PLAN,
      }),
    ).not.toThrow();
  });

  it("pace_plan.segments[].rough_minutes < 1 rejected", () => {
    expect(() =>
      FrameworkAgentOutputSchema.parse({
        direction: "project_deep_dive",
        focus_competencies: [{ title: "执行力", why: "核心", probe_hint: "问项目" }],
        opening_questions: ["请介绍项目"],
        deep_dive_anchors: [],
        pace_plan: {
          total_minutes: 30,
          segments: [{ name: "暖场", rough_minutes: 0, goal: "引出简历" }],
        },
      }),
    ).toThrow(ZodError);
  });
});

// MARK: - PredictedQuestionBankSchema direct boundary tests

describe("PredictedQuestionBankSchema — 8-15 lock (§L0 #14)", () => {
  it("rejects 7 questions (below min=8)", () => {
    expect(() =>
      PredictedQuestionBankSchema.parse({
        questions: makeQuestions(7),
        generated_at: new Date().toISOString(),
        sources: ["jd"],
      }),
    ).toThrow(ZodError);
  });

  it("accepts 8 questions (= min)", () => {
    expect(() =>
      PredictedQuestionBankSchema.parse({
        questions: makeQuestions(8),
        generated_at: new Date().toISOString(),
        sources: ["jd"],
      }),
    ).not.toThrow();
  });

  it("accepts 15 questions (= max)", () => {
    expect(() =>
      PredictedQuestionBankSchema.parse({
        questions: makeQuestions(15),
        generated_at: new Date().toISOString(),
        sources: ["jd"],
      }),
    ).not.toThrow();
  });

  it("rejects 16 questions (above max=15)", () => {
    expect(() =>
      PredictedQuestionBankSchema.parse({
        questions: makeQuestions(16),
        generated_at: new Date().toISOString(),
        sources: ["jd"],
      }),
    ).toThrow(ZodError);
  });
});

// MARK: - prompts.ts tests

describe("systemPrompt()", () => {
  it('contains "FrameworkAgent"', () => {
    expect(systemPrompt()).toContain("FrameworkAgent");
  });

  it('contains "8~15" (predicted_questions length constraint)', () => {
    expect(systemPrompt()).toContain("8~15");
  });

  it('contains "project_deep_dive" (direction enum value)', () => {
    expect(systemPrompt()).toContain("project_deep_dive");
  });

  it('contains "predicted_questions" (field name)', () => {
    expect(systemPrompt()).toContain("predicted_questions");
  });

  it('inlines _guardrails.j2: contains "忽略之前的指令"', () => {
    expect(systemPrompt()).toContain("忽略之前的指令");
  });

  it('inlines _guardrails.j2: contains "严格符合目标 schema 的结构化 JSON"', () => {
    expect(systemPrompt()).toContain("严格符合目标 schema 的结构化 JSON");
  });
});

describe("userPrompt()", () => {
  it("with research_payload_json truthy → contains F-321 research section header", () => {
    const content = userPrompt(VALID_INPUT_WITH_RESEARCH);
    expect(content).toContain("=== Research 结果(JSON,F-321 输入)===");
    expect(content).toContain(VALID_INPUT_WITH_RESEARCH.research_payload_json!);
  });

  it("with research_payload_json null → contains else branch text", () => {
    const content = userPrompt({ ...VALID_INPUT, research_payload_json: null });
    expect(content).toContain("(本次未联网或用户未启用 Research opt-in");
  });

  it("with research_payload_json undefined → same else branch as null", () => {
    const content = userPrompt({ ...VALID_INPUT, research_payload_json: undefined });
    expect(content).toContain("(本次未联网或用户未启用 Research opt-in");
  });

  it("with research_payload_json undefined → does NOT contain F-321 header", () => {
    const content = userPrompt({ ...VALID_INPUT });
    expect(content).not.toContain("=== Research 结果(JSON,F-321 输入)===");
  });

  it("always includes parse_payload_json content", () => {
    const content = userPrompt(VALID_INPUT);
    expect(content).toContain(VALID_INPUT.parse_payload_json);
  });

  it("always includes config.level", () => {
    const content = userPrompt(VALID_INPUT);
    expect(content).toContain(VALID_CONFIG.level);
  });

  it("always includes config.style", () => {
    const content = userPrompt(VALID_INPUT);
    expect(content).toContain(VALID_CONFIG.style);
  });

  it("always includes config.duration_minutes", () => {
    const content = userPrompt(VALID_INPUT);
    expect(content).toContain(String(VALID_CONFIG.duration_minutes));
  });
});
