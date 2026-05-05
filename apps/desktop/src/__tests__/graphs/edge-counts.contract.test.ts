/**
 * edge-counts.contract.test.ts — M5.2.b
 *
 * Verifies the precise edge counts for all three graphs:
 *   turnGraph:        5 edges (fan-out START→{turn_assessment, compression}, fan-in →next_question, next_question→END)
 *   intakeGraph:      4 edges (sequential START→parse→research→predict→END)
 *   postReportGraph:  4 edges (parallel fan-out START→{coach_node, reflection_node}→END each)
 *   Total:           13 edges across all three graphs
 *
 * These counts are locked by the §6.2 topology spec for each graph.
 *
 * Constraints:
 *   §A0  — No Tauri imports.
 *   §C3  — Stub LLM only; no process.env / keychain.
 *   L0 #13 — Node names are the locked literals only.
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

// ─── Edge count assertions ────────────────────────────────────────────────────

describe("edge-counts — turnGraph (§6.2)", () => {
  it("turnGraph has exactly 5 edges", () => {
    const drawable = buildTurnGraph({ llm: makeTurnStub() }).getGraph();
    expect(drawable.edges).toHaveLength(5);
  });

  it("turnGraph has exactly 2 fan-out edges from __start__", () => {
    const drawable = buildTurnGraph({ llm: makeTurnStub() }).getGraph();
    const fromStart = drawable.edges.filter((e) => e.source === "__start__");
    expect(fromStart).toHaveLength(2);
  });

  it("turnGraph fan-out targets are turn_assessment and compression (L0 #13 locked)", () => {
    const drawable = buildTurnGraph({ llm: makeTurnStub() }).getGraph();
    const targets = drawable.edges
      .filter((e) => e.source === "__start__")
      .map((e) => e.target)
      .sort();
    expect(targets).toEqual(["compression", "turn_assessment"]);
  });
});

describe("edge-counts — intakeGraph (§6.2)", () => {
  it("intakeGraph has exactly 4 edges", () => {
    const drawable = buildIntakeGraph({ llm: makeIntakeStub() }).getGraph();
    expect(drawable.edges).toHaveLength(4);
  });

  it("intakeGraph has exactly 1 edge from __start__ (sequential, not fan-out)", () => {
    const drawable = buildIntakeGraph({ llm: makeIntakeStub() }).getGraph();
    const fromStart = drawable.edges.filter((e) => e.source === "__start__");
    expect(fromStart).toHaveLength(1);
    expect(fromStart[0].target).toBe("parse_node");
  });

  it("intakeGraph has exactly 1 edge to __end__ (from predict_questions_node)", () => {
    const drawable = buildIntakeGraph({ llm: makeIntakeStub() }).getGraph();
    const toEnd = drawable.edges.filter((e) => e.target === "__end__");
    expect(toEnd).toHaveLength(1);
    expect(toEnd[0].source).toBe("predict_questions_node");
  });
});

describe("edge-counts — postReportGraph (§6.2)", () => {
  it("postReportGraph has exactly 4 edges", () => {
    const drawable = buildPostReportGraph({ llm: makePostReportStub() }).getGraph();
    expect(drawable.edges).toHaveLength(4);
  });

  it("postReportGraph has exactly 2 fan-out edges from __start__", () => {
    const drawable = buildPostReportGraph({ llm: makePostReportStub() }).getGraph();
    const fromStart = drawable.edges.filter((e) => e.source === "__start__");
    expect(fromStart).toHaveLength(2);
  });

  it("postReportGraph fan-out targets are coach_node and reflection_node (L0 #13 locked)", () => {
    const drawable = buildPostReportGraph({ llm: makePostReportStub() }).getGraph();
    const targets = drawable.edges
      .filter((e) => e.source === "__start__")
      .map((e) => e.target)
      .sort();
    expect(targets).toEqual(["coach_node", "reflection_node"]);
  });
});

describe("edge-counts — total across all three graphs", () => {
  it("total edge sum = 13 (5 + 4 + 4)", () => {
    const turnEdges = buildTurnGraph({ llm: makeTurnStub() }).getGraph().edges.length;
    const intakeEdges = buildIntakeGraph({ llm: makeIntakeStub() }).getGraph().edges.length;
    const postReportEdges = buildPostReportGraph({ llm: makePostReportStub() }).getGraph().edges.length;
    expect(turnEdges + intakeEdges + postReportEdges).toBe(13);
  });
});
