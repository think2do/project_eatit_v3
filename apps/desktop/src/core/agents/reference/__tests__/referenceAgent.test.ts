import { describe, it, expect, vi } from "vitest";
import { ZodError } from "zod";
import { runReferenceAgent, type ReferenceAgentDeps } from "../index";
import { systemPrompt, userPrompt } from "../prompts";
import {
  ReferenceAgentInputSchema,
  ReferenceAgentOutputSchema,
  type ReferenceAgentOutput,
} from "@/core/schemas/turns";
import type { LLMProvider } from "@/core/llm/types";

// MARK: - Fixtures

const VALID_INPUT = {
  question: "在 0 到 1 的 LLM 产品里,你怎么选北极星指标?",
};

const VALID_INPUT_WITH_OPTIONALS = {
  question: "在 0 到 1 的 LLM 产品里,你怎么选北极星指标?",
  job_context: "AI PM 岗位,负责文档摘要 agent 产品从 0 到 1 落地。",
  candidate_answer: "我会先看 DAU,然后再看用户留存。",
};

function buildValidOutput(overrides: Partial<ReferenceAgentOutput> = {}): ReferenceAgentOutput {
  return ReferenceAgentOutputSchema.parse({
    answer_outline: [
      "先锁用户价值:明确产品帮助用户完成什么核心任务",
      "再拆可被影响的中间量:找到与核心价值强相关、且能被模型改动影响的指标",
      "确保指标有反脆弱性:指标不能被轻易刷,需抗噪声",
      "验证归因链路:改动模型 → 中间量变化 → 北极星指标变化",
    ],
    ideal_answer:
      "以文档摘要 agent 为例,北极星指标选择应该从用户价值出发。用户使用文档摘要的核心价值是「节省阅读时间并获得准确信息」。" +
      "因此北极星可以是「用户对摘要结果的采纳率」——即用户看完摘要后不再阅读原文的比例。" +
      "这个指标直接反映用户价值,同时可以被模型改进影响。中间量可以拆为摘要准确率、摘要覆盖率等。" +
      "避免直接用 DAU,因为 DAU 受市场推广影响大,无法归因到模型改动。",
    key_evaluation_points: [
      "能否从用户价值倒推指标,而非从技术指标出发",
      "是否理解指标可归因性(改动 → 指标变化的因果链)",
      "是否考虑了指标的反脆弱性(不易被刷)",
    ],
    common_pitfalls: [
      "一上来就用 DAU 或 MAU,无法归因到模型改动",
      "指标无法归因到模型改动,导致无法判断模型迭代效果",
      "选择过于技术化的指标(如 ROUGE score),脱离用户价值",
    ],
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

function makeProvider(output: ReferenceAgentOutput): ReferenceAgentDeps {
  return {
    llm: new MockLLMProvider(() => Promise.resolve(output)) as LLMProvider,
  };
}

// MARK: - Test suite

describe("runReferenceAgent", () => {
  // MARK: Case 1: Happy path

  it("happy path — valid input + mock generateObject returns valid ReferenceAgentOutput → equal result", async () => {
    const output = buildValidOutput();
    const deps = makeProvider(output);

    const result = await runReferenceAgent(VALID_INPUT, deps);

    expect(result).toEqual(output);
  });

  // MARK: Case 2: ReferenceAgentInputSchema rejects empty question

  it("ReferenceAgentInputSchema rejects empty question — throws ZodError (min 1)", () => {
    expect(() =>
      ReferenceAgentInputSchema.parse({ question: "" }),
    ).toThrow(ZodError);
  });

  // MARK: Case 3: ReferenceAgentInputSchema rejects extra field via .strict() (§A11 PII guard)

  it("ReferenceAgentInputSchema .strict() rejects extra field (PII guard) — throws ZodError", () => {
    expect(() =>
      ReferenceAgentInputSchema.parse({
        question: VALID_INPUT.question,
        candidate_email: "evil@example.com",
      }),
    ).toThrow(ZodError);
  });

  // MARK: Case 4: userPrompt() omits job_context section when null/undefined

  it("userPrompt() omits job_context section when job_context is undefined", () => {
    const content = userPrompt({ question: VALID_INPUT.question });
    expect(content).not.toContain("=== 岗位上下文 ===");
  });

  // MARK: Case 5: userPrompt() omits candidate_answer section when null/undefined

  it("userPrompt() omits candidate_answer section when candidate_answer is undefined", () => {
    const content = userPrompt({ question: VALID_INPUT.question });
    expect(content).not.toContain("=== 候选人作答");
  });

  // MARK: Case 6: userPrompt() includes both optional sections when both present

  it("userPrompt() includes both optional sections when job_context and candidate_answer are present", () => {
    const content = userPrompt(VALID_INPUT_WITH_OPTIONALS);
    expect(content).toContain("=== 岗位上下文 ===");
    expect(content).toContain(VALID_INPUT_WITH_OPTIONALS.job_context);
    expect(content).toContain("=== 候选人作答");
    expect(content).toContain(VALID_INPUT_WITH_OPTIONALS.candidate_answer);
  });

  // MARK: Case 7: systemPrompt() contains task-specific keywords

  it("systemPrompt() contains task-specific output field keywords", () => {
    const content = systemPrompt();
    expect(content).toContain("answer_outline");
    expect(content).toContain("ideal_answer");
    expect(content).toContain("key_evaluation_points");
    expect(content).toContain("common_pitfalls");
  });

  // MARK: Case 8: ReferenceAgentOutput shape lock

  it("ReferenceAgentOutputSchema validates 4 required fields with correct types", () => {
    const output = buildValidOutput();
    const deps = makeProvider(output);

    const result = runReferenceAgent(VALID_INPUT, deps);

    return result.then((r) => {
      expect(Array.isArray(r.answer_outline)).toBe(true);
      expect(typeof r.ideal_answer).toBe("string");
      expect(Array.isArray(r.key_evaluation_points)).toBe(true);
      expect(Array.isArray(r.common_pitfalls)).toBe(true);
    });
  });

  // MARK: Case 9: runReferenceAgent propagates ZodError for invalid input

  it("runReferenceAgent propagates ZodError when input fails ReferenceAgentInputSchema.parse", async () => {
    const deps = makeProvider(buildValidOutput());

    await expect(
      runReferenceAgent({ question: "" }, deps),
    ).rejects.toThrow(ZodError);
  });

  // MARK: Case 10: userPrompt() includes question text verbatim

  it("userPrompt() includes the question text verbatim in the output", () => {
    const content = userPrompt(VALID_INPUT);
    expect(content).toContain(VALID_INPUT.question);
    expect(content).toContain("=== 面试问题 ===");
  });

  // MARK: Case 11: userPrompt() null values treated same as undefined (omitted)

  it("userPrompt() omits sections when job_context and candidate_answer are null", () => {
    const content = userPrompt({ question: VALID_INPUT.question, job_context: null, candidate_answer: null });
    expect(content).not.toContain("=== 岗位上下文 ===");
    expect(content).not.toContain("=== 候选人作答");
  });

  // MARK: Case 12: systemPrompt() inlines guardrails

  it("systemPrompt() inlines _guardrails.j2 content (PII injection guard)", () => {
    const content = systemPrompt();
    expect(content).toContain("忽略之前的指令");
    expect(content).toContain("严格符合目标 schema 的结构化 JSON");
  });
});

// MARK: - Schema unit tests

describe("ReferenceAgentInputSchema", () => {
  it("accepts valid input with only question", () => {
    expect(() => ReferenceAgentInputSchema.parse({ question: "测试问题" })).not.toThrow();
  });

  it("accepts valid input with all optional fields", () => {
    expect(() =>
      ReferenceAgentInputSchema.parse({
        question: "测试问题",
        job_context: "AI PM",
        candidate_answer: "候选人作答内容",
      }),
    ).not.toThrow();
  });

  it("accepts null for optional fields", () => {
    expect(() =>
      ReferenceAgentInputSchema.parse({
        question: "测试问题",
        job_context: null,
        candidate_answer: null,
      }),
    ).not.toThrow();
  });

  it("rejects missing question field", () => {
    expect(() => ReferenceAgentInputSchema.parse({})).toThrow(ZodError);
  });

  it("rejects extra PII fields (candidate_phone)", () => {
    expect(() =>
      ReferenceAgentInputSchema.parse({
        question: "测试问题",
        candidate_phone: "13800138000",
      }),
    ).toThrow(ZodError);
  });
});

describe("ReferenceAgentOutputSchema", () => {
  it("accepts valid output with all required fields", () => {
    expect(() =>
      ReferenceAgentOutputSchema.parse({
        answer_outline: ["要点一", "要点二"],
        ideal_answer: "完整参考答案内容",
        key_evaluation_points: ["评估点一", "评估点二"],
        common_pitfalls: ["常见误区一"],
      }),
    ).not.toThrow();
  });

  it("rejects missing required field (ideal_answer)", () => {
    expect(() =>
      ReferenceAgentOutputSchema.parse({
        answer_outline: ["要点"],
        key_evaluation_points: ["评估点"],
        common_pitfalls: ["误区"],
      }),
    ).toThrow(ZodError);
  });

  it(".strict() rejects extra fields", () => {
    expect(() =>
      ReferenceAgentOutputSchema.parse({
        answer_outline: ["要点"],
        ideal_answer: "答案",
        key_evaluation_points: ["评估点"],
        common_pitfalls: ["误区"],
        extra_field: "should be rejected",
      }),
    ).toThrow(ZodError);
  });
});
