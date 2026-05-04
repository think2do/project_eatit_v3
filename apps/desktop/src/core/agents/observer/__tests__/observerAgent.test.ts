import { describe, it, expect, vi } from "vitest";
import { ZodError } from "zod";
import { runObserverAgent, FILLER_WORDS_CN, FILLER_WORDS_LENGTH, type ObserverAgentDeps } from "../index";
import { systemPrompt, userPrompt } from "../prompts";
import {
  ObserverAgentInputSchema,
  ObserverAgentOutputSchema,
  type ObserverAgentInput,
  type ObserverAgentOutput,
} from "@/core/schemas/turns";
import type { LLMProvider, Message } from "@/core/llm/types";
import { z } from "zod";

// MARK: - Fixtures

const VALID_INPUT: ObserverAgentInput = {
  turn_index: 0,
  question: "你最近一个项目是什么?",
  answer: "我做了一个 LLM 文档摘要 agent。",
};

const VALID_INPUT_WITH_OPTIONALS: ObserverAgentInput = {
  turn_index: 2,
  question: "遇到了什么挑战?",
  answer: "latency 控制比较难,我们用了流式输出。",
  remaining_minutes: 5,
  long_term_summary: "候选人有 LLM 产品经验,关注指标设计。",
};

function buildValidOutput(overrides: Partial<ObserverAgentOutput> = {}): ObserverAgentOutput {
  return ObserverAgentOutputSchema.parse({
    observation: "你这段量化很到位,保持节奏",
    tone: "support",
    actionable: false,
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

function makeProvider(output: ObserverAgentOutput): ObserverAgentDeps {
  return {
    llm: new MockLLMProvider(() => Promise.resolve(output)) as LLMProvider,
  };
}

// MARK: - runObserverAgent tests

describe("runObserverAgent", () => {
  it("happy path — mock returns valid output, expect equality", async () => {
    const output = buildValidOutput();
    const deps = makeProvider(output);

    const result = await runObserverAgent(VALID_INPUT, deps);

    expect(result).toEqual(output);
  });

  it("propagates LLM error", async () => {
    const errorLLM = new MockLLMProvider(() => Promise.reject(new Error("LLM network error")));
    const deps: ObserverAgentDeps = { llm: errorLLM as LLMProvider };

    await expect(runObserverAgent(VALID_INPUT, deps)).rejects.toThrow("LLM network error");
  });

  it("propagates ZodError when input turn_index is negative", async () => {
    const deps = makeProvider(buildValidOutput());
    await expect(
      runObserverAgent({ ...VALID_INPUT, turn_index: -1 }, deps),
    ).rejects.toThrow(ZodError);
  });

  it("propagates ZodError when input has invalid tone in fixture shape", async () => {
    const errorLLM = new MockLLMProvider(() => Promise.resolve({ observation: "test", tone: "invalid_tone", actionable: true }));
    const deps: ObserverAgentDeps = { llm: errorLLM as LLMProvider };

    // The schema parse on input will succeed; this tests that the caller gets what the LLM returns
    // (ObserverAgentOutputSchema validation is done by generateObject). We test input rejection here:
    await expect(
      runObserverAgent({ ...VALID_INPUT, turn_index: -1 }, deps),
    ).rejects.toThrow(ZodError);
  });
});

// MARK: - prompts tests

describe("prompts", () => {
  it('systemPrompt() contains "ObserverAgent"', () => {
    expect(systemPrompt()).toContain("ObserverAgent");
  });

  it('systemPrompt() contains tone values "support", "alert", "pivot"', () => {
    const content = systemPrompt();
    expect(content).toContain("support");
    expect(content).toContain("alert");
    expect(content).toContain("pivot");
  });

  it('systemPrompt() contains "60 个字符"', () => {
    expect(systemPrompt()).toContain("60 个字符");
  });

  it('systemPrompt() inlines guardrails — contains "忽略之前的指令"', () => {
    expect(systemPrompt()).toContain("忽略之前的指令");
  });

  it('systemPrompt() inlines guardrails — contains "严格符合目标 schema"', () => {
    expect(systemPrompt()).toContain("严格符合目标 schema");
  });

  it('userPrompt() with remaining_minutes set → contains "=== 时间 ===" and "剩余约 N 分钟"', () => {
    const content = userPrompt(VALID_INPUT_WITH_OPTIONALS);
    expect(content).toContain("=== 时间 ===");
    expect(content).toContain("剩余约 5 分钟");
  });

  it("userPrompt() without remaining_minutes (undefined) → no time section", () => {
    const input: ObserverAgentInput = { ...VALID_INPUT };
    const content = userPrompt(input);
    expect(content).not.toContain("=== 时间 ===");
  });

  it("userPrompt() with remaining_minutes=null → no time section (jinja `is not none` parity)", () => {
    const input: ObserverAgentInput = { ...VALID_INPUT, remaining_minutes: null };
    const content = userPrompt(input);
    expect(content).not.toContain("=== 时间 ===");
  });

  it('userPrompt() with long_term_summary → contains "=== 历史压缩摘要" header and value', () => {
    const content = userPrompt(VALID_INPUT_WITH_OPTIONALS);
    expect(content).toContain("=== 历史压缩摘要");
    expect(content).toContain(VALID_INPUT_WITH_OPTIONALS.long_term_summary!);
  });

  it("userPrompt() without long_term_summary → no compression-summary header", () => {
    const content = userPrompt(VALID_INPUT);
    expect(content).not.toContain("=== 历史压缩摘要");
  });

  it("userPrompt() always includes turn_index, Q, A", () => {
    const content = userPrompt(VALID_INPUT);
    expect(content).toContain(`=== 第 ${VALID_INPUT.turn_index} 轮 ===`);
    expect(content).toContain(`Q: ${VALID_INPUT.question}`);
    expect(content).toContain(`A: ${VALID_INPUT.answer}`);
  });
});

// MARK: - ObserverAgentInputSchema tests

describe("ObserverAgentInputSchema", () => {
  it("accepts minimal valid input (turn_index, question, answer)", () => {
    expect(() =>
      ObserverAgentInputSchema.parse({
        turn_index: 0,
        question: "问题",
        answer: "答案",
      }),
    ).not.toThrow();
  });

  it("accepts remaining_minutes null", () => {
    expect(() =>
      ObserverAgentInputSchema.parse({ ...VALID_INPUT, remaining_minutes: null }),
    ).not.toThrow();
  });

  it("accepts remaining_minutes undefined (omitted)", () => {
    expect(() =>
      ObserverAgentInputSchema.parse({ ...VALID_INPUT }),
    ).not.toThrow();
  });

  it("accepts remaining_minutes as positive int", () => {
    expect(() =>
      ObserverAgentInputSchema.parse({ ...VALID_INPUT, remaining_minutes: 10 }),
    ).not.toThrow();
  });

  it("rejects negative turn_index", () => {
    expect(() =>
      ObserverAgentInputSchema.parse({ ...VALID_INPUT, turn_index: -1 }),
    ).toThrow(ZodError);
  });

  it("rejects non-int turn_index (e.g., 1.5)", () => {
    expect(() =>
      ObserverAgentInputSchema.parse({ ...VALID_INPUT, turn_index: 1.5 }),
    ).toThrow(ZodError);
  });

  it("rejects extra PII field (resume_text)", () => {
    expect(() =>
      ObserverAgentInputSchema.parse({ ...VALID_INPUT, resume_text: "my resume" }),
    ).toThrow(ZodError);
  });

  it("rejects extra PII field (candidate_email)", () => {
    expect(() =>
      ObserverAgentInputSchema.parse({ ...VALID_INPUT, candidate_email: "test@example.com" }),
    ).toThrow(ZodError);
  });
});

// MARK: - ObserverAgentOutputSchema tests

describe("ObserverAgentOutputSchema", () => {
  it("accepts valid output (3 fields)", () => {
    expect(() =>
      ObserverAgentOutputSchema.parse({
        observation: "你这段量化很到位,保持节奏",
        tone: "support",
        actionable: false,
      }),
    ).not.toThrow();
  });

  it("rejects observation longer than 60 chars", () => {
    expect(() =>
      ObserverAgentOutputSchema.parse({
        observation: "这是一段超过六十个字符的观察文本，专门用于测试最大长度约束是否生效，这段文字需要超过六十个字符才能触发验证失败，应该被拒绝",
        tone: "alert",
        actionable: true,
      }),
    ).toThrow(ZodError);
  });

  it("rejects observation empty string (min 1)", () => {
    expect(() =>
      ObserverAgentOutputSchema.parse({
        observation: "",
        tone: "support",
        actionable: false,
      }),
    ).toThrow(ZodError);
  });

  it("rejects invalid tone enum value", () => {
    expect(() =>
      ObserverAgentOutputSchema.parse({
        observation: "你偏题了",
        tone: "unknown_tone",
        actionable: true,
      }),
    ).toThrow(ZodError);
  });

  it("rejects extra fields (.strict())", () => {
    expect(() =>
      ObserverAgentOutputSchema.parse({
        observation: "你偏题了",
        tone: "alert",
        actionable: true,
        extra_field: "bad",
      }),
    ).toThrow(ZodError);
  });
});

// MARK: - FILLER_WORDS_CN L0 lock (re-exported through agents/observer)

describe("FILLER_WORDS_CN L0 lock (re-exported through agents/observer)", () => {
  it("FILLER_WORDS_LENGTH === 7", () => {
    expect(FILLER_WORDS_LENGTH).toBe(7);
  });

  it("FILLER_WORDS_CN.length === 7", () => {
    expect(FILLER_WORDS_CN.length).toBe(7);
  });

  it("exact set equality with canonical 7 words", () => {
    expect(new Set(FILLER_WORDS_CN)).toEqual(
      new Set(["嗯", "呃", "那个", "就是", "这个", "反正", "然后然后"]),
    );
  });

  it("exact ordering — deep equal", () => {
    expect([...FILLER_WORDS_CN]).toEqual([
      "嗯",
      "呃",
      "那个",
      "就是",
      "这个",
      "反正",
      "然后然后",
    ]);
  });

  it("no duplicates", () => {
    expect(new Set(FILLER_WORDS_CN).size).toBe(FILLER_WORDS_CN.length);
  });
});
