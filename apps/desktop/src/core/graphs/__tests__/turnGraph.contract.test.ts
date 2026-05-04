import { describe, it, expect } from "vitest";
import { TURN_GRAPH_NODES, buildTurnGraph, totalQuestionBudget } from "../turnGraph.js";
import type { LLMProvider } from "@/core/llm/types";
import {
  TurnAssessmentSchema,
  CompressionAgentOutputSchema,
  InterviewerAgentOutputSchema,
} from "@/core/schemas/turns";
import { z } from "zod";

// ─── Minimal stub LLM for graph construction ─────────────────────────────────

function makeStubLLM(): LLMProvider {
  return {
    chat: async () => ({ content: "" }),
    chatStream: async function* () {},
    generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
      // Return a shape-appropriate stub based on schema
      const shape = (req.schema as unknown as { shape?: Record<string, unknown> }).shape;
      if (shape && "summary" in shape && "strengths" in shape && "weaknesses" in shape) {
        // TurnAssessmentSchema
        return TurnAssessmentSchema.parse({ summary: "ok", strengths: [], weaknesses: [] }) as unknown as T;
      }
      if (shape && "preserved_keywords" in shape && "open_threads" in shape) {
        // CompressionAgentOutputSchema
        return CompressionAgentOutputSchema.parse({ summary: "ok", preserved_keywords: [], open_threads: [] }) as unknown as T;
      }
      // InterviewerAgentOutputSchema
      return InterviewerAgentOutputSchema.parse({
        question: "next?",
        intent: "test",
        expected_depth: "surface",
      }) as unknown as T;
    },
  } as unknown as LLMProvider;
}

const deps = { llm: makeStubLLM() };

// ─── §8.2 Contract assertions ─────────────────────────────────────────────────

describe("TURN_GRAPH_NODES — L0 #13 node-name lock", () => {
  it("contains exactly the 3 required node names", () => {
    expect(TURN_GRAPH_NODES.has("turn_assessment")).toBe(true);
    expect(TURN_GRAPH_NODES.has("compression")).toBe(true);
    expect(TURN_GRAPH_NODES.has("next_question")).toBe(true);
  });

  it("has size 3 — no 4th node allowed", () => {
    expect(TURN_GRAPH_NODES.size).toBe(3);
  });

  it("is frozen — Object.isFrozen returns true", () => {
    // Object.freeze on a Set makes the object non-extensible (own properties frozen),
    // but JS Set's internal [[SetData]] slot cannot be frozen via Object.freeze.
    // The contract intent is: the exported constant reference is immutable (frozen),
    // not that Set.prototype.add would throw. Verify with Object.isFrozen.
    expect(Object.isFrozen(TURN_GRAPH_NODES)).toBe(true);
  });

  it("set equality — contains exactly {turn_assessment, compression, next_question}", () => {
    const expected = new Set(["turn_assessment", "compression", "next_question"]);
    expect(TURN_GRAPH_NODES.size).toBe(expected.size);
    for (const name of expected) {
      expect(TURN_GRAPH_NODES.has(name as "turn_assessment" | "compression" | "next_question")).toBe(true);
    }
    for (const name of TURN_GRAPH_NODES) {
      expect(expected.has(name)).toBe(true);
    }
  });
});

describe("buildTurnGraph — compiled graph node/edge topology", () => {
  it("compiled graph node IDs (filtered) equal TURN_GRAPH_NODES", () => {
    const graph = buildTurnGraph(deps);
    const drawable = graph.getGraph();
    // Filter out __start__ and __end__ sentinels
    const nodeIds = Object.keys(drawable.nodes).filter(
      (id) => id !== "__start__" && id !== "__end__",
    );
    const nodeIdSet = new Set(nodeIds);
    expect(nodeIdSet.size).toBe(3);
    for (const name of TURN_GRAPH_NODES) {
      expect(nodeIdSet.has(name)).toBe(true);
    }
  });

  it("rogue node guard — graph has exactly 3 user-defined nodes", () => {
    const graph = buildTurnGraph(deps);
    const drawable = graph.getGraph();
    const userNodes = Object.keys(drawable.nodes).filter(
      (id) => id !== "__start__" && id !== "__end__",
    );
    expect(userNodes).toHaveLength(3);
  });

  it("5-edge fan-out/fan-in topology", () => {
    const graph = buildTurnGraph(deps);
    const drawable = graph.getGraph();
    const edges = drawable.edges;

    expect(edges).toHaveLength(5);

    // Fan-out from START
    const startEdges = edges.filter((e) => e.source === "__start__");
    expect(startEdges.map((e) => e.target).sort()).toEqual(
      ["compression", "turn_assessment"].sort(),
    );

    // Fan-in to next_question
    const fanInEdges = edges.filter((e) => e.target === "next_question");
    expect(fanInEdges.map((e) => e.source).sort()).toEqual(
      ["compression", "turn_assessment"].sort(),
    );

    // next_question → END
    const endEdges = edges.filter((e) => e.source === "next_question");
    expect(endEdges).toHaveLength(1);
    expect(endEdges[0].target).toBe("__end__");
  });
});

// ─── totalQuestionBudget unit tests ───────────────────────────────────────────

describe("totalQuestionBudget", () => {
  it("legacy stages happy path: sums question_budget across all stages", () => {
    const fw = JSON.stringify({ stages: [{ question_budget: 3 }, { question_budget: 4 }] });
    expect(totalQuestionBudget(fw)).toBe(7);
  });

  it("pace_plan happy path: converts rough_minutes via max(1, floor(n/3))", () => {
    // rough_minutes 3→1, 10→3, 2→1 → total 5
    const fw = JSON.stringify({
      pace_plan: { segments: [{ rough_minutes: 3 }, { rough_minutes: 10 }, { rough_minutes: 2 }] },
    });
    expect(totalQuestionBudget(fw)).toBe(5);
  });

  it("small rough_minutes — Math.max(1, floor(2/3)) = 1", () => {
    const fw = JSON.stringify({ pace_plan: { segments: [{ rough_minutes: 2 }] } });
    expect(totalQuestionBudget(fw)).toBe(1);
  });

  it("invalid JSON → undefined", () => {
    expect(totalQuestionBudget("not-valid-json")).toBeUndefined();
  });

  it("non-object JSON (array) → undefined", () => {
    expect(totalQuestionBudget("[]")).toBeUndefined();
  });

  it("non-object JSON (null) → undefined", () => {
    expect(totalQuestionBudget("null")).toBeUndefined();
  });

  it("empty stages array → falls through to undefined", () => {
    const fw = JSON.stringify({ stages: [] });
    expect(totalQuestionBudget(fw)).toBeUndefined();
  });

  it("empty segments array → falls through to undefined", () => {
    const fw = JSON.stringify({ pace_plan: { segments: [] } });
    expect(totalQuestionBudget(fw)).toBeUndefined();
  });

  it("all non-positive integers in stages → undefined (total stays 0)", () => {
    const fw = JSON.stringify({ stages: [{ question_budget: 0 }, { question_budget: -1 }] });
    expect(totalQuestionBudget(fw)).toBeUndefined();
  });

  it("all non-positive integers in pace_plan → undefined", () => {
    const fw = JSON.stringify({ pace_plan: { segments: [{ rough_minutes: 0 }, { rough_minutes: -3 }] } });
    expect(totalQuestionBudget(fw)).toBeUndefined();
  });

  it("mixed valid + invalid items in stages — sums only valid", () => {
    const fw = JSON.stringify({
      stages: [
        { question_budget: 3 },
        { question_budget: "not-a-number" },
        null,
        { question_budget: -1 },
        { question_budget: 2 },
      ],
    });
    expect(totalQuestionBudget(fw)).toBe(5);
  });

  it("prefers stages shape over pace_plan when stages has valid budget", () => {
    const fw = JSON.stringify({
      stages: [{ question_budget: 5 }],
      pace_plan: { segments: [{ rough_minutes: 10 }] },
    });
    expect(totalQuestionBudget(fw)).toBe(5);
  });

  it("falls through to pace_plan when stages has no valid budget", () => {
    const fw = JSON.stringify({
      stages: [{ question_budget: -1 }],
      pace_plan: { segments: [{ rough_minutes: 9 }] },
    });
    // rough_minutes 9 → floor(9/3)=3, max(1,3)=3
    expect(totalQuestionBudget(fw)).toBe(3);
  });

  it("framework with no stages or pace_plan → undefined", () => {
    expect(totalQuestionBudget(JSON.stringify({ style: "structured" }))).toBeUndefined();
  });

  it("empty string → undefined (invalid JSON)", () => {
    expect(totalQuestionBudget("")).toBeUndefined();
  });
});
