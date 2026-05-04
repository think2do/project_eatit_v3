/**
 * intakeGraph.contract.test.ts — L0 #13 node-name lock contract tests + deriveResearchInputFromParse unit tests.
 *
 * Mirrors M3.3.1 turnGraph.contract.test.ts pattern.
 * File location: core/graphs/__tests__/ (overrides spec's src/__tests__/ — matches existing test layout).
 */

import { describe, it, expect } from "vitest";
import {
  INTAKE_GRAPH_NODES,
  buildIntakeGraph,
  deriveResearchInputFromParse,
} from "../intakeGraph.js";
import type { LLMProvider } from "@/core/llm/types";
import { ParseResultPayloadSchema } from "@/core/schemas/parse";
import { ResearchAgentOutputSchema } from "@/core/schemas/research";
import { FrameworkAgentOutputSchema } from "@/core/schemas/frameworks";
import { z } from "zod";

// ─── Minimal stub LLM for graph construction ─────────────────────────────────

function makeStubLLM(): LLMProvider {
  return {
    chat: async () => ({ content: "" }),
    chatStream: async function* () {},
    generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
      // Dispatch by schema reference — parse path
      if (req.schema === ParseResultPayloadSchema) {
        return ParseResultPayloadSchema.parse({}) as unknown as T;
      }
      // research path
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
      // framework path
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
      throw new Error("Unexpected schema in stub LLM");
    },
  } as unknown as LLMProvider;
}

const mockDeps = { llm: makeStubLLM() };

// ─── §9.2 Contract assertions ─────────────────────────────────────────────────

describe("INTAKE_GRAPH_NODES — L0 #13 node-name lock", () => {
  it("INTAKE_GRAPH_NODES is exactly the 3-name set, frozen", () => {
    expect(Array.from(INTAKE_GRAPH_NODES).sort()).toEqual([
      "parse_node",
      "predict_questions_node",
      "research_node",
    ]);
    expect(INTAKE_GRAPH_NODES.size).toBe(3);
    expect(Object.isFrozen(INTAKE_GRAPH_NODES)).toBe(true);
  });

  it("compiled graph nodes equal INTAKE_GRAPH_NODES", () => {
    const drawable = buildIntakeGraph(mockDeps).getGraph();
    const nodeIds = new Set(
      Object.keys(drawable.nodes).filter((id) => id !== "__start__" && id !== "__end__"),
    );
    expect(nodeIds).toEqual(new Set(INTAKE_GRAPH_NODES));
  });

  it("edge topology: 4 edges sequential", () => {
    const e = buildIntakeGraph(mockDeps).getGraph().edges;
    expect(e.filter((x) => x.source === "__start__").map((x) => x.target)).toEqual([
      "parse_node",
    ]);
    expect(e.filter((x) => x.source === "parse_node").map((x) => x.target)).toEqual([
      "research_node",
    ]);
    expect(e.filter((x) => x.source === "research_node").map((x) => x.target)).toEqual([
      "predict_questions_node",
    ]);
    expect(e.filter((x) => x.target === "__end__").map((x) => x.source)).toEqual([
      "predict_questions_node",
    ]);
  });

  it("rejects rogue node addition (count is exactly 3)", () => {
    const ids = Object.keys(buildIntakeGraph(mockDeps).getGraph().nodes).filter(
      (id) => id !== "__start__" && id !== "__end__",
    );
    expect(ids).toHaveLength(3);
    for (const id of ids) expect(INTAKE_GRAPH_NODES.has(id as IntakeGraphNodeNameLocal)).toBe(true);
  });
});

// Local alias to avoid importing the type from file under test in a loop
type IntakeGraphNodeNameLocal = "parse_node" | "research_node" | "predict_questions_node";

// ─── deriveResearchInputFromParse unit tests ──────────────────────────────────

// Helper to build a minimal IntakeState-like object for deriveResearchInputFromParse
function makeState(overrides: {
  research_opt_in?: boolean;
  parse_payload?: null | {
    jd_company_name?: string | null;
    jd_role_title?: string | null;
    jd_industry_hints?: string[];
  };
  research_input?: null;
}) {
  const base = {
    resume_text: "resume",
    jd_text: "jd",
    research_opt_in: overrides.research_opt_in ?? true,
    research_input: overrides.research_input ?? null,
    framework_config: null,
    parse_payload: null as unknown,
    research_payload: null,
    research_skipped: false,
    research_error: null,
    direction_framework: null,
  };

  if (overrides.parse_payload !== undefined) {
    if (overrides.parse_payload === null) {
      base.parse_payload = null;
    } else {
      // Build a valid ParseResultPayload with the given jd_* overrides
      base.parse_payload = ParseResultPayloadSchema.parse({
        ...overrides.parse_payload,
      });
    }
  }

  return base as Parameters<typeof deriveResearchInputFromParse>[0];
}

describe("deriveResearchInputFromParse", () => {
  it("returns null when research_opt_in is false", () => {
    const state = makeState({
      research_opt_in: false,
      parse_payload: { jd_company_name: "Acme", jd_role_title: "PM" },
    });
    expect(deriveResearchInputFromParse(state)).toBeNull();
  });

  it("returns null when parse_payload is null", () => {
    const state = makeState({ research_opt_in: true, parse_payload: null });
    expect(deriveResearchInputFromParse(state)).toBeNull();
  });

  it("returns null when jd_company_name is empty string", () => {
    const state = makeState({
      parse_payload: { jd_company_name: "", jd_role_title: "PM" },
    });
    expect(deriveResearchInputFromParse(state)).toBeNull();
  });

  it("returns null when jd_role_title is empty string", () => {
    const state = makeState({
      parse_payload: { jd_company_name: "Acme", jd_role_title: "" },
    });
    expect(deriveResearchInputFromParse(state)).toBeNull();
  });

  it("returns null when both jd_company_name and jd_role_title are empty", () => {
    const state = makeState({
      parse_payload: { jd_company_name: "", jd_role_title: "" },
    });
    expect(deriveResearchInputFromParse(state)).toBeNull();
  });

  it("falls back to [role_title] when jd_industry_hints is empty", () => {
    const state = makeState({
      parse_payload: {
        jd_company_name: "Acme",
        jd_role_title: "PM",
        jd_industry_hints: [],
      },
    });
    const result = deriveResearchInputFromParse(state);
    expect(result).not.toBeNull();
    expect(result!.industry_hints).toEqual(["PM"]);
  });

  it("trims and filters whitespace-only hints", () => {
    const state = makeState({
      parse_payload: {
        jd_company_name: "Acme",
        jd_role_title: "PM",
        jd_industry_hints: ["  ", "SaaS", "  ", "B2B"],
      },
    });
    const result = deriveResearchInputFromParse(state);
    expect(result).not.toBeNull();
    expect(result!.industry_hints).toEqual(["SaaS", "B2B"]);
  });

  it("slices company_name to 80 chars", () => {
    // Bypass ParseResultPayloadSchema.parse() — the schema enforces max 80 on jd_company_name
    // (that schema is the LLM output boundary, not the intake state boundary).
    // We build parse_payload directly to exercise the slicing logic in deriveResearchInputFromParse.
    const long = "A".repeat(100);
    const state = {
      resume_text: "resume",
      jd_text: "jd",
      research_opt_in: true,
      research_input: null,
      framework_config: null,
      parse_payload: { jd_company_name: long, jd_role_title: "PM", jd_industry_hints: [] } as unknown as Parameters<typeof deriveResearchInputFromParse>[0]["parse_payload"],
      research_payload: null,
      research_skipped: false,
      research_error: null,
      direction_framework: null,
    } as Parameters<typeof deriveResearchInputFromParse>[0];
    const result = deriveResearchInputFromParse(state);
    expect(result).not.toBeNull();
    expect(result!.company_name.length).toBe(80);
  });

  it("slices role_title to 80 chars", () => {
    // Bypass ParseResultPayloadSchema.parse() — same reason as company_name test above.
    const long = "B".repeat(100);
    const state = {
      resume_text: "resume",
      jd_text: "jd",
      research_opt_in: true,
      research_input: null,
      framework_config: null,
      parse_payload: { jd_company_name: "Acme", jd_role_title: long, jd_industry_hints: [] } as unknown as Parameters<typeof deriveResearchInputFromParse>[0]["parse_payload"],
      research_payload: null,
      research_skipped: false,
      research_error: null,
      direction_framework: null,
    } as Parameters<typeof deriveResearchInputFromParse>[0];
    const result = deriveResearchInputFromParse(state);
    expect(result).not.toBeNull();
    expect(result!.role_title.length).toBe(80);
  });

  it("slices industry_hints to 5 items max", () => {
    const state = makeState({
      parse_payload: {
        jd_company_name: "Acme",
        jd_role_title: "PM",
        jd_industry_hints: ["a", "b", "c", "d", "e"],
      },
    });
    const result = deriveResearchInputFromParse(state);
    expect(result).not.toBeNull();
    expect(result!.industry_hints).toHaveLength(5);
    expect(result!.industry_hints).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("valid input returns a parsed ResearchAgentInput with correct fields", () => {
    const state = makeState({
      parse_payload: {
        jd_company_name: "Acme Corp",
        jd_role_title: "Senior PM",
        jd_industry_hints: ["SaaS", "B2B"],
      },
    });
    const result = deriveResearchInputFromParse(state);
    expect(result).not.toBeNull();
    expect(result!.company_name).toBe("Acme Corp");
    expect(result!.role_title).toBe("Senior PM");
    expect(result!.industry_hints).toEqual(["SaaS", "B2B"]);
  });
});
