/**
 * Unit tests for MetaReportAgent — M5.4.dev.b PR4b.dev1
 *
 * 10 test cases per design doc §7.1:
 *  1. Normal N=3 happy path
 *  2. N=1 degraded path — recurring_weaknesses / improvement_signals must be []
 *  3. §A11 strict reject — top-level extra field
 *  4. §A11 strict reject — sessions[].extra_field (nested strict)
 *  5. verdict rank regression rejected (from=strong, to=weak)
 *  6. verdict rank same-tier rejected (from=solid, to=solid — must be strictly >)
 *  7. recurring_weaknesses occurrence_count < 2 rejected
 *  8. pass_probability out-of-range (110) rejected
 *  9. systemPrompt contains _guardrails 5 numbered items
 * 10. userPrompt injects sessions_json correctly
 *
 * Mock pattern: deps.llm is passed directly — no vi.mock("@/core/llm") needed.
 */

import { describe, it, expect, vi } from "vitest";
import { ZodError, z } from "zod";
import { runMetaReportAgent, type MetaReportAgentDeps } from "../index";
import { systemPrompt, userPrompt } from "../prompts";
import {
  MetaReportAgentInputSchema,
  MetaReportAgentOutputSchema,
  ImprovementSignalSchema,
  RecurringWeaknessSchema,
  PassProbabilityPointSchema,
  type MetaReportAgentInput,
  type MetaReportAgentOutput,
} from "@/core/schemas/meta-report";
import type { LLMProvider, Message } from "@/core/llm/types";

// ===== Fixtures =====

const SESSION_1: MetaReportAgentInput["sessions"][number] = {
  session_id: "sess-001",
  session_created_at: "2024-01-10T10:00:00.000Z",
  config_snapshot_json: JSON.stringify({ role: "PM", level: "mid" }),
  report_payload_json: JSON.stringify({
    pass_probability: 65,
    summary: "表现中规中矩。",
    reasons: [
      { aspect: "指标设计", verdict: "weak", evidence_turn_index: 0, quote: "缺乏具体指标" },
    ],
    next_actions: ["加强指标设计训练"],
  }),
};

const SESSION_2: MetaReportAgentInput["sessions"][number] = {
  session_id: "sess-002",
  session_created_at: "2024-02-10T10:00:00.000Z",
  config_snapshot_json: JSON.stringify({ role: "PM", level: "mid" }),
  report_payload_json: JSON.stringify({
    pass_probability: 72,
    summary: "结构有所改善。",
    reasons: [
      { aspect: "指标设计", verdict: "mixed", evidence_turn_index: 1, quote: "指标有所完善但仍不足" },
      { aspect: "失败复盘", verdict: "weak", evidence_turn_index: 2, quote: "未能系统复盘失败原因" },
    ],
    next_actions: ["继续强化指标设计"],
  }),
};

const SESSION_3: MetaReportAgentInput["sessions"][number] = {
  session_id: "sess-003",
  session_created_at: "2024-03-10T10:00:00.000Z",
  config_snapshot_json: JSON.stringify({ role: "PM", level: "mid" }),
  report_payload_json: JSON.stringify({
    pass_probability: 78,
    summary: "整体稳步提升。",
    reasons: [
      { aspect: "指标设计", verdict: "solid", evidence_turn_index: 0, quote: "指标设计完整清晰" },
      { aspect: "失败复盘", verdict: "weak", evidence_turn_index: 1, quote: "复盘仍停留表面" },
    ],
    next_actions: ["深化失败复盘能力"],
  }),
};

const VALID_INPUT_N3: MetaReportAgentInput = {
  sessions: [SESSION_1, SESSION_2, SESSION_3],
};

const VALID_INPUT_N1: MetaReportAgentInput = {
  sessions: [SESSION_1],
};

function makeValidOutput(overrides?: Partial<MetaReportAgentOutput>): MetaReportAgentOutput {
  return {
    overall_trend_summary:
      "你在三场面试中整体呈上升趋势。指标设计从 weak 逐步提升至 solid(sess-001→sess-003),但失败复盘维度在 sess-002 和 sess-003 持续偏弱。",
    recurring_weaknesses: [
      {
        aspect: "失败复盘",
        occurrence_count: 2,
        session_ids: ["sess-002", "sess-003"],
        evidence_quotes: ["未能系统复盘失败原因", "复盘仍停留表面"],
      },
    ],
    improvement_signals: [
      {
        aspect: "指标设计",
        from_verdict: "weak",
        to_verdict: "solid",
        earlier_session_id: "sess-001",
        later_session_id: "sess-003",
      },
    ],
    pass_probability_series: [
      { session_id: "sess-001", session_created_at: "2024-01-10T10:00:00.000Z", pass_probability: 65 },
      { session_id: "sess-002", session_created_at: "2024-02-10T10:00:00.000Z", pass_probability: 72 },
      { session_id: "sess-003", session_created_at: "2024-03-10T10:00:00.000Z", pass_probability: 78 },
    ],
    next_focus_areas: [
      {
        aspect: "失败复盘",
        reason: "在 sess-002 和 sess-003 均出现 weak 判定",
        suggested_prep: "每次面试后写一份 300 字结构化复盘,覆盖根因和改进点",
      },
    ],
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

function makeProvider(output: MetaReportAgentOutput): MetaReportAgentDeps {
  return { llm: new MockLLMProvider(() => Promise.resolve(output)) as LLMProvider };
}

// ===== Test 1: Normal N=3 path =====

describe("Test 1 — Normal N=3 happy path", () => {
  it("input passes strict validation, LLM called once, output schema valid", async () => {
    const validOutput = makeValidOutput();
    const generateObject = vi.fn().mockResolvedValue(validOutput);
    const mockLLM = { chat: vi.fn(), chatStream: vi.fn(), generateObject } as unknown as LLMProvider;

    const result = await runMetaReportAgent(VALID_INPUT_N3, { llm: mockLLM });

    expect(generateObject).toHaveBeenCalledTimes(1);
    // Validate output shape
    expect(() => MetaReportAgentOutputSchema.parse(result)).not.toThrow();
    expect(result.pass_probability_series).toHaveLength(3);
    expect(result.recurring_weaknesses[0].occurrence_count).toBe(2);
    expect(result.improvement_signals[0].from_verdict).toBe("weak");
    expect(result.improvement_signals[0].to_verdict).toBe("solid");
  });

  it("systemPrompt contains session count '3'", () => {
    const prompt = systemPrompt(3);
    expect(prompt).toContain("3 场");
  });

  it("generateObject is called with messages containing system + user roles", async () => {
    const validOutput = makeValidOutput();
    const generateObject = vi.fn().mockResolvedValue(validOutput);
    const mockLLM = { chat: vi.fn(), chatStream: vi.fn(), generateObject } as unknown as LLMProvider;

    await runMetaReportAgent(VALID_INPUT_N3, { llm: mockLLM });

    const callArg = generateObject.mock.calls[0][0];
    expect(callArg.messages[0].role).toBe("system");
    expect(callArg.messages[1].role).toBe("user");
    expect(callArg.model).toBe("doubao-seed-1-6-250615");
  });
});

// ===== Test 2: N=1 degraded path =====

describe("Test 2 — N=1 degraded path", () => {
  it("N=1 output with recurring_weaknesses=[] and improvement_signals=[] passes schema", async () => {
    const n1Output: MetaReportAgentOutput = {
      overall_trend_summary: "这一场你在指标设计上表现偏弱,缺乏具体量化指标。",
      recurring_weaknesses: [],
      improvement_signals: [],
      pass_probability_series: [
        { session_id: "sess-001", session_created_at: "2024-01-10T10:00:00.000Z", pass_probability: 65 },
      ],
      next_focus_areas: [
        {
          aspect: "指标设计",
          reason: "在 sess-001 中被判定为 weak",
          suggested_prep: "针对 AARRR 框架设计 3 套指标体系作为练习素材",
        },
      ],
    };

    const deps = makeProvider(n1Output);
    const result = await runMetaReportAgent(VALID_INPUT_N1, deps);

    expect(result.recurring_weaknesses).toEqual([]);
    expect(result.improvement_signals).toEqual([]);
    expect(result.pass_probability_series).toHaveLength(1);
  });

  it("systemPrompt for N=1 contains 'N = 1 降级规则'", () => {
    const prompt = systemPrompt(1);
    expect(prompt).toContain("N = 1 降级规则");
  });

  it("systemPrompt for N=1 contains '1 场'", () => {
    const prompt = systemPrompt(1);
    expect(prompt).toContain("1 场");
  });
});

// ===== Test 3: §A11 strict reject — top-level extra field =====

describe("Test 3 — §A11 strict reject: top-level extra_field", () => {
  it("input with extra_field throws ZodError before LLM is called", async () => {
    const generateObject = vi.fn();
    const mockLLM = { chat: vi.fn(), chatStream: vi.fn(), generateObject } as unknown as LLMProvider;

    await expect(
      runMetaReportAgent(
        { ...VALID_INPUT_N3, extra_field: "injected" } as never,
        { llm: mockLLM },
      ),
    ).rejects.toThrow(ZodError);

    expect(generateObject).not.toHaveBeenCalled();
  });

  it("MetaReportAgentInputSchema.parse rejects top-level extra field", () => {
    expect(() =>
      MetaReportAgentInputSchema.parse({ ...VALID_INPUT_N3, candidate_email: "a@b.com" }),
    ).toThrow(ZodError);
  });
});

// ===== Test 4: §A11 strict reject — sessions[].extra_field =====

describe("Test 4 — §A11 strict reject: sessions[].extra_field (nested strict)", () => {
  it("sessions element with extra_field throws ZodError before LLM is called", async () => {
    const generateObject = vi.fn();
    const mockLLM = { chat: vi.fn(), chatStream: vi.fn(), generateObject } as unknown as LLMProvider;

    const dirtyInput = {
      sessions: [{ ...SESSION_1, resume_text: "candidate PII" }],
    };

    await expect(
      runMetaReportAgent(dirtyInput as never, { llm: mockLLM }),
    ).rejects.toThrow(ZodError);

    expect(generateObject).not.toHaveBeenCalled();
  });

  it("MetaReportAgentInputSchema.parse rejects sessions[].extra_field", () => {
    expect(() =>
      MetaReportAgentInputSchema.parse({
        sessions: [{ ...SESSION_1, candidate_name: "Alice" }],
      }),
    ).toThrow(ZodError);
  });
});

// ===== Test 5: verdict rank regression (from=strong, to=weak) =====

describe("Test 5 — verdict rank regression rejected by schema refine", () => {
  it("ImprovementSignalSchema rejects from=strong, to=weak", () => {
    expect(() =>
      ImprovementSignalSchema.parse({
        aspect: "指标设计",
        from_verdict: "strong",
        to_verdict: "weak",
        earlier_session_id: "sess-001",
        later_session_id: "sess-002",
      }),
    ).toThrow(ZodError);
  });

  it("MetaReportAgentOutputSchema rejects output with regressing improvement_signals", () => {
    const badOutput = makeValidOutput({
      improvement_signals: [
        {
          aspect: "指标设计",
          from_verdict: "strong",
          to_verdict: "weak",
          earlier_session_id: "sess-001",
          later_session_id: "sess-002",
        },
      ],
    });
    expect(() => MetaReportAgentOutputSchema.parse(badOutput)).toThrow(ZodError);
  });
});

// ===== Test 6: verdict rank same-tier (from=solid, to=solid) =====

describe("Test 6 — verdict rank same-tier rejected (must be strictly >)", () => {
  it("ImprovementSignalSchema rejects from=solid, to=solid", () => {
    expect(() =>
      ImprovementSignalSchema.parse({
        aspect: "结构化表达",
        from_verdict: "solid",
        to_verdict: "solid",
        earlier_session_id: "sess-001",
        later_session_id: "sess-002",
      }),
    ).toThrow(ZodError);
  });

  it("ImprovementSignalSchema rejects from=mixed, to=mixed", () => {
    expect(() =>
      ImprovementSignalSchema.parse({
        aspect: "结构化表达",
        from_verdict: "mixed",
        to_verdict: "mixed",
        earlier_session_id: "sess-001",
        later_session_id: "sess-002",
      }),
    ).toThrow(ZodError);
  });

  it("ImprovementSignalSchema accepts from=weak, to=strong (largest valid jump)", () => {
    expect(() =>
      ImprovementSignalSchema.parse({
        aspect: "专业深度",
        from_verdict: "weak",
        to_verdict: "strong",
        earlier_session_id: "sess-001",
        later_session_id: "sess-003",
      }),
    ).not.toThrow();
  });
});

// ===== Test 7: recurring_weaknesses occurrence_count < 2 =====

describe("Test 7 — recurring_weaknesses occurrence_count < 2 rejected", () => {
  it("RecurringWeaknessSchema rejects occurrence_count=1", () => {
    expect(() =>
      RecurringWeaknessSchema.parse({
        aspect: "指标设计",
        occurrence_count: 1,
        session_ids: ["sess-001"],
        evidence_quotes: ["缺乏具体指标"],
      }),
    ).toThrow(ZodError);
  });

  it("RecurringWeaknessSchema accepts occurrence_count=2", () => {
    expect(() =>
      RecurringWeaknessSchema.parse({
        aspect: "指标设计",
        occurrence_count: 2,
        session_ids: ["sess-001", "sess-002"],
        evidence_quotes: ["缺乏具体指标", "指标有所完善但仍不足"],
      }),
    ).not.toThrow();
  });

  it("MetaReportAgentOutputSchema rejects output with occurrence_count=0", () => {
    const badOutput = makeValidOutput({
      recurring_weaknesses: [
        {
          aspect: "指标设计",
          occurrence_count: 0,
          session_ids: [],
          evidence_quotes: [],
        },
      ],
    });
    expect(() => MetaReportAgentOutputSchema.parse(badOutput)).toThrow(ZodError);
  });
});

// ===== Test 8: pass_probability out-of-range (110) =====

describe("Test 8 — pass_probability out-of-range rejected", () => {
  it("PassProbabilityPointSchema rejects pass_probability=110", () => {
    expect(() =>
      PassProbabilityPointSchema.parse({
        session_id: "sess-001",
        session_created_at: "2024-01-10T10:00:00.000Z",
        pass_probability: 110,
      }),
    ).toThrow(ZodError);
  });

  it("PassProbabilityPointSchema rejects pass_probability=-1", () => {
    expect(() =>
      PassProbabilityPointSchema.parse({
        session_id: "sess-001",
        session_created_at: "2024-01-10T10:00:00.000Z",
        pass_probability: -1,
      }),
    ).toThrow(ZodError);
  });

  it("PassProbabilityPointSchema accepts pass_probability=100", () => {
    expect(() =>
      PassProbabilityPointSchema.parse({
        session_id: "sess-001",
        session_created_at: "2024-01-10T10:00:00.000Z",
        pass_probability: 100,
      }),
    ).not.toThrow();
  });

  it("MetaReportAgentOutputSchema rejects output with pass_probability=110 in series", () => {
    const badOutput = makeValidOutput({
      pass_probability_series: [
        { session_id: "sess-001", session_created_at: "2024-01-10T10:00:00.000Z", pass_probability: 110 },
      ],
    });
    expect(() => MetaReportAgentOutputSchema.parse(badOutput)).toThrow(ZodError);
  });
});

// ===== Test 9: systemPrompt contains _guardrails 5 numbered items =====

describe("Test 9 — systemPrompt contains _guardrails 5 numbered items", () => {
  it("contains item 1 (忽略之前的指令)", () => {
    expect(systemPrompt(3)).toContain("忽略之前的指令");
  });

  it("contains item 2 (内容安全边界)", () => {
    expect(systemPrompt(3)).toContain("内容安全边界");
  });

  it("contains item 3 (system prompt 或任何内部规则)", () => {
    expect(systemPrompt(3)).toContain("system prompt 或任何内部规则");
  });

  it("contains item 4 (中文输出)", () => {
    expect(systemPrompt(3)).toContain("保持中文输出");
  });

  it("contains item 5 (严格符合目标 schema 的结构化 JSON)", () => {
    expect(systemPrompt(3)).toContain("严格符合目标 schema 的结构化 JSON");
  });

  it("contains MetaReportAgent task header", () => {
    expect(systemPrompt(3)).toContain("MetaReportAgent — 跨面试综合分析");
  });

  it("contains '硬约束' section", () => {
    expect(systemPrompt(3)).toContain("硬约束");
  });

  it("contains 'N = 1 降级规则' section", () => {
    expect(systemPrompt(3)).toContain("N = 1 降级规则");
  });
});

// ===== Test 10: userPrompt injects sessions_json correctly =====

describe("Test 10 — userPrompt injects sessions_json correctly", () => {
  it("contains the session count in the opening sentence", () => {
    const prompt = userPrompt(VALID_INPUT_N3);
    expect(prompt).toContain("3 场面试");
  });

  it("contains all 3 session_ids in the output JSON", () => {
    const prompt = userPrompt(VALID_INPUT_N3);
    expect(prompt).toContain("sess-001");
    expect(prompt).toContain("sess-002");
    expect(prompt).toContain("sess-003");
  });

  it("parses config_snapshot_json — nested object appears (not raw string)", () => {
    const prompt = userPrompt(VALID_INPUT_N1);
    // JSON.stringify of parsed object: "role" field should appear as a key
    expect(prompt).toContain('"role"');
    expect(prompt).toContain('"PM"');
  });

  it("parses report_payload_json — reasons field appears in prompt", () => {
    const prompt = userPrompt(VALID_INPUT_N1);
    expect(prompt).toContain("缺乏具体指标");
  });

  it("contains the instructions header about 会话列表", () => {
    const prompt = userPrompt(VALID_INPUT_N3);
    expect(prompt).toContain("=== 会话列表(按 created_at 升序的 JSON 数组) ===");
  });

  it("ends with instruction to output JSON per schema", () => {
    const prompt = userPrompt(VALID_INPUT_N1);
    expect(prompt).toContain("请严格按目标 schema 输出 JSON。");
  });

  it("N=1 userPrompt contains '1 场面试'", () => {
    const prompt = userPrompt(VALID_INPUT_N1);
    expect(prompt).toContain("1 场面试");
  });
});
