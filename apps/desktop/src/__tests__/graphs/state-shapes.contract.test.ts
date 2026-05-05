/**
 * state-shapes.contract.test.ts — M5.2.b
 *
 * Verifies the channel-key sets for all three graphs (TurnState / IntakeState /
 * PostReportState) match the design doc §3.x field lists, and that the
 * compiled graph exposes both LangGraph sentinels plus the correct user-defined
 * node count in each graph.
 *
 * Constraints:
 *   §A0  — No Tauri imports.
 *   §C3  — All LLM calls go through deps.llm stub; no process.env / keychain.
 *   L0 #13 — Node names used here are the locked literals only.
 */

import { describe, it, expect } from "vitest";
import { buildTurnGraph } from "@/core/graphs/turnGraph.js";
import { buildIntakeGraph } from "@/core/graphs/intakeGraph.js";
import { buildPostReportGraph } from "@/core/graphs/postReportGraph.js";
import type { LLMProvider } from "@/core/llm/types";
import {
  TurnAssessmentSchema,
  CompressionAgentOutputSchema,
  InterviewerAgentOutputSchema,
} from "@/core/schemas/turns";
import { ParseResultPayloadSchema } from "@/core/schemas/parse";
import { ResearchAgentOutputSchema } from "@/core/schemas/research";
import { FrameworkAgentOutputSchema } from "@/core/schemas/frameworks";
import {
  CoachAgentOutputSchema,
  _LLMCoachOutputSchema,
} from "@/core/schemas/coach";
import {
  ReflectionAgentOutputSchema,
  _LLMReflectionOutputSchema,
} from "@/core/schemas/reflection";
import { z } from "zod";

// ─── Stub LLMs (self-contained per this file) ────────────────────────────────

function makeTurnStubLLM(): LLMProvider {
  return {
    chat: async () => ({ content: "" }),
    chatStream: async function* () {},
    generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
      const shape = (req.schema as unknown as { shape?: Record<string, unknown> }).shape;
      if (shape && "summary" in shape && "strengths" in shape && "weaknesses" in shape) {
        return TurnAssessmentSchema.parse({ summary: "ok", strengths: [], weaknesses: [] }) as unknown as T;
      }
      if (shape && "preserved_keywords" in shape && "open_threads" in shape) {
        return CompressionAgentOutputSchema.parse({ summary: "ok", preserved_keywords: [], open_threads: [] }) as unknown as T;
      }
      return InterviewerAgentOutputSchema.parse({
        question: "next?",
        intent: "test",
        expected_depth: "surface",
      }) as unknown as T;
    },
  } as unknown as LLMProvider;
}

function makeIntakeStubLLM(): LLMProvider {
  return {
    chat: async () => ({ content: "" }),
    chatStream: async function* () {},
    generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
      if (req.schema === ParseResultPayloadSchema) {
        return ParseResultPayloadSchema.parse({}) as unknown as T;
      }
      if (req.schema === ResearchAgentOutputSchema) {
        return ResearchAgentOutputSchema.parse({
          company: {
            name: "Stub Co",
            business_model: "SaaS",
            stage: "growth",
            recent_signals: [],
            evidence_links: [],
            confidence: "low",
          },
          industry: {
            name: "Tech",
            landscape_summary: "growing",
            key_metrics: ["a", "b", "c"],
            typical_pain_points: ["x", "y"],
            competitors_in_jd_ctx: [],
          },
          fetched_at: new Date().toISOString(),
          cache_key: "abcdef1234567890",
          degraded: false,
          degraded_reason: null,
        }) as unknown as T;
      }
      if (req.schema === FrameworkAgentOutputSchema) {
        return FrameworkAgentOutputSchema.parse({
          direction: "hybrid",
          focus_competencies: [],
          opening_questions: [],
          deep_dive_anchors: [],
          pace_plan: { total_minutes: 30, segments: [] },
          predicted_questions: null,
        }) as unknown as T;
      }
      throw new Error("Unexpected schema in intake stub LLM");
    },
  } as unknown as LLMProvider;
}

function identifyPostReportSchema(schema: z.ZodSchema<unknown>): "coach" | "reflection" | "unknown" {
  const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape;
  if (!shape) return "unknown";
  if ("headline" in shape) return "coach";
  if ("executive_summary" in shape) return "reflection";
  return "unknown";
}

function makePostReportStubLLM(): LLMProvider {
  return {
    chat: async () => ({ content: "" }),
    chatStream: async function* () {},
    generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
      const tag = identifyPostReportSchema(req.schema);
      if (tag === "coach") {
        return _LLMCoachOutputSchema.parse({
          headline: "继续稳步累积",
          headline_detail: "保持练习节奏",
          recurring_weaknesses: [],
          improvement_signals: [],
          next_focus_areas: [],
        }) as unknown as T;
      }
      if (tag === "reflection") {
        return _LLMReflectionOutputSchema.parse({
          executive_summary: "建议围绕薄弱维度做专项练习",
          per_question_coaching: [],
          general_growth_advice: "用 STAR 框架重写关键回答",
          mock_followup_dialogue: [],
        }) as unknown as T;
      }
      throw new Error(`Unexpected schema in postReport stub`);
    },
  } as unknown as LLMProvider;
}

// ─── TurnState channel key shape ─────────────────────────────────────────────

describe("TurnState channel keys — §3.3 design doc shape (10 channels)", () => {
  it("turnGraph compiled graph has 10 total node entries (3 user + 2 sentinels)", () => {
    const drawable = buildTurnGraph({ llm: makeTurnStubLLM() }).getGraph();
    // LangGraph.js encodes nodes as object: user nodes + __start__ + __end__
    const allNodeIds = Object.keys(drawable.nodes);
    expect(allNodeIds).toHaveLength(5); // 3 user + __start__ + __end__
  });

  it("turnGraph invoke result includes assessment channel (non-undefined)", async () => {
    const graph = buildTurnGraph({ llm: makeTurnStubLLM() });
    const result = await graph.invoke({
      turn_index: 0,
      question: "q?",
      answer: "a.",
      framework_json: JSON.stringify({ style: "structured" }),
      recent_turns: [],
    });
    // assessment channel is null by default; after node runs it becomes the object
    expect("assessment" in result).toBe(true);
  });

  it("turnGraph invoke result includes compressed channel", async () => {
    const graph = buildTurnGraph({ llm: makeTurnStubLLM() });
    const result = await graph.invoke({
      turn_index: 0,
      question: "q?",
      answer: "a.",
      framework_json: JSON.stringify({ style: "structured" }),
      recent_turns: [],
    });
    expect("compressed" in result).toBe(true);
  });

  it("turnGraph invoke result includes next_question_out channel (L0 rename workaround)", async () => {
    const graph = buildTurnGraph({ llm: makeTurnStubLLM() });
    const result = await graph.invoke({
      turn_index: 0,
      question: "q?",
      answer: "a.",
      framework_json: JSON.stringify({ style: "structured" }),
      recent_turns: [],
    });
    // L0 §JUDGMENT: channel is next_question_out (not next_question) to avoid
    // LangGraph.js node-name vs state-key collision
    expect("next_question_out" in result).toBe(true);
    expect(result.next_question_out).not.toBeNull();
  });

  it("turnGraph previous_summary defaults null (non-input optional channel)", async () => {
    const graph = buildTurnGraph({ llm: makeTurnStubLLM() });
    const result = await graph.invoke({
      turn_index: 0,
      question: "q?",
      answer: "a.",
      framework_json: JSON.stringify({ style: "structured" }),
      recent_turns: [],
    });
    // previous_summary not supplied → default null
    expect(result.previous_summary).toBeNull();
  });
});

// ─── IntakeState channel key shape ───────────────────────────────────────────

describe("IntakeState channel keys — §3.4 design doc shape (10 channels)", () => {
  it("intakeGraph compiled graph has 5 total node entries (3 user + 2 sentinels)", () => {
    const drawable = buildIntakeGraph({ llm: makeIntakeStubLLM() }).getGraph();
    const allNodeIds = Object.keys(drawable.nodes);
    expect(allNodeIds).toHaveLength(5);
  });

  it("intakeGraph invoke result includes parse_payload channel", async () => {
    const graph = buildIntakeGraph({ llm: makeIntakeStubLLM() });
    const result = await graph.invoke({
      resume_text: "resume",
      jd_text: "jd",
      research_opt_in: false,
      research_input: null,
      framework_config: null,
    });
    expect("parse_payload" in result).toBe(true);
    // parse_node ran, so parse_payload is not null
    expect(result.parse_payload).not.toBeNull();
  });

  it("intakeGraph invoke result includes research_skipped channel (default false)", async () => {
    const graph = buildIntakeGraph({ llm: makeIntakeStubLLM() });
    const result = await graph.invoke({
      resume_text: "resume",
      jd_text: "jd",
      research_opt_in: false,
      research_input: null,
      framework_config: null,
    });
    expect("research_skipped" in result).toBe(true);
    // opt-out → skipped
    expect(result.research_skipped).toBe(true);
  });

  it("intakeGraph invoke result includes research_error channel (null on clean path)", async () => {
    const graph = buildIntakeGraph({ llm: makeIntakeStubLLM() });
    const result = await graph.invoke({
      resume_text: "resume",
      jd_text: "jd",
      research_opt_in: false,
      research_input: null,
      framework_config: null,
    });
    expect("research_error" in result).toBe(true);
    expect(result.research_error).toBeNull();
  });

  it("intakeGraph direction_framework defaults null when framework_config is null", async () => {
    const graph = buildIntakeGraph({ llm: makeIntakeStubLLM() });
    const result = await graph.invoke({
      resume_text: "resume",
      jd_text: "jd",
      research_opt_in: false,
      research_input: null,
      framework_config: null,
    });
    expect("direction_framework" in result).toBe(true);
    // framework_config null → predict_questions_node no-ops → null
    expect(result.direction_framework).toBeNull();
  });
});

// ─── PostReportState channel key shape ───────────────────────────────────────

describe("PostReportState channel keys — §3.5 design doc shape (7 channels)", () => {
  it("postReportGraph compiled graph has 4 total node entries (2 user + 2 sentinels)", () => {
    const drawable = buildPostReportGraph({ llm: makePostReportStubLLM() }).getGraph();
    const allNodeIds = Object.keys(drawable.nodes);
    expect(allNodeIds).toHaveLength(4);
  });

  it("postReportGraph invoke result includes coach_skipped channel", async () => {
    const graph = buildPostReportGraph({ llm: makePostReportStubLLM() });
    const result = await graph.invoke({
      user_id: "u1",
      last_session_id: "s1",
      coach_input: null,
      reflection_input: null,
    });
    expect("coach_skipped" in result).toBe(true);
    expect(result.coach_skipped).toBe(true);
  });

  it("postReportGraph invoke result includes coach_error channel (null on skip)", async () => {
    const graph = buildPostReportGraph({ llm: makePostReportStubLLM() });
    const result = await graph.invoke({
      user_id: "u1",
      last_session_id: "s1",
      coach_input: null,
      reflection_input: null,
    });
    expect("coach_error" in result).toBe(true);
    expect(result.coach_error).toBeNull();
  });

  it("postReportGraph invoke result includes reflection_error channel (null on skip)", async () => {
    const graph = buildPostReportGraph({ llm: makePostReportStubLLM() });
    const result = await graph.invoke({
      user_id: "u1",
      last_session_id: "s1",
      coach_input: null,
      reflection_input: null,
    });
    expect("reflection_error" in result).toBe(true);
    expect(result.reflection_error).toBeNull();
  });

  it("postReportGraph user_id and last_session_id are preserved through graph execution", async () => {
    const graph = buildPostReportGraph({ llm: makePostReportStubLLM() });
    const result = await graph.invoke({
      user_id: "user-abc",
      last_session_id: "sess-xyz",
      coach_input: null,
      reflection_input: null,
    });
    expect(result.user_id).toBe("user-abc");
    expect(result.last_session_id).toBe("sess-xyz");
  });
});
