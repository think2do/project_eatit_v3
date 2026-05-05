/**
 * sentinel-ids.contract.test.ts — M5.2.b
 *
 * Verifies that LangGraph.js __start__ and __end__ sentinel node IDs are the
 * literal strings used by all three graphs (turnGraph / intakeGraph /
 * postReportGraph). This guards against LangGraph.js version changes that
 * might rename sentinels — which would silently break edge topology assertions.
 *
 * Constraints:
 *   §A0  — No Tauri imports.
 *   §C3  — Stub LLM only; no process.env / keychain.
 *   L0 #13 — Locked node names: turn_assessment / compression / next_question /
 *             parse_node / research_node / predict_questions_node /
 *             coach_node / reflection_node.
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
import { FrameworkAgentOutputSchema } from "@/core/schemas/frameworks";
import { _LLMCoachOutputSchema } from "@/core/schemas/coach";
import { _LLMReflectionOutputSchema } from "@/core/schemas/reflection";
import { z } from "zod";

// ─── Stub LLMs (self-contained per this file) ────────────────────────────────

function makeTurnStub(): LLMProvider {
  return {
    chat: async () => ({ content: "" }),
    chatStream: async function* () {},
    generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
      const shape = (req.schema as unknown as { shape?: Record<string, unknown> }).shape ?? {};
      if ("strengths" in shape) {
        return TurnAssessmentSchema.parse({ summary: "ok", strengths: [], weaknesses: [] }) as unknown as T;
      }
      if ("preserved_keywords" in shape) {
        return CompressionAgentOutputSchema.parse({ summary: "ok", preserved_keywords: [], open_threads: [] }) as unknown as T;
      }
      return InterviewerAgentOutputSchema.parse({ question: "q?", intent: "t", expected_depth: "surface" }) as unknown as T;
    },
  } as unknown as LLMProvider;
}

function makeIntakeStub(): LLMProvider {
  return {
    chat: async () => ({ content: "" }),
    chatStream: async function* () {},
    generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
      if (req.schema === ParseResultPayloadSchema) {
        return ParseResultPayloadSchema.parse({}) as unknown as T;
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
      throw new Error("Unexpected schema");
    },
  } as unknown as LLMProvider;
}

function makePostReportStub(): LLMProvider {
  return {
    chat: async () => ({ content: "" }),
    chatStream: async function* () {},
    generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
      const shape = (req.schema as unknown as { shape?: Record<string, unknown> }).shape ?? {};
      if ("headline" in shape) {
        return _LLMCoachOutputSchema.parse({
          headline: "h",
          headline_detail: "d",
          recurring_weaknesses: [],
          improvement_signals: [],
          next_focus_areas: [],
        }) as unknown as T;
      }
      return _LLMReflectionOutputSchema.parse({
        executive_summary: "s",
        per_question_coaching: [],
        general_growth_advice: "a",
        mock_followup_dialogue: [],
      }) as unknown as T;
    },
  } as unknown as LLMProvider;
}

// ─── Sentinel IDs: __start__ and __end__ ─────────────────────────────────────

const START_SENTINEL = "__start__";
const END_SENTINEL = "__end__";

describe("LangGraph sentinels — turnGraph", () => {
  it("__start__ sentinel is present in compiled turnGraph nodes", () => {
    const drawable = buildTurnGraph({ llm: makeTurnStub() }).getGraph();
    expect(Object.keys(drawable.nodes)).toContain(START_SENTINEL);
  });

  it("__end__ sentinel is present in compiled turnGraph nodes", () => {
    const drawable = buildTurnGraph({ llm: makeTurnStub() }).getGraph();
    expect(Object.keys(drawable.nodes)).toContain(END_SENTINEL);
  });
});

describe("LangGraph sentinels — intakeGraph", () => {
  it("__start__ sentinel is present in compiled intakeGraph nodes", () => {
    const drawable = buildIntakeGraph({ llm: makeIntakeStub() }).getGraph();
    expect(Object.keys(drawable.nodes)).toContain(START_SENTINEL);
  });

  it("__end__ sentinel is present in compiled intakeGraph nodes", () => {
    const drawable = buildIntakeGraph({ llm: makeIntakeStub() }).getGraph();
    expect(Object.keys(drawable.nodes)).toContain(END_SENTINEL);
  });
});

describe("LangGraph sentinels — postReportGraph", () => {
  it("__start__ sentinel is present in compiled postReportGraph nodes", () => {
    const drawable = buildPostReportGraph({ llm: makePostReportStub() }).getGraph();
    expect(Object.keys(drawable.nodes)).toContain(START_SENTINEL);
  });

  it("__end__ sentinel is present in compiled postReportGraph nodes", () => {
    const drawable = buildPostReportGraph({ llm: makePostReportStub() }).getGraph();
    expect(Object.keys(drawable.nodes)).toContain(END_SENTINEL);
  });
});
