/**
 * Reflection Agent — Teaching Guardrail Tests
 *
 * Spec: M3.3.3.dev.c acceptance gate
 * Original spec location: apps/desktop/src/__tests__/reflectionAgent.teaching.test.ts
 * Override: placed under core/agents/reflection/__tests__/ matching M3.2.x / M3.3.x convention.
 *
 * Run: cd apps/desktop && pnpm vitest run src/core/agents/reflection
 */

import { describe, it, expect, vi } from "vitest";
import { ZodError, z } from "zod";
import {
  runReflectionAgent,
  rewriteAccusatoryToTeaching,
  sanitizeDiagnosis,
  scanOverlapWithVerdict,
  normalizeResources,
  sanitizeOutput,
  ACCUSATORY_PREFIXES,
  AI_VERDICT_CORE_TERMS,
  TEACHING_FALLBACK,
  EXEC_SUMMARY_FALLBACK,
  GROWTH_ADVICE_FALLBACK,
  KEY_PHRASE_FALLBACK,
  DIALOGUE_FALLBACK,
  DIAGNOSIS_FALLBACK_PARTIAL,
  type ReflectionAgentDeps,
} from "../index";
import { systemPrompt, userPrompt } from "../prompts";
import {
  ReflectionAgentOutputSchema,
  _LLMReflectionOutputSchema,
  type ReflectionAgentInput,
  type _LLMReflectionOutput,
} from "@/core/schemas/reflection";
import type { LLMProvider, Message } from "@/core/llm/types";

// MARK: - Fixtures

const VALID_INPUT: ReflectionAgentInput = {
  session_id: "session-abc-001",
  report_id: "report-xyz-001",
  report_payload: {
    ai_verdict: "结构化表达有待加强",
    overall_score: 72,
    summary: "整体表现稳定",
  },
  turns: [
    {
      question: "请介绍一下你最近的项目",
      answer: "我负责了一个数据平台的设计",
      assessment: { summary: "结构一般" },
    },
  ],
  parse_payload: null,
  research_payload: null,
};

const VALID_LLM_OUTPUT: _LLMReflectionOutput = {
  executive_summary: "本场整体表现稳定,建议在 STAR 框架的 R 环节加强量化收尾。",
  per_question_coaching: [
    {
      turn_index: 0,
      question: "请介绍一下你最近的项目",
      your_answer_summary: "候选人介绍了数据平台项目,结构一般",
      diagnosis: "建议在 STAR 的 Result 环节加入量化数据",
      model_answer_outline: [
        "Situation: 描述背景和痛点",
        "Task: 明确个人职责",
        "Action: 具体行动步骤",
        "Result: 量化结果指标",
      ],
      key_phrases_to_use: ["数据驱动决策", "降低 X% 成本", "提升 Y% 效率"],
      mistakes_to_avoid: [
        "建议下次注意用量化指标作为答案收尾",
        "建议下次避免过于描述过程而忽略结果",
      ],
      recommended_resources: ["《金字塔原理》", "STAR 面试法框架"],
    },
  ],
  general_growth_advice:
    "建议围绕结构化表达做专项练习,每次回答后自问:量化结果是否清晰?",
  mock_followup_dialogue: [
    { role: "interviewer", text: "能具体说说降低了多少成本吗?" },
    { role: "candidate", text: "大约降低了 30%,主要来自自动化流程优化。" },
  ],
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

function makeProvider(output: _LLMReflectionOutput): ReflectionAgentDeps {
  return {
    llm: new MockLLMProvider(() => Promise.resolve(output)) as LLMProvider,
  };
}

// MARK: - runReflectionAgent happy path

describe("runReflectionAgent — happy path", () => {
  // Case 1: full output with all required fields populated + status="ok"

  it("returns all required fields with status='ok'", async () => {
    const deps = makeProvider(VALID_LLM_OUTPUT);
    const result = await runReflectionAgent(VALID_INPUT, deps);

    // LLM fields
    expect(result.executive_summary).toBe(VALID_LLM_OUTPUT.executive_summary);
    expect(result.general_growth_advice).toBe(VALID_LLM_OUTPUT.general_growth_advice);
    expect(result.per_question_coaching).toHaveLength(1);
    expect(result.mock_followup_dialogue).toHaveLength(2);

    // Server-stamped fields
    expect(result.report_id).toBe(VALID_INPUT.report_id);
    expect(result.session_id).toBe(VALID_INPUT.session_id);
    expect(result.status).toBe("ok");

    // generated_at is an ISO string
    expect(result.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    // Validate overall shape
    expect(() => ReflectionAgentOutputSchema.parse(result)).not.toThrow();
  });

  // Case 2: LLM error propagates

  it("LLM error propagates without being swallowed", async () => {
    const errorLLM = new MockLLMProvider(() =>
      Promise.reject(new Error("LLM network timeout")),
    );
    const deps: ReflectionAgentDeps = { llm: errorLLM as LLMProvider };

    await expect(runReflectionAgent(VALID_INPUT, deps)).rejects.toThrow(
      "LLM network timeout",
    );
  });
});

// MARK: - L0 §A11 PII guard — ZodError on unknown fields

describe("runReflectionAgent — L0 §A11 PII guard", () => {
  // Case 3: ZodError on PII field resume_text

  it("ZodError on PII field: resume_text", async () => {
    const deps = makeProvider(VALID_LLM_OUTPUT);

    await expect(
      runReflectionAgent(
        { ...VALID_INPUT, resume_text: "candidate personal data" } as never,
        deps,
      ),
    ).rejects.toThrow(ZodError);
  });

  // Case 4: ZodError on PII field candidate_email

  it("ZodError on PII field: candidate_email", async () => {
    const deps = makeProvider(VALID_LLM_OUTPUT);

    await expect(
      runReflectionAgent(
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
      await runReflectionAgent(
        { ...VALID_INPUT, resume_text: "pii data" } as never,
        { llm: mockLLM },
      );
    } catch {
      // expected ZodError
    }

    expect(generateObject).not.toHaveBeenCalled();
  });

  // Case 6: ZodError on session_id: "" (min 1)

  it("ZodError on session_id: '' (min 1)", async () => {
    const deps = makeProvider(VALID_LLM_OUTPUT);

    await expect(
      runReflectionAgent({ ...VALID_INPUT, session_id: "" }, deps),
    ).rejects.toThrow(ZodError);
  });

  // Case 7: ZodError on report_id: "" (min 1)

  it("ZodError on report_id: '' (min 1)", async () => {
    const deps = makeProvider(VALID_LLM_OUTPUT);

    await expect(
      runReflectionAgent({ ...VALID_INPUT, report_id: "" }, deps),
    ).rejects.toThrow(ZodError);
  });

  // Case 8: ZodError on turns: 31 items (max 30)

  it("ZodError on turns: 31 items (max 30)", async () => {
    const deps = makeProvider(VALID_LLM_OUTPUT);
    const thirtyOneTurns = Array.from({ length: 31 }, (_, i) => ({
      question: `q${i}`,
      answer: `a${i}`,
    }));

    await expect(
      runReflectionAgent({ ...VALID_INPUT, turns: thirtyOneTurns }, deps),
    ).rejects.toThrow(ZodError);
  });
});

// MARK: - L0 条款 12 教学护栏 — sanitizeTone applied to 7 fields

describe("runReflectionAgent — sanitizeTone on text fields", () => {
  // Case 9: executive_summary with forbidden word → EXEC_SUMMARY_FALLBACK

  it("executive_summary with forbidden word → EXEC_SUMMARY_FALLBACK verbatim", async () => {
    const dirtyOutput: _LLMReflectionOutput = {
      ...VALID_LLM_OUTPUT,
      executive_summary: "候选人太差了,不建议继续面试",
    };
    const deps = makeProvider(dirtyOutput);
    const result = await runReflectionAgent(VALID_INPUT, deps);

    expect(result.executive_summary).toBe(EXEC_SUMMARY_FALLBACK);
  });

  // Case 10: general_growth_advice with forbidden word → GROWTH_ADVICE_FALLBACK

  it("general_growth_advice with forbidden word → GROWTH_ADVICE_FALLBACK verbatim", async () => {
    const dirtyOutput: _LLMReflectionOutput = {
      ...VALID_LLM_OUTPUT,
      general_growth_advice: "差距很大,建议放弃这个方向",
    };
    const deps = makeProvider(dirtyOutput);
    const result = await runReflectionAgent(VALID_INPUT, deps);

    expect(result.general_growth_advice).toBe(GROWTH_ADVICE_FALLBACK);
  });

  // Case 11: per_question_coaching[].diagnosis with forbidden word → tone fallback

  it("per_question_coaching[].diagnosis with forbidden word → '可加强 STAR 框架的结构表达'", async () => {
    const dirtyOutput: _LLMReflectionOutput = {
      ...VALID_LLM_OUTPUT,
      per_question_coaching: [
        {
          ...VALID_LLM_OUTPUT.per_question_coaching[0],
          diagnosis: "你不行,答案太差了",
        },
      ],
    };
    const deps = makeProvider(dirtyOutput);
    const result = await runReflectionAgent(VALID_INPUT, deps);

    expect(result.per_question_coaching[0].diagnosis).toBe(
      "可加强 STAR 框架的结构表达",
    );
  });

  // Case 12: per_question_coaching[].model_answer_outline[] with forbidden word → TEACHING_FALLBACK

  it("model_answer_outline[] item with forbidden word → TEACHING_FALLBACK", async () => {
    const dirtyOutput: _LLMReflectionOutput = {
      ...VALID_LLM_OUTPUT,
      per_question_coaching: [
        {
          ...VALID_LLM_OUTPUT.per_question_coaching[0],
          model_answer_outline: ["正常要点", "你不行,不合格的表达方式"],
        },
      ],
    };
    const deps = makeProvider(dirtyOutput);
    const result = await runReflectionAgent(VALID_INPUT, deps);

    expect(result.per_question_coaching[0].model_answer_outline[0]).toBe("正常要点");
    expect(result.per_question_coaching[0].model_answer_outline[1]).toBe(TEACHING_FALLBACK);
  });

  // Case 13: per_question_coaching[].key_phrases_to_use[] with forbidden word → KEY_PHRASE_FALLBACK

  it("key_phrases_to_use[] item with forbidden word → KEY_PHRASE_FALLBACK", async () => {
    const dirtyOutput: _LLMReflectionOutput = {
      ...VALID_LLM_OUTPUT,
      per_question_coaching: [
        {
          ...VALID_LLM_OUTPUT.per_question_coaching[0],
          key_phrases_to_use: ["数据驱动", "太差的表达方式", "量化结果"],
        },
      ],
    };
    const deps = makeProvider(dirtyOutput);
    const result = await runReflectionAgent(VALID_INPUT, deps);

    expect(result.per_question_coaching[0].key_phrases_to_use[0]).toBe("数据驱动");
    expect(result.per_question_coaching[0].key_phrases_to_use[1]).toBe(KEY_PHRASE_FALLBACK);
    expect(result.per_question_coaching[0].key_phrases_to_use[2]).toBe("量化结果");
  });

  // Case 14: per_question_coaching[].mistakes_to_avoid[] with forbidden word → TEACHING_FALLBACK
  // (then accusatory check — TEACHING_FALLBACK doesn't start with accusatory, so no further rewrite)

  it("mistakes_to_avoid[] item with forbidden word → TEACHING_FALLBACK (no accusatory rewrite needed)", async () => {
    const dirtyOutput: _LLMReflectionOutput = {
      ...VALID_LLM_OUTPUT,
      per_question_coaching: [
        {
          ...VALID_LLM_OUTPUT.per_question_coaching[0],
          mistakes_to_avoid: ["建议下次注意量化", "无希望的表达"],
        },
      ],
    };
    const deps = makeProvider(dirtyOutput);
    const result = await runReflectionAgent(VALID_INPUT, deps);

    expect(result.per_question_coaching[0].mistakes_to_avoid[0]).toBe("建议下次注意量化");
    expect(result.per_question_coaching[0].mistakes_to_avoid[1]).toBe(TEACHING_FALLBACK);
  });

  // Case 15: mock_followup_dialogue[].text with forbidden word → DIALOGUE_FALLBACK

  it("mock_followup_dialogue[].text with forbidden word → DIALOGUE_FALLBACK", async () => {
    const dirtyOutput: _LLMReflectionOutput = {
      ...VALID_LLM_OUTPUT,
      mock_followup_dialogue: [
        { role: "interviewer", text: "能说说你的量化结果吗?" },
        { role: "candidate", text: "你不行,太差了" },
      ],
    };
    const deps = makeProvider(dirtyOutput);
    const result = await runReflectionAgent(VALID_INPUT, deps);

    expect(result.mock_followup_dialogue[0].text).toBe("能说说你的量化结果吗?");
    expect(result.mock_followup_dialogue[1].text).toBe(DIALOGUE_FALLBACK);
  });

  // Case 16: clean LLM output — no sanitization, all fields unchanged

  it("clean LLM output → all fields pass through unchanged", async () => {
    const deps = makeProvider(VALID_LLM_OUTPUT);
    const result = await runReflectionAgent(VALID_INPUT, deps);

    expect(result.executive_summary).toBe(VALID_LLM_OUTPUT.executive_summary);
    expect(result.general_growth_advice).toBe(VALID_LLM_OUTPUT.general_growth_advice);
    expect(result.per_question_coaching[0].diagnosis).toBe(
      VALID_LLM_OUTPUT.per_question_coaching[0].diagnosis,
    );
  });
});

// MARK: - rewriteAccusatoryToTeaching

describe("rewriteAccusatoryToTeaching", () => {
  // Case 17: "你犯了忽视量化的错误" → "建议下次注意:了忽视量化的错误"
  // Note: "了" is NOT stripped — it's a regular Chinese character, not in the strip set (' ,。')

  it('"你犯了忽视量化的错误" → "建议下次注意:了忽视量化的错误" (了 is NOT stripped)', () => {
    expect(rewriteAccusatoryToTeaching("你犯了忽视量化的错误")).toBe(
      "建议下次注意:了忽视量化的错误",
    );
  });

  // Case 18: "你又一次忽略问题" → "建议下次注意:一次忽略问题"

  it('"你又一次忽略问题" → "建议下次注意:一次忽略问题"', () => {
    expect(rewriteAccusatoryToTeaching("你又一次忽略问题")).toBe(
      "建议下次注意:一次忽略问题",
    );
  });

  // Case 19: "你总是粗心" → "建议下次注意:是粗心"

  it('"你总是粗心" → "建议下次注意:是粗心"', () => {
    expect(rewriteAccusatoryToTeaching("你总是粗心")).toBe("建议下次注意:是粗心");
  });

  // Case 20: "你居然没准备" → "建议下次注意:没准备"

  it('"你居然没准备" → "建议下次注意:没准备"', () => {
    expect(rewriteAccusatoryToTeaching("你居然没准备")).toBe("建议下次注意:没准备");
  });

  // Case 21: leading punctuation stripped after prefix

  it('"你犯, 错误" → "建议下次注意:错误" (comma + space stripped)', () => {
    expect(rewriteAccusatoryToTeaching("你犯, 错误")).toBe("建议下次注意:错误");
  });

  it('"你犯,。 错误" → "建议下次注意:错误" (comma + fullwidth comma + period + space stripped)', () => {
    expect(rewriteAccusatoryToTeaching("你犯,。 错误")).toBe("建议下次注意:错误");
  });

  // Case 22: text NOT starting with accusatory prefix → unchanged

  it("text not starting with accusatory prefix → unchanged", () => {
    expect(rewriteAccusatoryToTeaching("建议下次注意量化数据")).toBe(
      "建议下次注意量化数据",
    );
    expect(rewriteAccusatoryToTeaching("这是一个正常的建议")).toBe(
      "这是一个正常的建议",
    );
    expect(rewriteAccusatoryToTeaching("")).toBe("");
  });

  // Case 23: WARN log emitted with {prefix, len}

  it("emits WARN log reflection_accusatory_rewrite with {prefix, len}", () => {
    const loggerWarn = vi.fn();
    rewriteAccusatoryToTeaching("你犯了一个逻辑错误", { warn: loggerWarn });

    expect(loggerWarn).toHaveBeenCalledWith(
      "reflection_accusatory_rewrite",
      expect.objectContaining({
        prefix: "你犯",
        len: "你犯了一个逻辑错误".length,
      }),
    );
  });

  // Case 24: no WARN log on non-accusatory text

  it("no WARN log when text does not start with accusatory prefix", () => {
    const loggerWarn = vi.fn();
    rewriteAccusatoryToTeaching("建议下次注意量化", { warn: loggerWarn });

    expect(loggerWarn).not.toHaveBeenCalled();
  });
});

// MARK: - sanitizeDiagnosis

describe("sanitizeDiagnosis", () => {
  // Case 25: AI_VERDICT_CORE_TERMS in diagnosis → overlap fallback

  it('"结构不清晰" in diagnosis → "可加强 STAR 框架的STAR 收尾节奏"', () => {
    const result = sanitizeDiagnosis("这道题结构不清晰,需要改进", null, 0);
    expect(result).toBe("可加强 STAR 框架的STAR 收尾节奏");
  });

  it('"缺乏逻辑" in diagnosis → overlap fallback', () => {
    const result = sanitizeDiagnosis("答案缺乏逻辑性", null, 1);
    expect(result).toBe("可加强 STAR 框架的STAR 收尾节奏");
  });

  // Case 26: overlap with input.report_payload.ai_verdict

  it("overlap with ai_verdict from report_payload → coerce to overlap fallback", () => {
    // ai_verdict contains "偏离主题", diagnosis also contains it
    const result = sanitizeDiagnosis("这道题偏离主题了", "偏离主题是主要问题", 0);
    expect(result).toBe("可加强 STAR 框架的STAR 收尾节奏");
  });

  // Case 27: clean diagnosis → unchanged

  it("clean diagnosis with no overlap → text unchanged", () => {
    const result = sanitizeDiagnosis("建议在 STAR 的 R 环节加入量化数据", null, 0);
    expect(result).toBe("建议在 STAR 的 R 环节加入量化数据");
  });

  // Case 28: tone violation first, then overlap check on fallback

  it("forbidden word in diagnosis → tone fallback (no overlap since fallback is clean)", () => {
    // forbidden: "太差" → fallback "可加强 STAR 框架的结构表达"
    // then overlap check on fallback — fallback is clean, no overlap
    const result = sanitizeDiagnosis("答案太差了", null, 0);
    expect(result).toBe("可加强 STAR 框架的结构表达");
  });

  // Case 29: both forbidden + overlap — tone wins first; fallback is clean

  it("forbidden + overlap in same text — tone fallback returned (not overlap fallback)", () => {
    // text has both "太差" (forbidden) and "结构不清晰" (overlap term)
    // Stage 1: tone check fires → fallback "可加强 STAR 框架的结构表达"
    // Stage 2: overlap check on fallback — fallback doesn't contain overlap terms → clean
    const result = sanitizeDiagnosis("太差了,结构不清晰", null, 0);
    expect(result).toBe("可加强 STAR 框架的结构表达");
  });

  // Case 30: WARN log emitted for overlap

  it("emits WARN log reflection_overlap_with_report_verdict with {turn_index, overlap_terms}", () => {
    const loggerWarn = vi.fn();
    sanitizeDiagnosis("答案条理混乱", null, 3, { warn: loggerWarn });

    expect(loggerWarn).toHaveBeenCalledWith(
      "reflection_overlap_with_report_verdict",
      expect.objectContaining({
        turn_index: 3,
        overlap_terms: expect.arrayContaining(["条理混乱"]),
      }),
    );
  });

  // Case 31: WARN log reflection_tone_violation for forbidden word in diagnosis

  it("emits WARN log reflection_tone_violation for forbidden word in diagnosis", () => {
    const loggerWarn = vi.fn();
    sanitizeDiagnosis("你不行,这个回答太差", null, 0, { warn: loggerWarn });

    expect(loggerWarn).toHaveBeenCalledWith(
      "reflection_tone_violation",
      expect.objectContaining({
        field: "diagnosis",
        forbidden_hits: expect.arrayContaining(["你不行"]),
      }),
    );
  });
});

// MARK: - normalizeResources

describe("normalizeResources", () => {
  // Case 32: trim each item

  it("trims leading and trailing whitespace from each item", () => {
    const result = normalizeResources(["  《金字塔原理》  ", " STAR 框架 "]);
    expect(result).toEqual(["《金字塔原理》", "STAR 框架"]);
  });

  // Case 33: skip empty strings (including whitespace-only)

  it("skips empty strings and whitespace-only items", () => {
    const result = normalizeResources(["《金字塔原理》", "", "  ", "STAR 框架"]);
    expect(result).toEqual(["《金字塔原理》", "STAR 框架"]);
  });

  // Case 34: skip duplicates preserving original order

  it("skips duplicates preserving original order", () => {
    const result = normalizeResources([
      "《金字塔原理》",
      "STAR 框架",
      "《金字塔原理》",
      "批判性思维",
    ]);
    expect(result).toEqual(["《金字塔原理》", "STAR 框架", "批判性思维"]);
  });

  // Case 35: empty array → empty array

  it("empty array → empty array", () => {
    expect(normalizeResources([])).toEqual([]);
  });

  // Case 36: duplicate after trimming

  it("duplicate after trimming → deduplicated", () => {
    const result = normalizeResources(["STAR 框架", "  STAR 框架  "]);
    expect(result).toEqual(["STAR 框架"]);
  });
});

// MARK: - WARN log assertions (via runReflectionAgent)

describe("runReflectionAgent — WARN log assertions", () => {
  // Case 37: WARN log reflection_tone_violation emitted for executive_summary

  it("reflection_tone_violation WARN log with {field, forbidden_hits} for executive_summary", async () => {
    const loggerWarn = vi.fn();
    const dirtyOutput: _LLMReflectionOutput = {
      ...VALID_LLM_OUTPUT,
      executive_summary: "候选人太差,不建议继续",
    };
    const deps: ReflectionAgentDeps = {
      llm: new MockLLMProvider(() => Promise.resolve(dirtyOutput)) as LLMProvider,
      logger: { warn: loggerWarn },
    };

    await runReflectionAgent(VALID_INPUT, deps);

    expect(loggerWarn).toHaveBeenCalledWith(
      "reflection_tone_violation",
      expect.objectContaining({
        field: "executive_summary",
        forbidden_hits: expect.arrayContaining(["太差"]),
      }),
    );
  });

  // Case 38: WARN log reflection_accusatory_rewrite for accusatory mistakes_to_avoid

  it("reflection_accusatory_rewrite WARN log with {prefix, len} for mistakes_to_avoid", async () => {
    const loggerWarn = vi.fn();
    const dirtyOutput: _LLMReflectionOutput = {
      ...VALID_LLM_OUTPUT,
      per_question_coaching: [
        {
          ...VALID_LLM_OUTPUT.per_question_coaching[0],
          mistakes_to_avoid: ["你犯了忽视量化的错误"],
        },
      ],
    };
    const deps: ReflectionAgentDeps = {
      llm: new MockLLMProvider(() => Promise.resolve(dirtyOutput)) as LLMProvider,
      logger: { warn: loggerWarn },
    };

    await runReflectionAgent(VALID_INPUT, deps);

    expect(loggerWarn).toHaveBeenCalledWith(
      "reflection_accusatory_rewrite",
      expect.objectContaining({
        prefix: "你犯",
        len: "你犯了忽视量化的错误".length,
      }),
    );
  });

  // Case 39: WARN log reflection_overlap_with_report_verdict for diagnosis overlap

  it("reflection_overlap_with_report_verdict WARN log with {turn_index, overlap_terms}", async () => {
    const loggerWarn = vi.fn();
    const dirtyOutput: _LLMReflectionOutput = {
      ...VALID_LLM_OUTPUT,
      per_question_coaching: [
        {
          ...VALID_LLM_OUTPUT.per_question_coaching[0],
          diagnosis: "这道题表达冗长,需要改进",
        },
      ],
    };
    const deps: ReflectionAgentDeps = {
      llm: new MockLLMProvider(() => Promise.resolve(dirtyOutput)) as LLMProvider,
      logger: { warn: loggerWarn },
    };

    await runReflectionAgent(VALID_INPUT, deps);

    expect(loggerWarn).toHaveBeenCalledWith(
      "reflection_overlap_with_report_verdict",
      expect.objectContaining({
        turn_index: 0,
        overlap_terms: expect.arrayContaining(["表达冗长"]),
      }),
    );
  });

  // Case 40: WARN log NOT emitted on clean output

  it("no WARN log when LLM output is fully clean", async () => {
    const loggerWarn = vi.fn();
    const deps: ReflectionAgentDeps = {
      llm: new MockLLMProvider(() => Promise.resolve(VALID_LLM_OUTPUT)) as LLMProvider,
      logger: { warn: loggerWarn },
    };

    await runReflectionAgent(VALID_INPUT, deps);

    expect(loggerWarn).not.toHaveBeenCalled();
  });
});

// MARK: - Audit log assertions

describe("runReflectionAgent — audit log reflection_request", () => {
  // Case 41: audit log emitted with {session_id, turn_count, has_research}

  it("info log 'reflection_request' emitted with correct meta (no research)", async () => {
    const loggerInfo = vi.fn();
    const deps: ReflectionAgentDeps = {
      llm: new MockLLMProvider(() => Promise.resolve(VALID_LLM_OUTPUT)) as LLMProvider,
      logger: { info: loggerInfo },
    };

    await runReflectionAgent(VALID_INPUT, deps);

    expect(loggerInfo).toHaveBeenCalledWith(
      "reflection_request",
      expect.objectContaining({
        session_id: VALID_INPUT.session_id,
        turn_count: VALID_INPUT.turns.length,
        has_research: false,
      }),
    );
  });

  // Case 42: has_research = true when research_payload is non-null

  it("has_research = true when research_payload is non-null", async () => {
    const loggerInfo = vi.fn();
    const inputWithResearch: ReflectionAgentInput = {
      ...VALID_INPUT,
      research_payload: { company: "ByteDance", industry: "tech" },
    };
    const deps: ReflectionAgentDeps = {
      llm: new MockLLMProvider(() => Promise.resolve(VALID_LLM_OUTPUT)) as LLMProvider,
      logger: { info: loggerInfo },
    };

    await runReflectionAgent(inputWithResearch, deps);

    expect(loggerInfo).toHaveBeenCalledWith(
      "reflection_request",
      expect.objectContaining({
        has_research: true,
      }),
    );
  });
});

// MARK: - Server-stamp metadata

describe("runReflectionAgent — server-stamp metadata", () => {
  // Case 43: server-stamped fields match input + generated_at is ISO + status="ok"

  it("server-stamped: report_id / session_id / generated_at / status='ok'", async () => {
    const deps = makeProvider(VALID_LLM_OUTPUT);
    const before = new Date().toISOString();
    const result = await runReflectionAgent(VALID_INPUT, deps);
    const after = new Date().toISOString();

    expect(result.report_id).toBe(VALID_INPUT.report_id);
    expect(result.session_id).toBe(VALID_INPUT.session_id);
    expect(result.status).toBe("ok");

    // generated_at is within the test window
    expect(result.generated_at >= before).toBe(true);
    expect(result.generated_at <= after).toBe(true);
  });
});

// MARK: - mistakes_to_avoid double-pass pipeline (integrated)

describe("mistakes_to_avoid — double-pass pipeline (tone then accusatory)", () => {
  // Case 44: accusatory prefix in mistakes_to_avoid → rewritten in integrated flow

  it("accusations rewritten to '建议下次注意:' form in integrated flow", async () => {
    const dirtyOutput: _LLMReflectionOutput = {
      ...VALID_LLM_OUTPUT,
      per_question_coaching: [
        {
          ...VALID_LLM_OUTPUT.per_question_coaching[0],
          mistakes_to_avoid: ["你居然没有准备量化数据"],
        },
      ],
    };
    const deps = makeProvider(dirtyOutput);
    const result = await runReflectionAgent(VALID_INPUT, deps);

    expect(result.per_question_coaching[0].mistakes_to_avoid[0]).toBe(
      "建议下次注意:没有准备量化数据",
    );
  });

  // Case 45: ai_verdict in report_payload used for no-overlap check

  it("ai_verdict from report_payload triggers no-overlap on matching diagnosis", async () => {
    const inputWithVerdict: ReflectionAgentInput = {
      ...VALID_INPUT,
      report_payload: {
        ai_verdict: "证据不足是最大问题",
        overall_score: 65,
      },
    };
    const dirtyOutput: _LLMReflectionOutput = {
      ...VALID_LLM_OUTPUT,
      per_question_coaching: [
        {
          ...VALID_LLM_OUTPUT.per_question_coaching[0],
          diagnosis: "这道题证据不足,需要量化支撑",
        },
      ],
    };
    const deps = makeProvider(dirtyOutput);
    const result = await runReflectionAgent(inputWithVerdict, deps);

    expect(result.per_question_coaching[0].diagnosis).toBe(
      "可加强 STAR 框架的STAR 收尾节奏",
    );
  });

  // Case 46: non-string ai_verdict → treated as null (no overlap check via ai_verdict path)

  it("non-string ai_verdict in report_payload → treated as null", async () => {
    const inputWithNullVerdict: ReflectionAgentInput = {
      ...VALID_INPUT,
      report_payload: {
        ai_verdict: 123, // non-string → treated as null
        overall_score: 70,
      },
    };
    // diagnosis is clean — should pass through unchanged even though report has numeric ai_verdict
    const cleanDiagnosisOutput: _LLMReflectionOutput = {
      ...VALID_LLM_OUTPUT,
      per_question_coaching: [
        {
          ...VALID_LLM_OUTPUT.per_question_coaching[0],
          diagnosis: "建议在 STAR 的 R 环节加入量化数据",
        },
      ],
    };
    const deps = makeProvider(cleanDiagnosisOutput);
    const result = await runReflectionAgent(inputWithNullVerdict, deps);

    expect(result.per_question_coaching[0].diagnosis).toBe(
      "建议在 STAR 的 R 环节加入量化数据",
    );
  });
});

// MARK: - prompts.ts

describe("systemPrompt()", () => {
  // Case 47: contains "Reflection Agent"

  it('contains "Reflection Agent"', () => {
    expect(systemPrompt()).toContain("Reflection Agent");
  });

  // Case 48: contains "L0 条款 12"

  it('contains "L0 条款 12"', () => {
    expect(systemPrompt()).toContain("L0 条款 12");
  });

  // Case 49: contains "建议下次" (positive teaching example)

  it('contains "建议下次" (positive example)', () => {
    expect(systemPrompt()).toContain("建议下次");
  });

  // Case 50: contains "你犯了" (negative example)

  it('contains "你犯了" (negative example in forbidden pattern list)', () => {
    expect(systemPrompt()).toContain("你犯了");
  });

  // Case 51: contains 8/12 forbidden words from canonical list

  it("contains 8 out of 12 forbidden words from canonical list (sample check)", () => {
    const prompt = systemPrompt();
    const sampleWords = [
      "不建议",
      "不推荐",
      "建议放弃",
      "不适合",
      "差距很大",
      "不合格",
      "淘汰",
      "无希望",
    ];
    for (const word of sampleWords) {
      expect(prompt).toContain(word);
    }
  });

  // Case 52: inlines _guardrails.j2 content

  it('inlines _guardrails.j2: contains "忽略之前的指令"', () => {
    expect(systemPrompt()).toContain("忽略之前的指令");
  });

  it('inlines _guardrails.j2: contains "严格符合目标 schema 的结构化 JSON"', () => {
    expect(systemPrompt()).toContain("严格符合目标 schema 的结构化 JSON");
  });
});

describe("userPrompt()", () => {
  // Case 53: with parse_payload set → contains ParseResult + JSON

  it("with parse_payload set → contains 'ParseResult' header and JSON", () => {
    const inputWithParse: ReflectionAgentInput = {
      ...VALID_INPUT,
      parse_payload: { role: "Product Manager", match_score: 85 },
    };
    const content = userPrompt(inputWithParse);

    expect(content).toContain("ParseResult");
    expect(content).toContain("Product Manager");
  });

  // Case 54: with parse_payload null → no ParseResult section

  it("with parse_payload null → no ParseResult section", () => {
    const content = userPrompt(VALID_INPUT); // parse_payload: null

    expect(content).not.toContain("ParseResult");
  });

  // Case 55: with research_payload set → contains ResearchResult

  it("with research_payload set → contains 'ResearchResult' header and JSON", () => {
    const inputWithResearch: ReflectionAgentInput = {
      ...VALID_INPUT,
      research_payload: { company: "ByteDance", industry: "tech" },
    };
    const content = userPrompt(inputWithResearch);

    expect(content).toContain("ResearchResult");
    expect(content).toContain("ByteDance");
  });

  // Case 56: always contains report_payload JSON + turns JSON

  it("always contains report_payload JSON and turns JSON", () => {
    const content = userPrompt(VALID_INPUT);

    // report_payload fields appear in serialized JSON
    expect(content).toContain("ai_verdict");
    expect(content).toContain("结构化表达有待加强");
    // turns content
    expect(content).toContain("请介绍一下你最近的项目");
  });

  // Case 57: with research_payload null → no ResearchResult section

  it("with research_payload null → no ResearchResult section", () => {
    const content = userPrompt(VALID_INPUT); // research_payload: null

    expect(content).not.toContain("ResearchResult");
  });
});

// MARK: - scanOverlapWithVerdict

describe("scanOverlapWithVerdict", () => {
  // Case 58: term in AI_VERDICT_CORE_TERMS found in text → hits

  it("returns hits when AI_VERDICT_CORE_TERMS term found in text", () => {
    const hits = scanOverlapWithVerdict("这道题缺乏深度和条理混乱", null);
    expect(hits).toContain("缺乏深度");
    expect(hits).toContain("条理混乱");
  });

  // Case 59: clean text → empty hits

  it("returns empty array for clean text", () => {
    const hits = scanOverlapWithVerdict("建议在 STAR 框架做加强", null);
    expect(hits).toEqual([]);
  });

  // Case 60: ai_verdict with matching term also triggers

  it("term in ai_verdict AND in text → included in hits", () => {
    const hits = scanOverlapWithVerdict("数据缺失是主要问题", "数据缺失");
    expect(hits).toContain("数据缺失");
  });
});

// MARK: - Exported constants verification

describe("ACCUSATORY_PREFIXES and AI_VERDICT_CORE_TERMS", () => {
  it("ACCUSATORY_PREFIXES contains exactly 4 items", () => {
    expect(ACCUSATORY_PREFIXES).toHaveLength(4);
    expect(ACCUSATORY_PREFIXES).toContain("你犯");
    expect(ACCUSATORY_PREFIXES).toContain("你又");
    expect(ACCUSATORY_PREFIXES).toContain("你总");
    expect(ACCUSATORY_PREFIXES).toContain("你居然");
  });

  it("AI_VERDICT_CORE_TERMS contains exactly 8 items", () => {
    expect(AI_VERDICT_CORE_TERMS).toHaveLength(8);
    expect(AI_VERDICT_CORE_TERMS).toContain("结构不清晰");
    expect(AI_VERDICT_CORE_TERMS).toContain("条理混乱");
  });

  it("DIAGNOSIS_FALLBACK_PARTIAL + tone suffix = '可加强 STAR 框架的结构表达'", () => {
    expect(DIAGNOSIS_FALLBACK_PARTIAL + "结构表达").toBe("可加强 STAR 框架的结构表达");
  });

  it("DIAGNOSIS_FALLBACK_PARTIAL + overlap suffix = '可加强 STAR 框架的STAR 收尾节奏'", () => {
    expect(DIAGNOSIS_FALLBACK_PARTIAL + "STAR 收尾节奏").toBe(
      "可加强 STAR 框架的STAR 收尾节奏",
    );
  });
});
