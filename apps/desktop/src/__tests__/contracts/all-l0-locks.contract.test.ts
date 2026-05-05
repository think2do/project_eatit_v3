/**
 * all-l0-locks.contract.test.ts — M5.2.d consolidation sweep
 *
 * Single-file tripwire asserting EVERY L0 lock in one place.
 * A future schema drift in any locked constant will fail here
 * before it can propagate silently.
 *
 * L0 locks covered:
 *   #1  5 dimensions       (DimensionNameSchema)
 *   #2  3 pass_likelihood  (PassLikelihoodSchema)
 *   #3  12 forbidden words (FORBIDDEN_TONE_WORDS)
 *   #6  4 personas         (PERSONA_MAP)
 *   #7  7 fillerWords      (FILLER_WORDS_CN)
 *   #11 7 BridgeEvent types (BridgeEventSchema)
 *   #13 node names         (TURN/INTAKE/POST_REPORT _GRAPH_NODES)
 *   #14 predicted_questions 8-15 (PredictedQuestionBankSchema)
 *   §A11 PII strict()       (8 agent input schemas reject unknown fields)
 *
 * §A0: no Tauri import.
 * §C3: no secret material, no keychain.read, no process.env reads.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";

// Schema imports
import {
  DimensionNameSchema,
  PassLikelihoodSchema,
  FORBIDDEN_TONE_WORDS,
} from "@/core/schemas/reports";
import { PredictedQuestionBankSchema } from "@/core/schemas/frameworks";
import { FILLER_WORDS_CN } from "@/lib/fillerWords";
import { PERSONA_MAP } from "@/core/agents/interviewer/personas";
import { BridgeEventSchema } from "@/services/nativeBridge";
import { TURN_GRAPH_NODES } from "@/core/graphs/turnGraph";
import { INTAKE_GRAPH_NODES } from "@/core/graphs/intakeGraph";
import { POST_REPORT_GRAPH_NODES } from "@/core/graphs/postReportGraph";

// §A11 agent input schemas
import { ResearchAgentInputSchema } from "@/core/schemas/research";
import { CoachAgentInputSchema } from "@/core/schemas/coach";
import { ReflectionAgentInputSchema } from "@/core/schemas/reflection";
import { ParseAgentInputSchema } from "@/core/schemas/parse";
import {
  ObserverAgentInputSchema,
  CompressionAgentInputSchema,
  InterviewerAgentInputSchema,
} from "@/core/schemas/turns";
import { ReportAgentInputSchema } from "@/core/schemas/reports";

// ─── L0 #1: 5 Dimensions ──────────────────────────────────────────────────────

describe("L0 #1 — DimensionNameSchema: exactly 5 dimensions (完全不可变)", () => {
  const LOCKED_DIMENSIONS = [
    "专业深度",
    "结构化表达",
    "批判性思考",
    "业务直觉",
    "沟通节奏",
  ] as const;

  it("enum has exactly 5 values", () => {
    expect(DimensionNameSchema.options).toHaveLength(5);
  });

  it("enum values equal the locked 5-item array (order + content)", () => {
    expect(DimensionNameSchema.options).toEqual([...LOCKED_DIMENSIONS]);
  });

  it.each(LOCKED_DIMENSIONS)("accepts '%s'", (dim) => {
    expect(DimensionNameSchema.parse(dim)).toBe(dim);
  });

  it("rejects any value not in the 5-item set", () => {
    expect(() => DimensionNameSchema.parse("沟通技巧")).toThrow(z.ZodError);
    expect(() => DimensionNameSchema.parse("Professional Depth")).toThrow(z.ZodError);
    expect(() => DimensionNameSchema.parse("")).toThrow(z.ZodError);
  });
});

// ─── L0 #2: 3 Pass Likelihood Tiers ──────────────────────────────────────────

describe("L0 #2 — PassLikelihoodSchema: exactly 3 tiers (中上/中/中下)", () => {
  const LOCKED_TIERS = ["中上", "中", "中下"] as const;

  it("enum has exactly 3 values", () => {
    expect(PassLikelihoodSchema.options).toHaveLength(3);
  });

  it("enum values equal the locked 3-item array (order + content)", () => {
    expect(PassLikelihoodSchema.options).toEqual([...LOCKED_TIERS]);
  });

  it.each(LOCKED_TIERS)("accepts '%s'", (tier) => {
    expect(PassLikelihoodSchema.parse(tier)).toBe(tier);
  });

  it("rejects English tiers not in enum", () => {
    expect(() => PassLikelihoodSchema.parse("high")).toThrow(z.ZodError);
    expect(() => PassLikelihoodSchema.parse("low")).toThrow(z.ZodError);
    expect(() => PassLikelihoodSchema.parse("中等")).toThrow(z.ZodError);
  });
});

// ─── L0 #3: 12 Forbidden Tone Words ──────────────────────────────────────────

describe("L0 #3 — FORBIDDEN_TONE_WORDS: exactly 12 words (教学语气护栏)", () => {
  const LOCKED_FORBIDDEN = [
    "不建议",
    "不推荐",
    "建议放弃",
    "不适合",
    "差距很大",
    "不合格",
    "淘汰",
    "无希望",
    "拒绝你",
    "失败者",
    "你不行",
    "太差",
  ] as const;

  it("array has exactly 12 entries", () => {
    expect(FORBIDDEN_TONE_WORDS.length).toBe(12);
  });

  it("array values equal the locked 12-item array (order + content)", () => {
    expect([...FORBIDDEN_TONE_WORDS]).toEqual([...LOCKED_FORBIDDEN]);
  });

  it.each(LOCKED_FORBIDDEN)("contains '%s'", (word) => {
    expect((FORBIDDEN_TONE_WORDS as readonly string[]).includes(word)).toBe(true);
  });
});

// ─── L0 #6: 4 Personas ───────────────────────────────────────────────────────

describe("L0 #6 — PERSONA_MAP: 4 personas with locked keys and names", () => {
  it("has exactly 4 keys", () => {
    expect(Object.keys(PERSONA_MAP)).toHaveLength(4);
  });

  it("keys equal {'structured','pressure','friendly','expert'}", () => {
    expect(new Set(Object.keys(PERSONA_MAP))).toEqual(
      new Set(["structured", "pressure", "friendly", "expert"]),
    );
  });

  it("names equal {'Sarah','Marcus','Lin','Daniel'}", () => {
    const names = Object.values(PERSONA_MAP).map((p) => p.name);
    expect(new Set(names)).toEqual(new Set(["Sarah", "Marcus", "Lin", "Daniel"]));
  });

  it("structured → Sarah", () => {
    expect(PERSONA_MAP.structured.name).toBe("Sarah");
  });

  it("pressure → Marcus", () => {
    expect(PERSONA_MAP.pressure.name).toBe("Marcus");
  });

  it("friendly → Lin", () => {
    expect(PERSONA_MAP.friendly.name).toBe("Lin");
  });

  it("expert → Daniel", () => {
    expect(PERSONA_MAP.expert.name).toBe("Daniel");
  });
});

// ─── L0 #7: 7 Filler Words ───────────────────────────────────────────────────

describe("L0 #7 — FILLER_WORDS_CN: exactly 7 words in locked order", () => {
  const LOCKED_FILLER = ["嗯", "呃", "那个", "就是", "这个", "反正", "然后然后"] as const;

  it("array has exactly 7 entries", () => {
    expect(FILLER_WORDS_CN.length).toBe(7);
  });

  it("array values equal the locked 7-item array (order + content)", () => {
    expect([...FILLER_WORDS_CN]).toEqual([...LOCKED_FILLER]);
  });

  it.each(LOCKED_FILLER)("contains '%s'", (word) => {
    expect((FILLER_WORDS_CN as readonly string[]).includes(word)).toBe(true);
  });

  it("has no duplicates", () => {
    expect(new Set(FILLER_WORDS_CN).size).toBe(FILLER_WORDS_CN.length);
  });
});

// ─── L0 #11 / BridgeEvent: 7 event types ────────────────────────────────────

describe("L0 #11 — BridgeEventSchema: exactly 7 event types (locked)", () => {
  const LOCKED_EVENTS = [
    "stream-chunk",
    "stream-end",
    "stream-error",
    "asr-partial",
    "asr-final",
    "asr-end",
    "file-dropped",
  ] as const;

  it("enum values equal the locked 7-event array (order + content)", () => {
    expect(BridgeEventSchema.shape.type.options).toEqual([...LOCKED_EVENTS]);
  });

  it("enum has exactly 7 variants", () => {
    expect(BridgeEventSchema.shape.type.options).toHaveLength(7);
  });

  it.each(LOCKED_EVENTS)("accepts type='%s'", (type) => {
    const parsed = BridgeEventSchema.parse({ type, streamId: "s1", payload: {} });
    expect(parsed.type).toBe(type);
  });

  it("rejects unknown type 'db-changed'", () => {
    expect(() =>
      BridgeEventSchema.parse({ type: "db-changed", streamId: "s1", payload: {} }),
    ).toThrow(z.ZodError);
  });
});

// ─── L0 #13: Graph Node Names ────────────────────────────────────────────────

describe("L0 #13 — TURN_GRAPH_NODES: 3 nodes locked", () => {
  const LOCKED_TURN_NODES = new Set([
    "turn_assessment",
    "compression",
    "next_question",
  ]);

  it("TURN_GRAPH_NODES has exactly 3 entries", () => {
    expect(TURN_GRAPH_NODES.size).toBe(3);
  });

  it("TURN_GRAPH_NODES set equals locked triple", () => {
    expect(TURN_GRAPH_NODES).toEqual(LOCKED_TURN_NODES);
  });

  it("is frozen (Object.isFrozen)", () => {
    expect(Object.isFrozen(TURN_GRAPH_NODES)).toBe(true);
  });
});

describe("L0 #13 — INTAKE_GRAPH_NODES: 3 nodes locked", () => {
  const LOCKED_INTAKE_NODES = new Set([
    "parse_node",
    "research_node",
    "predict_questions_node",
  ]);

  it("INTAKE_GRAPH_NODES has exactly 3 entries", () => {
    expect(INTAKE_GRAPH_NODES.size).toBe(3);
  });

  it("INTAKE_GRAPH_NODES set equals locked triple", () => {
    expect(INTAKE_GRAPH_NODES).toEqual(LOCKED_INTAKE_NODES);
  });

  it("is frozen (Object.isFrozen)", () => {
    expect(Object.isFrozen(INTAKE_GRAPH_NODES)).toBe(true);
  });
});

describe("L0 #13 — POST_REPORT_GRAPH_NODES: 2 nodes locked", () => {
  const LOCKED_POST_NODES = new Set(["coach_node", "reflection_node"]);

  it("POST_REPORT_GRAPH_NODES has exactly 2 entries", () => {
    expect(POST_REPORT_GRAPH_NODES.size).toBe(2);
  });

  it("POST_REPORT_GRAPH_NODES set equals locked pair", () => {
    expect(POST_REPORT_GRAPH_NODES).toEqual(LOCKED_POST_NODES);
  });

  it("is frozen (Object.isFrozen)", () => {
    expect(Object.isFrozen(POST_REPORT_GRAPH_NODES)).toBe(true);
  });
});

// ─── L0 #14: PredictedQuestionBank 8-15 boundary ─────────────────────────────

describe("L0 #14 — PredictedQuestionBankSchema: questions min=8 max=15", () => {
  const makeQuestion = (i: number) => ({
    category: "general-pm" as const,
    question: `question ${i}`.padEnd(5, "x"),
    why_likely: `why ${i}`.padEnd(5, "x"),
    related_evidence: `ev ${i}`.padEnd(5, "x"),
  });

  const makeBank = (count: number) => ({
    questions: Array.from({ length: count }, (_, i) => makeQuestion(i)),
    generated_at: "2024-01-15T10:30:00.000Z",
    sources: ["jd" as const],
  });

  it("accepts exactly 8 questions (min boundary)", () => {
    const result = PredictedQuestionBankSchema.parse(makeBank(8));
    expect(result.questions).toHaveLength(8);
  });

  it("accepts exactly 15 questions (max boundary)", () => {
    const result = PredictedQuestionBankSchema.parse(makeBank(15));
    expect(result.questions).toHaveLength(15);
  });

  it("rejects 7 questions (below min 8)", () => {
    expect(() => PredictedQuestionBankSchema.parse(makeBank(7))).toThrow(z.ZodError);
  });

  it("rejects 16 questions (above max 15)", () => {
    expect(() => PredictedQuestionBankSchema.parse(makeBank(16))).toThrow(z.ZodError);
  });
});

// ─── §A11: PII strict() — 8 agent input schemas reject unknown fields ─────────

describe("§A11 PII strict() — agent input schemas reject extra/PII fields", () => {
  it("ResearchAgentInputSchema rejects extra PII field (candidate_email)", () => {
    expect(() =>
      ResearchAgentInputSchema.parse({
        company_name: "Acme",
        role_title: "PM",
        industry_hints: ["tech"],
        candidate_email: "test@example.com",
      }),
    ).toThrow(z.ZodError);
  });

  it("CoachAgentInputSchema rejects extra PII field (resume_text)", () => {
    expect(() =>
      CoachAgentInputSchema.parse({
        user_id: "u1",
        based_on_session_count: 3,
        based_on_last_session_id: "s1",
        recent_reports: [{}, {}, {}],
        resume_text: "my resume",
      }),
    ).toThrow(z.ZodError);
  });

  it("ReflectionAgentInputSchema rejects extra PII field (candidate_phone)", () => {
    expect(() =>
      ReflectionAgentInputSchema.parse({
        session_id: "s1",
        report_id: "r1",
        report_payload: {},
        candidate_phone: "13800138000",
      }),
    ).toThrow(z.ZodError);
  });

  it("ParseAgentInputSchema rejects extra PII field (candidate_email)", () => {
    expect(() =>
      ParseAgentInputSchema.parse({
        resume_text: "resume content",
        jd_text: "jd content",
        candidate_email: "pii@example.com",
      }),
    ).toThrow(z.ZodError);
  });

  it("ObserverAgentInputSchema rejects extra PII field (身份证号)", () => {
    expect(() =>
      ObserverAgentInputSchema.parse({
        turn_index: 0,
        question: "q",
        answer: "a",
        身份证号: "110101199001011234",
      }),
    ).toThrow(z.ZodError);
  });

  it("CompressionAgentInputSchema rejects extra PII field (address)", () => {
    expect(() =>
      CompressionAgentInputSchema.parse({
        previous_summary: null,
        turns: [],
        address: "123 Main St",
      }),
    ).toThrow(z.ZodError);
  });

  it("InterviewerAgentInputSchema rejects extra PII field (resume_text)", () => {
    expect(() =>
      InterviewerAgentInputSchema.parse({
        framework_json: "{}",
        recent_turns: [],
        resume_text: "my resume",
      }),
    ).toThrow(z.ZodError);
  });

  it("ReportAgentInputSchema rejects extra PII field (candidate_email)", () => {
    expect(() =>
      ReportAgentInputSchema.parse({
        parse_payload_json: "{}",
        framework_json: "{}",
        turns: [],
        candidate_email: "pii@example.com",
      }),
    ).toThrow(z.ZodError);
  });
});
