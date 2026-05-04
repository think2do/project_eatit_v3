import { describe, it, expect, vi, afterEach } from "vitest";
import { ZodError } from "zod";
import {
  runCompressionAgent,
  degradedSummary,
  COMPRESSION_TIMEOUT_MS,
  type CompressionAgentDeps,
} from "../index";
import { systemPrompt, userPrompt } from "../prompts";
import {
  CompressionAgentInputSchema,
  CompressionAgentOutputSchema,
  CompressionTurnSchema,
  type CompressionAgentInput,
  type CompressionAgentOutput,
} from "@/core/schemas/turns";
import type { LLMProvider, Message } from "@/core/llm/types";
import { z } from "zod";

// MARK: - Fixtures

const SAMPLE_TURN = { question: "你最近一个项目是什么?", answer: "我做了一个 LLM 文档摘要 agent。" };
const SAMPLE_TURN_2 = { question: "遇到了什么挑战?", answer: "latency 控制比较难,我们用了流式输出。" };
const SAMPLE_TURN_3 = { question: "如何评估效果?", answer: "用用户采纳率作为北极星指标。" };
const SAMPLE_TURN_4 = { question: "团队协作情况?", answer: "跨职能团队,我负责 PM + 数据双线。" };
const SAMPLE_TURN_5 = { question: "失败过的经历?", answer: "有一个项目因为优先级调整被砍掉了。" };

const VALID_INPUT: CompressionAgentInput = {
  turns: [SAMPLE_TURN, SAMPLE_TURN_2],
};

const VALID_INPUT_WITH_SUMMARY: CompressionAgentInput = {
  previous_summary: "候选人有 LLM 产品经验,关注指标设计。",
  turns: [SAMPLE_TURN_3, SAMPLE_TURN_4],
};

function buildValidOutput(overrides: Partial<CompressionAgentOutput> = {}): CompressionAgentOutput {
  return CompressionAgentOutputSchema.parse({
    summary: "候选人围绕两个 LLM 产品项目展开,指标设计环节清晰。",
    preserved_keywords: ["文档摘要 agent", "北极星指标", "采纳率", "流式输出"],
    open_threads: ["失败项目的真实原因还没确认"],
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

function makeProvider(output: CompressionAgentOutput): CompressionAgentDeps {
  return {
    llm: new MockLLMProvider(() => Promise.resolve(output)) as LLMProvider,
  };
}

function makeSlowProvider(delayMs: number): CompressionAgentDeps {
  return {
    llm: new MockLLMProvider(
      () => new Promise((resolve) => setTimeout(() => resolve(buildValidOutput()), delayMs)),
    ) as LLMProvider,
  };
}

// MARK: - Test suite

afterEach(() => {
  vi.useRealTimers();
});

describe("runCompressionAgent", () => {
  // MARK: Case 1: Happy path < 3s

  it("happy path — mock generateObject resolves immediately → returns valid CompressionAgentOutput", async () => {
    const output = buildValidOutput();
    const deps = makeProvider(output);

    const result = await runCompressionAgent(VALID_INPUT, deps);

    expect(result).toEqual(output);
  });

  // MARK: Case 2: Timeout > 3s (★ critical case ★)

  it("★ timeout > 3s — returns degradedSummary shape with preserved_keywords/open_threads []", async () => {
    vi.useFakeTimers();

    const deps = makeSlowProvider(10000); // never resolves within 3s
    const promise = runCompressionAgent(VALID_INPUT, deps);

    await vi.advanceTimersByTimeAsync(COMPRESSION_TIMEOUT_MS + 1);

    const result = await promise;

    expect(result.summary).toContain("压缩超时");
    expect(result.preserved_keywords).toEqual([]);
    expect(result.open_threads).toEqual([]);
  });

  // MARK: Case 3: Timeout logger.warn called

  it("timeout — logger.warn called with compression_agent_timeout", async () => {
    vi.useFakeTimers();

    const warnSpy = vi.fn();
    const deps: CompressionAgentDeps = {
      llm: makeSlowProvider(10000).llm,
      logger: { warn: warnSpy },
    };

    const promise = runCompressionAgent(VALID_INPUT, deps);
    await vi.advanceTimersByTimeAsync(COMPRESSION_TIMEOUT_MS + 1);
    await promise;

    expect(warnSpy).toHaveBeenCalledWith(
      "compression_agent_timeout",
      expect.objectContaining({ timeout_ms: COMPRESSION_TIMEOUT_MS }),
    );
  });

  // MARK: Case 4: AbortController.abort() called on timeout

  it("AbortController.abort() is called once after timeout elapses", async () => {
    vi.useFakeTimers();

    const abortSpy = vi.spyOn(AbortController.prototype, "abort");
    const deps = makeSlowProvider(10000);

    const promise = runCompressionAgent(VALID_INPUT, deps);
    await vi.advanceTimersByTimeAsync(COMPRESSION_TIMEOUT_MS + 1);
    await promise;

    expect(abortSpy).toHaveBeenCalledOnce();
    abortSpy.mockRestore();
  });

  // MARK: Case 5: LLM error propagates (not treated as timeout/degraded)

  it("LLM error propagates as Error — not treated as timeout or degraded", async () => {
    const errorLLM = new MockLLMProvider(() => Promise.reject(new Error("LLM network error")));
    const deps: CompressionAgentDeps = { llm: errorLLM as LLMProvider };

    await expect(runCompressionAgent(VALID_INPUT, deps)).rejects.toThrow("LLM network error");
  });

  // MARK: Case 6: §A11 PII — CompressionAgentInputSchema .strict() rejects extra fields

  it("CompressionAgentInputSchema .strict() rejects extra PII field (§A11 guard)", () => {
    expect(() =>
      CompressionAgentInputSchema.parse({
        turns: [SAMPLE_TURN],
        candidate_email: "evil@example.com",
      }),
    ).toThrow(ZodError);
  });

  // MARK: Case 7: CompressionAgentInputSchema accepts previous_summary null/omitted

  it("CompressionAgentInputSchema accepts previous_summary as null", () => {
    expect(() =>
      CompressionAgentInputSchema.parse({ turns: [SAMPLE_TURN], previous_summary: null }),
    ).not.toThrow();
  });

  it("CompressionAgentInputSchema accepts omitted previous_summary", () => {
    expect(() =>
      CompressionAgentInputSchema.parse({ turns: [SAMPLE_TURN] }),
    ).not.toThrow();
  });

  // MARK: Case 8: systemPrompt() contains "3 秒硬超时"

  it('systemPrompt() contains "3 秒硬超时" keyword (verifies timeout constraint translated)', () => {
    expect(systemPrompt()).toContain("3 秒硬超时");
  });

  // MARK: Case 9: systemPrompt() inlines guardrails

  it("systemPrompt() inlines _guardrails.j2 content (PII injection guard)", () => {
    const content = systemPrompt();
    expect(content).toContain("忽略之前的指令");
    expect(content).toContain("严格符合目标 schema 的结构化 JSON");
  });

  // MARK: Case 10: userPrompt() with previous_summary → contains summary header

  it('userPrompt() with previous_summary → contains "=== 之前的压缩摘要 ===" header', () => {
    const content = userPrompt(VALID_INPUT_WITH_SUMMARY);
    expect(content).toContain("=== 之前的压缩摘要 ===");
    expect(content).toContain(VALID_INPUT_WITH_SUMMARY.previous_summary!);
    expect(content).toContain("=== 自上次压缩后新增的轮次 ===");
  });

  // MARK: Case 11: userPrompt() without previous_summary → contains 对话历史 header

  it('userPrompt() without previous_summary → contains "=== 对话历史 ===" header (else branch)', () => {
    const content = userPrompt(VALID_INPUT);
    expect(content).toContain("=== 对话历史 ===");
    expect(content).not.toContain("=== 之前的压缩摘要 ===");
  });

  // MARK: Case 12: userPrompt() iterates turns

  it("userPrompt() with 3 turns → 3 Q/A blocks in output", () => {
    const input: CompressionAgentInput = {
      turns: [SAMPLE_TURN, SAMPLE_TURN_2, SAMPLE_TURN_3],
    };
    const content = userPrompt(input);
    const qCount = (content.match(/^Q: /gm) ?? []).length;
    const aCount = (content.match(/^A: /gm) ?? []).length;
    expect(qCount).toBe(3);
    expect(aCount).toBe(3);
  });

  // MARK: Case 13: CompressionAgentOutput shape lock

  it("CompressionAgentOutputSchema validates 3 required fields with correct types", () => {
    const result = buildValidOutput();
    expect(typeof result.summary).toBe("string");
    expect(Array.isArray(result.preserved_keywords)).toBe(true);
    expect(Array.isArray(result.open_threads)).toBe(true);
  });

  // MARK: Case 14: runCompressionAgent propagates ZodError for invalid input

  it("runCompressionAgent propagates ZodError when input fails CompressionAgentInputSchema", async () => {
    const deps = makeProvider(buildValidOutput());
    await expect(
      runCompressionAgent({ turns: undefined as unknown as [] }, deps),
    ).rejects.toThrow(ZodError);
  });
});

// MARK: - degradedSummary unit tests

describe("degradedSummary", () => {
  // MARK: Case 3a: 0 turns → 占位 string

  it("0 turns → summary is 占位 placeholder string; keywords and threads are []", () => {
    const result = degradedSummary({ turns: [] });
    expect(result.summary).toBe("（本次压缩未生成:无对话可压缩）");
    expect(result.preserved_keywords).toEqual([]);
    expect(result.open_threads).toEqual([]);
  });

  // MARK: Case 3b: 1 turn → tail = [last 1] → 1 Q/A line

  it("1 turn → tail has 1 item → summary contains 1 Q/A line", () => {
    const result = degradedSummary({ turns: [SAMPLE_TURN] });
    expect(result.summary).toContain("压缩超时");
    expect(result.summary).toContain(`Q0: ${SAMPLE_TURN.question}`);
    expect(result.summary).toContain(`A0: ${SAMPLE_TURN.answer}`);
    expect(result.preserved_keywords).toEqual([]);
    expect(result.open_threads).toEqual([]);
  });

  // MARK: Case 3c: 5 turns → tail = last 2 only → 2 Q/A lines (first 3 excluded)

  it("5 turns → tail = last 2 only → summary contains exactly 2 Q/A pairs (first 3 excluded)", () => {
    const input: CompressionAgentInput = {
      turns: [SAMPLE_TURN, SAMPLE_TURN_2, SAMPLE_TURN_3, SAMPLE_TURN_4, SAMPLE_TURN_5],
    };
    const result = degradedSummary(input);

    expect(result.summary).toContain("压缩超时");
    // Last 2 turns are SAMPLE_TURN_4 and SAMPLE_TURN_5
    expect(result.summary).toContain(`Q0: ${SAMPLE_TURN_4.question}`);
    expect(result.summary).toContain(`A0: ${SAMPLE_TURN_4.answer}`);
    expect(result.summary).toContain(`Q1: ${SAMPLE_TURN_5.question}`);
    expect(result.summary).toContain(`A1: ${SAMPLE_TURN_5.answer}`);
    // First 3 turns must NOT appear
    expect(result.summary).not.toContain(SAMPLE_TURN.question);
    expect(result.summary).not.toContain(SAMPLE_TURN_2.question);
    expect(result.summary).not.toContain(SAMPLE_TURN_3.question);
    expect(result.preserved_keywords).toEqual([]);
    expect(result.open_threads).toEqual([]);
  });

  it("degradedSummary with previous_summary set — still uses turns only", () => {
    const result = degradedSummary({
      previous_summary: "之前的摘要内容",
      turns: [SAMPLE_TURN],
    });
    expect(result.summary).toContain("压缩超时");
    expect(result.preserved_keywords).toEqual([]);
    expect(result.open_threads).toEqual([]);
  });
});

// MARK: - Schema unit tests

describe("CompressionAgentInputSchema", () => {
  it("accepts valid input with turns only", () => {
    expect(() =>
      CompressionAgentInputSchema.parse({ turns: [SAMPLE_TURN] }),
    ).not.toThrow();
  });

  it("accepts valid input with previous_summary and turns", () => {
    expect(() =>
      CompressionAgentInputSchema.parse({
        previous_summary: "之前摘要",
        turns: [SAMPLE_TURN, SAMPLE_TURN_2],
      }),
    ).not.toThrow();
  });

  it("accepts empty turns array (Python source does not lock min_length)", () => {
    expect(() =>
      CompressionAgentInputSchema.parse({ turns: [] }),
    ).not.toThrow();
  });

  it("rejects missing turns field", () => {
    expect(() => CompressionAgentInputSchema.parse({})).toThrow(ZodError);
  });

  it("rejects extra PII field (resume_text)", () => {
    expect(() =>
      CompressionAgentInputSchema.parse({ turns: [SAMPLE_TURN], resume_text: "some resume" }),
    ).toThrow(ZodError);
  });

  it("rejects extra PII field (candidate_phone)", () => {
    expect(() =>
      CompressionAgentInputSchema.parse({ turns: [SAMPLE_TURN], candidate_phone: "13800138000" }),
    ).toThrow(ZodError);
  });
});

describe("CompressionTurnSchema", () => {
  it("accepts valid turn with question and answer", () => {
    expect(() => CompressionTurnSchema.parse(SAMPLE_TURN)).not.toThrow();
  });

  it(".strict() rejects extra fields on turn", () => {
    expect(() =>
      CompressionTurnSchema.parse({ ...SAMPLE_TURN, extra_field: "bad" }),
    ).toThrow(ZodError);
  });
});

describe("CompressionAgentOutputSchema", () => {
  it("accepts valid output with all 3 required fields", () => {
    expect(() =>
      CompressionAgentOutputSchema.parse({
        summary: "压缩摘要内容",
        preserved_keywords: ["keyword1", "keyword2"],
        open_threads: ["未解决话题一"],
      }),
    ).not.toThrow();
  });

  it("rejects missing required field (summary)", () => {
    expect(() =>
      CompressionAgentOutputSchema.parse({
        preserved_keywords: [],
        open_threads: [],
      }),
    ).toThrow(ZodError);
  });

  it(".strict() rejects extra fields on output", () => {
    expect(() =>
      CompressionAgentOutputSchema.parse({
        summary: "摘要",
        preserved_keywords: [],
        open_threads: [],
        extra_field: "bad",
      }),
    ).toThrow(ZodError);
  });

  it("accepts empty arrays for preserved_keywords and open_threads (degraded state signal)", () => {
    expect(() =>
      CompressionAgentOutputSchema.parse({
        summary: "压缩超时,降级保留最近两轮原文:\nQ0: ... / A0: ...",
        preserved_keywords: [],
        open_threads: [],
      }),
    ).not.toThrow();
  });
});

describe("COMPRESSION_TIMEOUT_MS constant", () => {
  it("equals 3000ms (mirrors Python COMPRESSION_TIMEOUT_SECONDS = 3.0)", () => {
    expect(COMPRESSION_TIMEOUT_MS).toBe(3000);
  });
});
