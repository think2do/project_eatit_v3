import { describe, it, expect, vi, afterEach } from "vitest";
import { ZodError } from "zod";
import {
  runInterviewerAgent,
  parseInterviewStyle,
  type InterviewerAgentDeps,
} from "../index";
import { systemPrompt, userPrompt, extractPredictedQuestions } from "../prompts";
import { PERSONA_MAP } from "../personas";
import {
  InterviewerAgentInputSchema,
  InterviewerAgentOutputSchema,
  type InterviewerAgentInput,
  type InterviewerAgentOutput,
} from "@/core/schemas/turns";
import type { LLMProvider, Message } from "@/core/llm/types";
import { z } from "zod";

// MARK: - Fixtures

const FRAMEWORK_STRUCTURED = JSON.stringify({ style: "structured", focus_competencies: ["execution"] });
const FRAMEWORK_PRESSURE = JSON.stringify({ style: "pressure" });
const FRAMEWORK_FRIENDLY = JSON.stringify({ pace_plan: { style: "friendly" } });
const FRAMEWORK_EXPERT = JSON.stringify({ interview_style: "expert" });
const FRAMEWORK_INVALID_JSON = "not-json";
const FRAMEWORK_UNKNOWN_STYLE = JSON.stringify({ style: "unknown" });
const FRAMEWORK_WITH_QUESTIONS = JSON.stringify({
  style: "structured",
  predicted_questions: {
    questions: [
      { category: "execution", question: "你如何推动项目落地?", why_likely: "PM 核心能力" },
      { category: "data", question: "你用什么指标衡量成功?", why_likely: "数据驱动" },
    ],
  },
});

const SAMPLE_TURN = { question: "你最近一个项目是什么?", answer: "我做了一个 LLM 文档摘要 agent。" };
const SAMPLE_TURN_WITH_ASSESSMENT = {
  question: "项目中遇到的挑战?",
  answer: "latency 控制比较难。",
  assessment: { summary: "答得简洁但缺乏数据支撑" },
};

const VALID_INPUT: InterviewerAgentInput = {
  framework_json: FRAMEWORK_STRUCTURED,
  recent_turns: [SAMPLE_TURN],
};

const VALID_INPUT_FULL: InterviewerAgentInput = {
  framework_json: FRAMEWORK_STRUCTURED,
  recent_turns: [SAMPLE_TURN, SAMPLE_TURN_WITH_ASSESSMENT],
  long_term_summary: "候选人有 LLM 产品经验,关注指标设计。",
  remaining_minutes: 10,
};

function buildValidOutput(overrides: Partial<InterviewerAgentOutput> = {}): InterviewerAgentOutput {
  return InterviewerAgentOutputSchema.parse({
    question: "这个指标上线后有没有跟你预期不一致的地方?",
    intent: "验证候选人是否真的跟过线上数据",
    expected_depth: "tactical",
    should_end: false,
    followup_hints: [],
    live_observation: null,
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

function makeProvider(output: InterviewerAgentOutput): InterviewerAgentDeps {
  return {
    llm: new MockLLMProvider(() => Promise.resolve(output)) as LLMProvider,
  };
}

// MARK: - afterEach guard (prevent fake timer leakage from other test files)

afterEach(() => {
  vi.useRealTimers();
});

// MARK: - runInterviewerAgent tests

describe("runInterviewerAgent", () => {
  it("happy path — mock generateObject resolves immediately → returns valid InterviewerAgentOutput", async () => {
    const output = buildValidOutput();
    const deps = makeProvider(output);

    const result = await runInterviewerAgent(VALID_INPUT, deps);

    expect(result).toEqual(output);
  });

  it("happy path with followup_hints 2 items — accepted by schema", async () => {
    const output = buildValidOutput({ followup_hints: ["追问数据", "量化依据"] });
    const deps = makeProvider(output);

    const result = await runInterviewerAgent(VALID_INPUT, deps);

    expect(result.followup_hints).toHaveLength(2);
  });

  it("degraded state — empty followup_hints [] is valid", async () => {
    const output = buildValidOutput({ followup_hints: [] });
    const deps = makeProvider(output);

    const result = await runInterviewerAgent(VALID_INPUT, deps);

    expect(result.followup_hints).toEqual([]);
  });

  it("full input with optionals — passes through correctly", async () => {
    const output = buildValidOutput({
      live_observation: "结构清晰,但优先级判断一带而过",
    });
    const deps = makeProvider(output);

    const result = await runInterviewerAgent(VALID_INPUT_FULL, deps);

    expect(result.live_observation).toBe("结构清晰,但优先级判断一带而过");
  });

  it("LLM error propagates — not swallowed", async () => {
    const errorLLM = new MockLLMProvider(() => Promise.reject(new Error("LLM network error")));
    const deps: InterviewerAgentDeps = { llm: errorLLM as LLMProvider };

    await expect(runInterviewerAgent(VALID_INPUT, deps)).rejects.toThrow("LLM network error");
  });

  it("ZodError on invalid input — missing required fields", async () => {
    const deps = makeProvider(buildValidOutput());
    await expect(
      runInterviewerAgent({ framework_json: undefined as unknown as string, recent_turns: [] }, deps),
    ).rejects.toThrow(ZodError);
  });

  it("§A11 — rejects extra PII field on input (strict)", async () => {
    const deps = makeProvider(buildValidOutput());
    await expect(
      runInterviewerAgent(
        { ...VALID_INPUT, candidate_email: "evil@example.com" } as unknown as InterviewerAgentInput,
        deps,
      ),
    ).rejects.toThrow(ZodError);
  });

  it("passes configured default model to generateObject", async () => {
    const capturedModel: { value?: string } = {};
    const llm: LLMProvider = {
      chat: vi.fn(),
      chatStream: vi.fn(),
      generateObject: vi.fn(({ model }: { schema: unknown; messages: unknown; model?: string }) => {
        capturedModel.value = model;
        return Promise.resolve(buildValidOutput());
      }),
    };
    await runInterviewerAgent(VALID_INPUT, { llm });
    // FALLBACK_MODEL from configuredModel.ts (no app_settings row in test → fallback path).
    expect(capturedModel.value).toBe("doubao-seed-2-0-lite-260215");
  });
});

// MARK: - parseInterviewStyle tests

describe("parseInterviewStyle", () => {
  it("reads style from framework.style", () => {
    expect(parseInterviewStyle(FRAMEWORK_STRUCTURED)).toBe("structured");
  });

  it("reads pressure from framework.style", () => {
    expect(parseInterviewStyle(FRAMEWORK_PRESSURE)).toBe("pressure");
  });

  it("reads friendly from framework.pace_plan.style", () => {
    expect(parseInterviewStyle(FRAMEWORK_FRIENDLY)).toBe("friendly");
  });

  it("reads expert from framework.interview_style", () => {
    expect(parseInterviewStyle(FRAMEWORK_EXPERT)).toBe("expert");
  });

  it("falls back to structured on invalid JSON", () => {
    expect(parseInterviewStyle(FRAMEWORK_INVALID_JSON)).toBe("structured");
  });

  it("falls back to structured on unknown style value", () => {
    expect(parseInterviewStyle(FRAMEWORK_UNKNOWN_STYLE)).toBe("structured");
  });

  it("falls back to structured on empty string", () => {
    expect(parseInterviewStyle("")).toBe("structured");
  });

  it("falls back to structured on non-object JSON (array)", () => {
    expect(parseInterviewStyle("[]")).toBe("structured");
  });

  it("falls back to structured on null JSON", () => {
    expect(parseInterviewStyle("null")).toBe("structured");
  });
});

// MARK: - extractPredictedQuestions tests

describe("extractPredictedQuestions", () => {
  it("returns questions array from valid framework_json", () => {
    const result = extractPredictedQuestions(FRAMEWORK_WITH_QUESTIONS);
    expect(result).toHaveLength(2);
    expect(result[0].category).toBe("execution");
    expect(result[1].why_likely).toBe("数据驱动");
  });

  it("returns [] on JSON parse error", () => {
    expect(extractPredictedQuestions("not-json")).toEqual([]);
  });

  it("returns [] when predicted_questions key is missing", () => {
    expect(extractPredictedQuestions(JSON.stringify({ style: "structured" }))).toEqual([]);
  });

  it("returns [] when predicted_questions.questions is missing", () => {
    expect(
      extractPredictedQuestions(JSON.stringify({ predicted_questions: {} })),
    ).toEqual([]);
  });

  it("returns [] when predicted_questions.questions is not an array", () => {
    expect(
      extractPredictedQuestions(JSON.stringify({ predicted_questions: { questions: "bad" } })),
    ).toEqual([]);
  });

  it("filters out non-object items in questions array", () => {
    const fw = JSON.stringify({
      predicted_questions: {
        questions: [
          { category: "exec", question: "Q1", why_likely: "W1" },
          "string_item",
          null,
          42,
          { category: "data", question: "Q2", why_likely: "W2" },
        ],
      },
    });
    const result = extractPredictedQuestions(fw);
    expect(result).toHaveLength(2);
  });

  it("returns [] on empty framework_json string", () => {
    expect(extractPredictedQuestions("")).toEqual([]);
  });

  it("returns [] when top-level JSON is an array (not object)", () => {
    expect(extractPredictedQuestions("[]")).toEqual([]);
  });
});

// MARK: - systemPrompt tests

describe("systemPrompt", () => {
  it("inlines guardrails — contains 忽略之前的指令", () => {
    expect(systemPrompt(PERSONA_MAP.structured)).toContain("忽略之前的指令");
  });

  it("inlines guardrails — contains 严格符合目标 schema", () => {
    expect(systemPrompt(PERSONA_MAP.structured)).toContain("严格符合目标 schema");
  });

  it("contains InterviewerAgent task header", () => {
    expect(systemPrompt(PERSONA_MAP.structured)).toContain("InterviewerAgent");
  });

  it("injects persona name and keywords into preamble", () => {
    const content = systemPrompt(PERSONA_MAP.pressure);
    expect(content).toContain("Marcus");
    expect(content).toContain("直接犀利");
    expect(content).toContain("连续追问");
    expect(content).toContain("质疑判断");
  });

  it("contains live_observation field doc", () => {
    expect(systemPrompt(PERSONA_MAP.structured)).toContain("live_observation");
  });

  it("contains 30 字 constraint doc", () => {
    expect(systemPrompt(PERSONA_MAP.structured)).toContain("30 字");
  });
});

// MARK: - userPrompt tests

describe("userPrompt", () => {
  it("contains framework_json header and content", () => {
    const content = userPrompt(VALID_INPUT, extractPredictedQuestions(VALID_INPUT.framework_json));
    expect(content).toContain("=== 面试方向框架(JSON) ===");
    expect(content).toContain(VALID_INPUT.framework_json);
  });

  it("contains recent_turns header", () => {
    const content = userPrompt(VALID_INPUT, []);
    expect(content).toContain("=== 已经进行的轮次");
  });

  it("contains Q and A for each turn", () => {
    const content = userPrompt(VALID_INPUT, []);
    expect(content).toContain(`Q: ${SAMPLE_TURN.question}`);
    expect(content).toContain(`A: ${SAMPLE_TURN.answer}`);
  });

  it("includes assessment summary when present", () => {
    const input: InterviewerAgentInput = {
      framework_json: FRAMEWORK_STRUCTURED,
      recent_turns: [SAMPLE_TURN_WITH_ASSESSMENT],
    };
    const content = userPrompt(input, []);
    expect(content).toContain("评估:答得简洁但缺乏数据支撑");
  });

  it("includes long_term_summary section when present", () => {
    const content = userPrompt(VALID_INPUT_FULL, []);
    expect(content).toContain("=== 长期压缩摘要 ===");
    expect(content).toContain("候选人有 LLM 产品经验");
  });

  it("omits long_term_summary section when null", () => {
    const input: InterviewerAgentInput = {
      ...VALID_INPUT,
      long_term_summary: null,
    };
    const content = userPrompt(input, []);
    expect(content).not.toContain("=== 长期压缩摘要 ===");
  });

  it("includes remaining_minutes section when set", () => {
    const content = userPrompt(VALID_INPUT_FULL, []);
    expect(content).toContain("=== 剩余时间 ===");
    expect(content).toContain("约 10 分钟");
  });

  it("omits remaining_minutes section when null", () => {
    const input: InterviewerAgentInput = { ...VALID_INPUT, remaining_minutes: null };
    const content = userPrompt(input, []);
    expect(content).not.toContain("=== 剩余时间 ===");
  });

  it("omits remaining_minutes section when undefined", () => {
    const content = userPrompt(VALID_INPUT, []);
    expect(content).not.toContain("=== 剩余时间 ===");
  });

  it("includes predicted questions section when non-empty", () => {
    const pqs = extractPredictedQuestions(FRAMEWORK_WITH_QUESTIONS);
    const input: InterviewerAgentInput = {
      framework_json: FRAMEWORK_WITH_QUESTIONS,
      recent_turns: [],
    };
    const content = userPrompt(input, pqs);
    expect(content).toContain("=== 预测题库");
    expect(content).toContain("你如何推动项目落地?");
    expect(content).toContain("PM 核心能力");
  });

  it("omits predicted questions section when empty", () => {
    const content = userPrompt(VALID_INPUT, []);
    expect(content).not.toContain("=== 预测题库");
  });
});

// MARK: - InterviewerAgentInputSchema tests

describe("InterviewerAgentInputSchema", () => {
  it("accepts minimal valid input", () => {
    expect(() =>
      InterviewerAgentInputSchema.parse({ framework_json: "{}", recent_turns: [] }),
    ).not.toThrow();
  });

  it("accepts null long_term_summary", () => {
    expect(() =>
      InterviewerAgentInputSchema.parse({ framework_json: "{}", recent_turns: [], long_term_summary: null }),
    ).not.toThrow();
  });

  it("accepts null remaining_minutes", () => {
    expect(() =>
      InterviewerAgentInputSchema.parse({ framework_json: "{}", recent_turns: [], remaining_minutes: null }),
    ).not.toThrow();
  });

  it("rejects extra PII field (§A11)", () => {
    expect(() =>
      InterviewerAgentInputSchema.parse({
        framework_json: "{}",
        recent_turns: [],
        candidate_email: "pii@example.com",
      }),
    ).toThrow(ZodError);
  });

  it("rejects missing framework_json", () => {
    expect(() =>
      InterviewerAgentInputSchema.parse({ recent_turns: [] }),
    ).toThrow(ZodError);
  });
});

// MARK: - InterviewerAgentOutputSchema tests

describe("InterviewerAgentOutputSchema", () => {
  it("accepts valid minimal output", () => {
    expect(() =>
      InterviewerAgentOutputSchema.parse({
        question: "你当时为什么没有先做 A 方案?",
        intent: "验证决策逻辑",
        expected_depth: "tactical",
      }),
    ).not.toThrow();
  });

  it("accepts followup_hints with 2 items each ≤ 8 chars", () => {
    expect(() =>
      InterviewerAgentOutputSchema.parse({
        question: "Q",
        intent: "I",
        expected_depth: "surface",
        followup_hints: ["追问数据", "具体案例"],
      }),
    ).not.toThrow();
  });

  it("accepts followup_hints with 3 items each ≤ 8 chars", () => {
    expect(() =>
      InterviewerAgentOutputSchema.parse({
        question: "Q",
        intent: "I",
        expected_depth: "surface",
        followup_hints: ["追问数据", "具体案例", "量化依据"],
      }),
    ).not.toThrow();
  });

  it("accepts empty followup_hints []", () => {
    expect(() =>
      InterviewerAgentOutputSchema.parse({
        question: "Q",
        intent: "I",
        expected_depth: "surface",
        followup_hints: [],
      }),
    ).not.toThrow();
  });

  it("rejects followup_hints with 1 item (must be 0 or 2-3)", () => {
    expect(() =>
      InterviewerAgentOutputSchema.parse({
        question: "Q",
        intent: "I",
        expected_depth: "surface",
        followup_hints: ["追问数据"],
      }),
    ).toThrow();
  });

  it("rejects followup_hints item > 8 chars", () => {
    expect(() =>
      InterviewerAgentOutputSchema.parse({
        question: "Q",
        intent: "I",
        expected_depth: "surface",
        followup_hints: ["这个超过八个字符了吧", "具体案例"],
      }),
    ).toThrow();
  });

  it("rejects live_observation > 30 chars", () => {
    expect(() =>
      InterviewerAgentOutputSchema.parse({
        question: "Q",
        intent: "I",
        expected_depth: "surface",
        live_observation: "这是一段超过三十个字符的观察文本，专门用来测试长度约束是否生效",
      }),
    ).toThrow(ZodError);
  });

  it("accepts live_observation null (turn 0 case)", () => {
    expect(() =>
      InterviewerAgentOutputSchema.parse({
        question: "Q",
        intent: "I",
        expected_depth: "surface",
        live_observation: null,
      }),
    ).not.toThrow();
  });

  it("rejects invalid expected_depth enum value", () => {
    expect(() =>
      InterviewerAgentOutputSchema.parse({
        question: "Q",
        intent: "I",
        expected_depth: "deep",
      }),
    ).toThrow(ZodError);
  });

  it("rejects extra fields (§A11 strict)", () => {
    expect(() =>
      InterviewerAgentOutputSchema.parse({
        question: "Q",
        intent: "I",
        expected_depth: "surface",
        extra_field: "bad",
      }),
    ).toThrow(ZodError);
  });

  it("should_end defaults to false", () => {
    const result = InterviewerAgentOutputSchema.parse({
      question: "Q",
      intent: "I",
      expected_depth: "surface",
    });
    expect(result.should_end).toBe(false);
  });
});
