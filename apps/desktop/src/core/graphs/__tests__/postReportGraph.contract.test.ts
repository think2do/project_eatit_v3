/**
 * postReportGraph.contract.test.ts — L0 #13 node-name lock contract tests.
 *
 * File location: core/graphs/__tests__/ — overrides spec's src/__tests__/ to
 * match the existing layout of turnGraph.contract.test.ts and
 * intakeGraph.contract.test.ts (M3.3.1 / M3.3.2 pattern).
 *
 * Covers:
 *   - POST_REPORT_GRAPH_NODES set equality + size 2 + Object.isFrozen (L0 #13)
 *   - Compiled graph nodes (filtered) === locked set
 *   - Edge topology: 4 edges parallel fan-out (2 START→ + 2 →END + 0 cross-edges)
 *   - Rogue node guard (count exactly 2)
 *   - Soft-skip Case A: coach_input null → coach_skipped=true, coach LLM never called
 *   - Soft-skip Case B: reflection_input null → reflection LLM never called, coach proceeds
 *   - Soft-skip Case C: both null → both skip
 *   - Soft-skip log keys: post_report_coach_node_skipped / post_report_reflection_node_skipped
 */

import { describe, it, expect, vi } from "vitest";
import {
  POST_REPORT_GRAPH_NODES,
  buildPostReportGraph,
  type PostReportGraphDeps,
} from "../postReportGraph.js";
import type { LLMProvider } from "@/core/llm/types";
import {
  CoachAgentOutputSchema,
  _LLMCoachOutputSchema,
} from "@/core/schemas/coach";
import {
  ReflectionAgentOutputSchema,
  _LLMReflectionOutputSchema,
} from "@/core/schemas/reflection";
import { z } from "zod";

// ─── Schema identification (by shape, NOT reference equality) ─────────────────
// Shape-key inspection is robust across re-imports. Reference equality can
// silently fail when vitest module cache differs between test files.

function identifySchema(schema: z.ZodSchema<unknown>): "coach" | "reflection" | "unknown" {
  const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape;
  if (!shape) return "unknown";
  if ("headline" in shape) return "coach";
  if ("executive_summary" in shape) return "reflection";
  return "unknown";
}

// ─── Stub LLM (fast, no delay) ────────────────────────────────────────────────

function makeStubLLM(): LLMProvider {
  return {
    chat: async () => ({ content: "" }),
    chatStream: async function* () {},
    generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
      const tag = identifySchema(req.schema);
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
      throw new Error(`Unexpected schema in stub LLM: ${String(req.schema)}`);
    },
  } as unknown as LLMProvider;
}

// ─── Minimal valid inputs ─────────────────────────────────────────────────────

const VALID_COACH_INPUT = {
  user_id: "user-001",
  based_on_session_count: 3,
  based_on_last_session_id: "sess-abc",
  recent_reports: [
    { session_id: "s1", status: "ok" },
    { session_id: "s2", status: "ok" },
    { session_id: "s3", status: "ok" },
  ],
  candidate_profile: null,
};

const VALID_REFLECTION_INPUT = {
  session_id: "sess-abc",
  report_id: "rpt-001",
  report_payload: { ai_verdict: "表达冗长" },
  turns: [],
  parse_payload: null,
  research_payload: null,
};

const MINIMAL_INVOKE_INPUT = {
  user_id: "user-001",
  last_session_id: "sess-abc",
  coach_input: VALID_COACH_INPUT,
  reflection_input: VALID_REFLECTION_INPUT,
};

const STUB_DEPS: PostReportGraphDeps = { llm: makeStubLLM() };

// ─── L0 #13 Node-name lock ────────────────────────────────────────────────────

describe("POST_REPORT_GRAPH_NODES — L0 #13 node-name lock", () => {
  it("contains exactly {coach_node, reflection_node} — set equality", () => {
    const expected = new Set(["coach_node", "reflection_node"]);
    expect(POST_REPORT_GRAPH_NODES.size).toBe(expected.size);
    for (const name of expected) {
      expect(POST_REPORT_GRAPH_NODES.has(name as "coach_node" | "reflection_node")).toBe(true);
    }
    for (const name of POST_REPORT_GRAPH_NODES) {
      expect(expected.has(name)).toBe(true);
    }
  });

  it("has size 2 — no 3rd node allowed", () => {
    expect(POST_REPORT_GRAPH_NODES.size).toBe(2);
  });

  it("is frozen — Object.isFrozen returns true", () => {
    expect(Object.isFrozen(POST_REPORT_GRAPH_NODES)).toBe(true);
  });

  it("sorted array equals [coach_node, reflection_node]", () => {
    expect(Array.from(POST_REPORT_GRAPH_NODES).sort()).toEqual([
      "coach_node",
      "reflection_node",
    ]);
  });
});

// ─── Compiled graph topology ──────────────────────────────────────────────────

describe("buildPostReportGraph — compiled graph node/edge topology", () => {
  it("compiled graph node IDs (filtered) equal POST_REPORT_GRAPH_NODES", () => {
    const drawable = buildPostReportGraph(STUB_DEPS).getGraph();
    const nodeIds = new Set(
      Object.keys(drawable.nodes).filter((id) => id !== "__start__" && id !== "__end__"),
    );
    expect(nodeIds).toEqual(new Set(POST_REPORT_GRAPH_NODES));
  });

  it("rogue node guard — graph has exactly 2 user-defined nodes", () => {
    const drawable = buildPostReportGraph(STUB_DEPS).getGraph();
    const userNodes = Object.keys(drawable.nodes).filter(
      (id) => id !== "__start__" && id !== "__end__",
    );
    expect(userNodes).toHaveLength(2);
  });

  it("4-edge parallel fan-out topology — 2 from START + 2 to END + 0 cross-edges", () => {
    const drawable = buildPostReportGraph(STUB_DEPS).getGraph();
    const edges = drawable.edges;

    // Total 4 edges
    expect(edges).toHaveLength(4);

    // 2 outgoing from START to {coach_node, reflection_node}
    const startEdges = edges.filter((e) => e.source === "__start__");
    expect(startEdges).toHaveLength(2);
    expect(startEdges.map((e) => e.target).sort()).toEqual(["coach_node", "reflection_node"]);

    // 2 incoming to END from {coach_node, reflection_node}
    const endEdges = edges.filter((e) => e.target === "__end__");
    expect(endEdges).toHaveLength(2);
    expect(endEdges.map((e) => e.source).sort()).toEqual(["coach_node", "reflection_node"]);

    // 0 cross-edges between coach_node and reflection_node
    const crossEdges = edges.filter(
      (e) =>
        (e.source === "coach_node" && e.target === "reflection_node") ||
        (e.source === "reflection_node" && e.target === "coach_node"),
    );
    expect(crossEdges).toHaveLength(0);
  });
});

// ─── Soft-skip tests ──────────────────────────────────────────────────────────

describe("postReportGraph — soft-skip on null inputs", () => {
  it("Case A: coach_input null → coach_skipped=true, coach_error=null, reflection runs normally", async () => {
    const llmCallTags: string[] = [];
    const trackingLLM: LLMProvider = {
      chat: async () => ({ content: "" }),
      chatStream: async function* () {},
      generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
        const tag = identifySchema(req.schema);
        llmCallTags.push(tag);
        return makeStubLLM().generateObject(req);
      },
    } as unknown as LLMProvider;

    const graph = buildPostReportGraph({ llm: trackingLLM });
    const result = await graph.invoke({
      ...MINIMAL_INVOKE_INPUT,
      coach_input: null,
    });

    expect(result.coach_skipped).toBe(true);
    expect(result.coach_error).toBeNull();
    expect(result.reflection_error).toBeNull();

    // Coach LLM was never called
    expect(llmCallTags.filter((t) => t === "coach")).toHaveLength(0);
    // Reflection LLM was called
    expect(llmCallTags.filter((t) => t === "reflection")).toHaveLength(1);
  });

  it("Case B: reflection_input null → reflection LLM never called, coach proceeds normally", async () => {
    const llmCallTags: string[] = [];
    const trackingLLM: LLMProvider = {
      chat: async () => ({ content: "" }),
      chatStream: async function* () {},
      generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
        const tag = identifySchema(req.schema);
        llmCallTags.push(tag);
        return makeStubLLM().generateObject(req);
      },
    } as unknown as LLMProvider;

    const graph = buildPostReportGraph({ llm: trackingLLM });
    const result = await graph.invoke({
      ...MINIMAL_INVOKE_INPUT,
      reflection_input: null,
    });

    expect(result.reflection_error).toBeNull();
    expect(result.coach_error).toBeNull();
    expect(result.coach_skipped).toBe(false);

    // Reflection LLM was never called
    expect(llmCallTags.filter((t) => t === "reflection")).toHaveLength(0);
    // Coach LLM was called
    expect(llmCallTags.filter((t) => t === "coach")).toHaveLength(1);
  });

  it("Case C: both null → both skip, graph resolves cleanly", async () => {
    const graph = buildPostReportGraph(STUB_DEPS);
    const result = await graph.invoke({
      ...MINIMAL_INVOKE_INPUT,
      coach_input: null,
      reflection_input: null,
    });

    expect(result.coach_skipped).toBe(true);
    expect(result.coach_error).toBeNull();
    expect(result.reflection_error).toBeNull();
  });

  it("soft-skip logs: coach emits post_report_coach_node_skipped with reason=no_input", async () => {
    const infoLogs: Array<[string, Record<string, unknown>?]> = [];
    const logger = {
      info: (msg: string, meta?: Record<string, unknown>) => {
        infoLogs.push([msg, meta]);
      },
      warn: vi.fn(),
    };

    const graph = buildPostReportGraph({ llm: makeStubLLM(), logger });
    await graph.invoke({ ...MINIMAL_INVOKE_INPUT, coach_input: null });

    const coachSkipLog = infoLogs.find(([msg]) => msg === "post_report_coach_node_skipped");
    expect(coachSkipLog).toBeDefined();
    expect(coachSkipLog![1]).toEqual({ reason: "no_input" });
  });

  it("soft-skip logs: reflection emits post_report_reflection_node_skipped with reason=no_input", async () => {
    const infoLogs: Array<[string, Record<string, unknown>?]> = [];
    const logger = {
      info: (msg: string, meta?: Record<string, unknown>) => {
        infoLogs.push([msg, meta]);
      },
      warn: vi.fn(),
    };

    const graph = buildPostReportGraph({ llm: makeStubLLM(), logger });
    await graph.invoke({ ...MINIMAL_INVOKE_INPUT, reflection_input: null });

    const reflectionSkipLog = infoLogs.find(
      ([msg]) => msg === "post_report_reflection_node_skipped",
    );
    expect(reflectionSkipLog).toBeDefined();
    expect(reflectionSkipLog![1]).toEqual({ reason: "no_input" });
  });
});
