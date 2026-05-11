/**
 * Coach Agent — Teaching Guardrail Tests
 *
 * Spec: M3.3.3.dev.b acceptance gate
 * Original spec location: apps/desktop/src/__tests__/coachAgent.teaching.test.ts
 * Override: placed under core/agents/coach/__tests__/ matching M3.2.x / M3.3.x convention.
 *
 * Run: cd apps/desktop && pnpm vitest run src/core/agents/coach
 */

import { describe, it, expect, vi } from "vitest";
import { ZodError, z } from "zod";
import {
  runCoachAgent,
  draftReadableAnswer,
  ReadableAnswerOutputSchema,
  type CoachAgentDeps,
  type DraftReadableAnswerDeps,
} from "../index";
import { systemPrompt, userPrompt, readableAnswerSystemPrompt, readableAnswerUserPrompt } from "../prompts";
import {
  CoachAgentInputSchema,
  CoachAgentOutputSchema,
  _LLMCoachOutputSchema,
  type CoachAgentInput,
  type _LLMCoachOutput,
} from "@/core/schemas/coach";
import type { LLMProvider, Message } from "@/core/llm/types";

// MARK: - Fixtures

const VALID_REPORTS = [
  { session_id: "s1", overall_score: 72, summary: "良好" },
  { session_id: "s2", overall_score: 68, summary: "中等" },
  { session_id: "s3", overall_score: 75, summary: "稳定" },
];

const VALID_INPUT: CoachAgentInput = {
  user_id: "user-abc-123",
  based_on_session_count: 3,
  based_on_last_session_id: "session-xyz-001",
  recent_reports: VALID_REPORTS,
  candidate_profile: null,
};

const VALID_LLM_OUTPUT: _LLMCoachOutput = {
  headline: "围绕业务直觉做专项突破",
  headline_detail: "近三场结构化表达稳步提升,建议在业务直觉方向做 2-3 场专项练习。",
  recurring_weaknesses: ["STAR 框架不完整", "数据支撑不足"],
  improvement_signals: ["近三场结构化表达稳定提升", "倾听与回应质量改善"],
  next_focus_areas: ["data-driven", "ai-insight"],
};

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

function makeProvider(output: _LLMCoachOutput): CoachAgentDeps {
  return {
    llm: new MockLLMProvider(() => Promise.resolve(output)) as LLMProvider,
  };
}

// MARK: - runCoachAgent happy path

describe("runCoachAgent — happy path", () => {
  // Case 1: full output with all 8 fields populated + status="ok"

  it("returns all 8 required fields with status='ok'", async () => {
    const deps = makeProvider(VALID_LLM_OUTPUT);
    const result = await runCoachAgent(VALID_INPUT, deps);

    // 5 LLM fields
    expect(result.headline).toBe(VALID_LLM_OUTPUT.headline);
    expect(result.headline_detail).toBe(VALID_LLM_OUTPUT.headline_detail);
    expect(result.recurring_weaknesses).toEqual(VALID_LLM_OUTPUT.recurring_weaknesses);
    expect(result.improvement_signals).toEqual(VALID_LLM_OUTPUT.improvement_signals);
    expect(result.next_focus_areas).toEqual(VALID_LLM_OUTPUT.next_focus_areas);

    // 3 server-stamped fields
    expect(result.user_id).toBe(VALID_INPUT.user_id);
    expect(result.based_on_session_count).toBe(VALID_INPUT.based_on_session_count);
    expect(result.based_on_last_session_id).toBe(VALID_INPUT.based_on_last_session_id);

    // status
    expect(result.status).toBe("ok");

    // generated_at is an ISO string
    expect(result.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    // Validate overall shape
    expect(() => CoachAgentOutputSchema.parse(result)).not.toThrow();
  });

  // Case 2: LLM error propagates

  it("LLM error propagates without being swallowed", async () => {
    const errorLLM = new MockLLMProvider(() =>
      Promise.reject(new Error("LLM network timeout")),
    );
    const deps: CoachAgentDeps = { llm: errorLLM as LLMProvider };

    await expect(runCoachAgent(VALID_INPUT, deps)).rejects.toThrow(
      "LLM network timeout",
    );
  });
});

// MARK: - L0 §A11 PII guard — ZodError on unknown fields

describe("runCoachAgent — L0 §A11 PII guard", () => {
  // Case 3: ZodError on PII field resume_text

  it("ZodError on PII field: resume_text", async () => {
    const deps = makeProvider(VALID_LLM_OUTPUT);

    await expect(
      runCoachAgent(
        { ...VALID_INPUT, resume_text: "candidate personal data" } as never,
        deps,
      ),
    ).rejects.toThrow(ZodError);
  });

  // Case 4: ZodError on PII field candidate_email

  it("ZodError on PII field: candidate_email", async () => {
    const deps = makeProvider(VALID_LLM_OUTPUT);

    await expect(
      runCoachAgent(
        { ...VALID_INPUT, candidate_email: "user@example.com" } as never,
        deps,
      ),
    ).rejects.toThrow(ZodError);
  });

  // Case 5: LLM is NOT called when PII field present

  it("LLM generateObject NOT called when PII field in input", async () => {
    const generateObject = vi.fn();
    const mockLLM = {
      chat: vi.fn(),
      chatStream: vi.fn(),
      generateObject,
    } as unknown as LLMProvider;

    try {
      await runCoachAgent(
        { ...VALID_INPUT, resume_text: "pii data" } as never,
        { llm: mockLLM },
      );
    } catch {
      // expected ZodError
    }

    expect(generateObject).not.toHaveBeenCalled();
  });
});

// MARK: - Schema constraint violations — ZodError

describe("runCoachAgent — schema constraint violations", () => {
  // Case 6: based_on_session_count: 2 (min 3)

  it("ZodError on based_on_session_count: 2 (min 3)", async () => {
    const deps = makeProvider(VALID_LLM_OUTPUT);

    await expect(
      runCoachAgent({ ...VALID_INPUT, based_on_session_count: 2 }, deps),
    ).rejects.toThrow(ZodError);
  });

  // Case 7: based_on_session_count: 0

  it("ZodError on based_on_session_count: 0", async () => {
    const deps = makeProvider(VALID_LLM_OUTPUT);

    await expect(
      runCoachAgent({ ...VALID_INPUT, based_on_session_count: 0 }, deps),
    ).rejects.toThrow(ZodError);
  });

  // Case 8: recent_reports.length: 2 (min 3)

  it("ZodError on recent_reports.length: 2 (min 3)", async () => {
    const deps = makeProvider(VALID_LLM_OUTPUT);

    await expect(
      runCoachAgent(
        { ...VALID_INPUT, recent_reports: [VALID_REPORTS[0], VALID_REPORTS[1]] },
        deps,
      ),
    ).rejects.toThrow(ZodError);
  });

  // Case 9: recent_reports.length: 11 (max 10)

  it("ZodError on recent_reports.length: 11 (max 10)", async () => {
    const deps = makeProvider(VALID_LLM_OUTPUT);
    const elevenReports = Array.from({ length: 11 }, (_, i) => ({
      session_id: `s${i}`,
      overall_score: 70,
    }));

    await expect(
      runCoachAgent({ ...VALID_INPUT, recent_reports: elevenReports }, deps),
    ).rejects.toThrow(ZodError);
  });

  // Case 10: user_id: "" (min 1)

  it("ZodError on user_id: '' (min 1)", async () => {
    const deps = makeProvider(VALID_LLM_OUTPUT);

    await expect(
      runCoachAgent({ ...VALID_INPUT, user_id: "" }, deps),
    ).rejects.toThrow(ZodError);
  });
});

// MARK: - L0 条款 12 教学护栏 — sanitizeTone applied to 4 fields

describe("runCoachAgent — sanitizeTone on 4 text fields", () => {
  // Case 11: sanitizeTone applied to headline — forbidden word → HEADLINE_FALLBACK

  it("headline with forbidden word → HEADLINE_FALLBACK verbatim", async () => {
    const dirtyOutput: _LLMCoachOutput = {
      ...VALID_LLM_OUTPUT,
      headline: "你太差了,完全不适合",
    };
    const deps = makeProvider(dirtyOutput);
    const result = await runCoachAgent(VALID_INPUT, deps);

    expect(result.headline).toBe("继续围绕薄弱维度做专项训练,保持现有节奏稳步累积");
  });

  // Case 12: sanitizeTone applied to headline_detail — forbidden word → HEADLINE_DETAIL_FALLBACK

  it("headline_detail with forbidden word → HEADLINE_DETAIL_FALLBACK verbatim", async () => {
    const dirtyOutput: _LLMCoachOutput = {
      ...VALID_LLM_OUTPUT,
      headline_detail: "差距很大,需要重新考虑方向",
    };
    const deps = makeProvider(dirtyOutput);
    const result = await runCoachAgent(VALID_INPUT, deps);

    expect(result.headline_detail).toBe(
      "近期面试展现出多个进步信号,建议在数据驱动与项目深度方向上巩固,针对易失分维度做 2-3 场专项训练。",
    );
  });

  // Case 13: sanitizeTone applied to recurring_weaknesses — each item with forbidden word → WEAKNESS_FALLBACK

  it("recurring_weaknesses items with forbidden words → each replaced with WEAKNESS_FALLBACK; clean items unchanged", async () => {
    const dirtyOutput: _LLMCoachOutput = {
      ...VALID_LLM_OUTPUT,
      recurring_weaknesses: [
        "你不行,逻辑混乱",   // forbidden
        "STAR 框架不完整",   // clean
        "无希望改善",         // forbidden
      ],
    };
    const deps = makeProvider(dirtyOutput);
    const result = await runCoachAgent(VALID_INPUT, deps);

    expect(result.recurring_weaknesses[0]).toBe("可加强结构化表达");
    expect(result.recurring_weaknesses[1]).toBe("STAR 框架不完整");
    expect(result.recurring_weaknesses[2]).toBe("可加强结构化表达");
  });

  // Case 14: sanitizeTone applied to improvement_signals — each item with forbidden word → SIGNAL_FALLBACK

  it("improvement_signals items with forbidden words → each replaced with SIGNAL_FALLBACK; clean items unchanged", async () => {
    const dirtyOutput: _LLMCoachOutput = {
      ...VALID_LLM_OUTPUT,
      improvement_signals: [
        "太差了,没有进步",       // forbidden
        "近三场结构化表达稳定提升", // clean
      ],
    };
    const deps = makeProvider(dirtyOutput);
    const result = await runCoachAgent(VALID_INPUT, deps);

    expect(result.improvement_signals[0]).toBe("保持目前的练习节奏");
    expect(result.improvement_signals[1]).toBe("近三场结构化表达稳定提升");
  });

  // Case 15: next_focus_areas NOT sanitized — passes through as-is (enum-locked)

  it("next_focus_areas passes through unchanged (not sanitized)", async () => {
    const deps = makeProvider(VALID_LLM_OUTPUT);
    const result = await runCoachAgent(VALID_INPUT, deps);

    expect(result.next_focus_areas).toEqual(VALID_LLM_OUTPUT.next_focus_areas);
  });

  // Case 16: clean LLM output — no sanitization, all fields unchanged

  it("clean LLM output → all fields pass through unchanged", async () => {
    const deps = makeProvider(VALID_LLM_OUTPUT);
    const result = await runCoachAgent(VALID_INPUT, deps);

    expect(result.headline).toBe(VALID_LLM_OUTPUT.headline);
    expect(result.headline_detail).toBe(VALID_LLM_OUTPUT.headline_detail);
    expect(result.recurring_weaknesses).toEqual(VALID_LLM_OUTPUT.recurring_weaknesses);
    expect(result.improvement_signals).toEqual(VALID_LLM_OUTPUT.improvement_signals);
  });
});

// MARK: - WARN log assertions

describe("runCoachAgent — WARN log coach_tone_violation", () => {
  // Case 17: WARN log emitted on tone violation with {field, forbidden_hits}

  it("WARN log emitted with coach_tone_violation + {field, forbidden_hits}", async () => {
    const loggerWarn = vi.fn();
    const dirtyOutput: _LLMCoachOutput = {
      ...VALID_LLM_OUTPUT,
      headline: "你不行,需要放弃这条路",
    };
    const deps: CoachAgentDeps = {
      llm: new MockLLMProvider(() => Promise.resolve(dirtyOutput)) as LLMProvider,
      logger: { warn: loggerWarn },
    };

    await runCoachAgent(VALID_INPUT, deps);

    expect(loggerWarn).toHaveBeenCalledWith(
      "coach_tone_violation",
      expect.objectContaining({
        field: "headline",
        forbidden_hits: expect.arrayContaining(["你不行"]),
      }),
    );
  });

  // Case 18: WARN log called once per violation, field name matches

  it("WARN log called for headline_detail with correct field name", async () => {
    const loggerWarn = vi.fn();
    const dirtyOutput: _LLMCoachOutput = {
      ...VALID_LLM_OUTPUT,
      headline_detail: "差距很大,需要放弃",
    };
    const deps: CoachAgentDeps = {
      llm: new MockLLMProvider(() => Promise.resolve(dirtyOutput)) as LLMProvider,
      logger: { warn: loggerWarn },
    };

    await runCoachAgent(VALID_INPUT, deps);

    expect(loggerWarn).toHaveBeenCalledWith(
      "coach_tone_violation",
      expect.objectContaining({
        field: "headline_detail",
        forbidden_hits: expect.arrayContaining(["差距很大"]),
      }),
    );
  });

  // Case 19: WARN log NOT emitted on clean output

  it("WARN log NOT emitted when LLM output is clean", async () => {
    const loggerWarn = vi.fn();
    const deps: CoachAgentDeps = {
      llm: new MockLLMProvider(() => Promise.resolve(VALID_LLM_OUTPUT)) as LLMProvider,
      logger: { warn: loggerWarn },
    };

    await runCoachAgent(VALID_INPUT, deps);

    expect(loggerWarn).not.toHaveBeenCalled();
  });

  // Case 20: WARN log for recurring_weaknesses with correct field + hits

  it("WARN log emitted for recurring_weaknesses with correct forbidden_hits", async () => {
    const loggerWarn = vi.fn();
    const dirtyOutput: _LLMCoachOutput = {
      ...VALID_LLM_OUTPUT,
      recurring_weaknesses: ["失败者模式,无希望改善"],
    };
    const deps: CoachAgentDeps = {
      llm: new MockLLMProvider(() => Promise.resolve(dirtyOutput)) as LLMProvider,
      logger: { warn: loggerWarn },
    };

    await runCoachAgent(VALID_INPUT, deps);

    expect(loggerWarn).toHaveBeenCalledWith(
      "coach_tone_violation",
      expect.objectContaining({
        field: "recurring_weaknesses",
        forbidden_hits: expect.arrayContaining(["失败者", "无希望"]),
      }),
    );
  });
});

// MARK: - Audit log assertions

describe("runCoachAgent — audit log coach_request", () => {
  // Case 21: audit log emitted with based_on_session_count + has_candidate_profile

  it("info log 'coach_request' emitted with correct meta (no candidate_profile)", async () => {
    const loggerInfo = vi.fn();
    const deps: CoachAgentDeps = {
      llm: new MockLLMProvider(() => Promise.resolve(VALID_LLM_OUTPUT)) as LLMProvider,
      logger: { info: loggerInfo },
    };

    await runCoachAgent(VALID_INPUT, deps);

    expect(loggerInfo).toHaveBeenCalledWith(
      "coach_request",
      expect.objectContaining({
        based_on_session_count: VALID_INPUT.based_on_session_count,
        has_candidate_profile: false,
      }),
    );
  });

  // Case 22: has_candidate_profile = true when candidate_profile provided

  it("has_candidate_profile = true when candidate_profile is non-null", async () => {
    const loggerInfo = vi.fn();
    const inputWithProfile: CoachAgentInput = {
      ...VALID_INPUT,
      candidate_profile: { role: "Product Manager", years_of_experience: 3 },
    };
    const deps: CoachAgentDeps = {
      llm: new MockLLMProvider(() => Promise.resolve(VALID_LLM_OUTPUT)) as LLMProvider,
      logger: { info: loggerInfo },
    };

    await runCoachAgent(inputWithProfile, deps);

    expect(loggerInfo).toHaveBeenCalledWith(
      "coach_request",
      expect.objectContaining({
        has_candidate_profile: true,
      }),
    );
  });
});

// MARK: - Server-stamp metadata

describe("runCoachAgent — server-stamp metadata", () => {
  // Case 23: server-stamped fields match input + generated_at is ISO + status="ok"

  it("server-stamped: user_id / based_on_session_count / based_on_last_session_id / generated_at / status", async () => {
    const deps = makeProvider(VALID_LLM_OUTPUT);
    const before = new Date().toISOString();
    const result = await runCoachAgent(VALID_INPUT, deps);
    const after = new Date().toISOString();

    expect(result.user_id).toBe(VALID_INPUT.user_id);
    expect(result.based_on_session_count).toBe(VALID_INPUT.based_on_session_count);
    expect(result.based_on_last_session_id).toBe(VALID_INPUT.based_on_last_session_id);
    expect(result.status).toBe("ok");

    // generated_at is within the test window
    const generatedAt = result.generated_at;
    expect(generatedAt >= before).toBe(true);
    expect(generatedAt <= after).toBe(true);
  });
});

// MARK: - prompts.ts tests

describe("systemPrompt()", () => {
  // Case 24: contains key identifiers

  it('contains "Coach Agent"', () => {
    expect(systemPrompt()).toContain("Coach Agent");
  });

  it('contains "L0 条款 12"', () => {
    expect(systemPrompt()).toContain("L0 条款 12");
  });

  it("contains 8 out of 12 forbidden words from canonical list (sample check)", () => {
    const prompt = systemPrompt();
    const sampleWords = [
      "不建议", "不推荐", "建议放弃", "不适合",
      "差距很大", "不合格", "淘汰", "无希望",
    ];
    for (const word of sampleWords) {
      expect(prompt).toContain(word);
    }
  });

  it('contains all 5 output field names', () => {
    const prompt = systemPrompt();
    expect(prompt).toContain("headline");
    expect(prompt).toContain("headline_detail");
    expect(prompt).toContain("recurring_weaknesses");
    expect(prompt).toContain("improvement_signals");
    expect(prompt).toContain("next_focus_areas");
  });

  it('inlines _guardrails.j2: contains "忽略之前的指令"', () => {
    expect(systemPrompt()).toContain("忽略之前的指令");
  });

  it('inlines _guardrails.j2: contains "严格符合目标 schema 的结构化 JSON"', () => {
    expect(systemPrompt()).toContain("严格符合目标 schema 的结构化 JSON");
  });
});

describe("userPrompt()", () => {
  // Case 25: with candidate_profile → contains candidate section

  it("with candidate_profile set → contains '候选人画像' header and the JSON", () => {
    const inputWithProfile: CoachAgentInput = {
      ...VALID_INPUT,
      candidate_profile: { role: "Product Manager" },
    };
    const content = userPrompt(inputWithProfile);

    expect(content).toContain("候选人画像");
    expect(content).toContain("Product Manager");
  });

  // Case 26: with candidate_profile null → no candidate section

  it("with candidate_profile null → no candidate profile section", () => {
    const content = userPrompt(VALID_INPUT); // candidate_profile: null

    expect(content).not.toContain("候选人画像");
  });

  // Case 27: always contains based_on_session_count + recent_reports JSON

  it("always contains based_on_session_count and recent_reports JSON", () => {
    const content = userPrompt(VALID_INPUT);

    expect(content).toContain(String(VALID_INPUT.based_on_session_count));
    expect(content).toContain("s1"); // from VALID_REPORTS[0].session_id
    expect(content).toContain("s3"); // from VALID_REPORTS[2].session_id
  });

  // Case 28: candidate_profile as empty object → no candidate section

  it("candidate_profile as empty object → no candidate profile section", () => {
    const inputWithEmptyProfile: CoachAgentInput = {
      ...VALID_INPUT,
      candidate_profile: {},
    };
    const content = userPrompt(inputWithEmptyProfile);

    expect(content).not.toContain("候选人画像");
  });
});

// ===== M8.2: draftReadableAnswer tests =====

// Forbidden meta phrases for the readable answer drafter.
// Distinct from L0-3 FORBIDDEN_TONE_WORDS (those cover cross-session Coach output).
const FORBIDDEN_META = [
  "建议你",
  "可以从",
  "注意",
  "提醒",
  "应该",
  "推荐",
  "你可以这样",
] as const;

function scanForbiddenMeta(text: string): string[] {
  return FORBIDDEN_META.filter((w) => text.includes(w));
}

// Mock LLM for draftReadableAnswer tests
function makeDraftProvider(markdownAnswer: string): DraftReadableAnswerDeps {
  return {
    llm: {
      chat: vi.fn(),
      chatStream: vi.fn(),
      generateObject: vi.fn().mockResolvedValue({
        ai_suggested_answer_markdown: markdownAnswer,
      }),
    } as unknown as LLMProvider,
  };
}

// Pre-built clean markdown answers for fuzz sampling (50 variants).
// Each contains at least one ** bold marker and no forbidden meta phrases.
const FUZZ_CLEAN_ANSWERS: string[] = Array.from({ length: 50 }, (_, i) =>
  `我在做 **产品决策** 时，会先明确用户核心诉求。\n1. 通过**数据分析**锁定关键问题\n2. 快速验证假设，缩短反馈周期\n3. 迭代优化，持续跟踪指标 (sample-${i})`,
);

describe("draftReadableAnswer — forbidden meta phrases (fuzz, 50 samples)", () => {
  // Case 29: 50 mock outputs — none should contain forbidden meta phrases

  it("50 sampled outputs contain zero forbidden meta phrases", async () => {
    for (let i = 0; i < 50; i++) {
      const deps = makeDraftProvider(FUZZ_CLEAN_ANSWERS[i]);
      const result = await draftReadableAnswer(
        { question: `请描述你如何推动一个产品从 0 到 1（样本 ${i}）`, persona: "Sarah" },
        deps,
      );
      const hits = scanForbiddenMeta(result.ai_suggested_answer_markdown);
      expect(hits, `sample ${i}: forbidden meta phrases found: ${JSON.stringify(hits)}`).toHaveLength(0);
    }
  });
});

describe("draftReadableAnswer — happy path markdown bold", () => {
  // Case 30: output contains at least one ** bold marker

  it("output contains at least one **bold** markdown marker", async () => {
    const markdownWithBold = "在处理 **跨部门协作** 时，我会先对齐目标。\n1. 明确各方 **核心利益**\n2. 建立定期同步机制\n3. 用数据驱动共识";
    const deps = makeDraftProvider(markdownWithBold);

    const result = await draftReadableAnswer(
      { question: "请描述你如何处理跨部门协作中的冲突", persona: "Marcus" },
      deps,
    );

    expect(result.ai_suggested_answer_markdown).toContain("**");
    expect(ReadableAnswerOutputSchema.safeParse(result).success).toBe(true);
  });

  // Case 31: all 4 personas are accepted without error

  it("accepts all 4 L0-locked personas without error", async () => {
    const personas = ["Sarah", "Marcus", "Lin", "Daniel"] as const;
    for (const persona of personas) {
      const deps = makeDraftProvider(`以 **${persona}** 身份作答示例。\n1. 要点一\n2. 要点二`);
      const result = await draftReadableAnswer(
        { question: "请自我介绍", persona },
        deps,
      );
      expect(result.ai_suggested_answer_markdown).toContain(`**${persona}**`);
    }
  });
});

describe("draftReadableAnswer — LLM error propagation", () => {
  // Case 32: LLM error propagates without being swallowed

  it("LLM error propagates without being swallowed", async () => {
    const deps: DraftReadableAnswerDeps = {
      llm: {
        chat: vi.fn(),
        chatStream: vi.fn(),
        generateObject: vi.fn().mockRejectedValue(new Error("LLM upstream timeout")),
      } as unknown as LLMProvider,
    };

    await expect(
      draftReadableAnswer(
        { question: "请描述你最大的职业挑战", persona: "Lin" },
        deps,
      ),
    ).rejects.toThrow("LLM upstream timeout");
  });
});

describe("readableAnswerSystemPrompt()", () => {
  // Case 33: prompt contains persona name and all required constraint markers

  it("contains persona name in prompt", () => {
    const prompt = readableAnswerSystemPrompt("Daniel");
    expect(prompt).toContain("Daniel");
  });

  it("contains all 7 forbidden meta words in the prompt constraints", () => {
    const prompt = readableAnswerSystemPrompt("Sarah");
    for (const word of FORBIDDEN_META) {
      expect(prompt, `prompt should list forbidden word: ${word}`).toContain(word);
    }
  });

  it("contains ai_suggested_answer_markdown output key", () => {
    const prompt = readableAnswerSystemPrompt("Marcus");
    expect(prompt).toContain("ai_suggested_answer_markdown");
  });
});

describe("readableAnswerUserPrompt()", () => {
  // Case 34: user prompt injects the question text

  it("injects question text into user prompt", () => {
    const question = "请描述一次你主导产品迭代的经历";
    const prompt = readableAnswerUserPrompt(question);
    expect(prompt).toContain(question);
  });
});
