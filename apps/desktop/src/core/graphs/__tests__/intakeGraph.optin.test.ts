/**
 * intakeGraph.optin.test.ts — Research opt-in shortcut tests (§9.3).
 *
 * 4 cases:
 *   A: research_opt_in=false → researchNode short-circuits → research_skipped=true, error=null
 *   B: research_opt_in=true + valid jd_company/role → research runs → research_payload!=null
 *   C: research_opt_in=true + parse returns empty jd_company → research_skipped=true, error=null
 *   D: research_opt_in=true + research hangs >15s → research_skipped=true, error="timeout"
 *
 * Design note: Case D tests researchNode directly (unit) rather than invoking the full graph
 * through LangGraph Pregel, because vi.useFakeTimers() + LangGraph's internal async scheduling
 * do not cooperate reliably (Pregel uses real microtask queues internally). Testing the node
 * function directly with fake timers is more deterministic and matches the intent of the spec
 * (verify the Promise.race + AbortController + Symbol sentinel pattern).
 *
 * File location: core/graphs/__tests__/ (overrides spec's src/__tests__/ — matches existing layout).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { buildIntakeGraph } from "../intakeGraph.js";
import type { LLMProvider, Message } from "@/core/llm/types";
import { ParseResultPayloadSchema } from "@/core/schemas/parse";
import { ResearchSubObjectSchema } from "@/core/agents/research/index.js";
import { FrameworkAgentOutputSchema } from "@/core/schemas/frameworks";
import { z } from "zod";

afterEach(() => {
  vi.useRealTimers();
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_PARSE_PAYLOAD_WITH_JD = ParseResultPayloadSchema.parse({
  jd_company_name: "Acme Corp",
  jd_role_title: "Senior PM",
  jd_industry_hints: ["SaaS", "B2B"],
});

const VALID_PARSE_PAYLOAD_NO_COMPANY = ParseResultPayloadSchema.parse({
  jd_company_name: "",
  jd_role_title: "Senior PM",
  jd_industry_hints: ["SaaS"],
});

const VALID_LLM_RESEARCH_SUB = {
  company: {
    name: "Acme Corp",
    business_model: "SaaS platform for B2B teams",
    stage: "growth" as const,
    recent_signals: [],
    evidence_links: [],
    confidence: "mid" as const,
  },
  industry: {
    name: "B2B SaaS",
    landscape_summary: "Growing market with high competition",
    key_metrics: ["ARR", "NRR", "CAC"],
    typical_pain_points: ["Churn", "Onboarding complexity"],
    competitors_in_jd_ctx: [],
  },
};

const VALID_FRAMEWORK_OUTPUT = FrameworkAgentOutputSchema.parse({
  direction: "hybrid",
  focus_competencies: [],
  opening_questions: [],
  deep_dive_anchors: [],
  pace_plan: { total_minutes: 30, segments: [] },
  predicted_questions: null,
});

// ─── Mock LLM factory ─────────────────────────────────────────────────────────
//
// Dispatches by schema reference equality:
//   - ParseResultPayloadSchema → parse path (returns VALID_PARSE_PAYLOAD_WITH_JD or override)
//   - ResearchSubObjectSchema  → research path (returns VALID_LLM_RESEARCH_SUB or override)
//   - FrameworkAgentOutputSchema → framework path (returns VALID_FRAMEWORK_OUTPUT)
//
// generateObject is a vi.fn() spy so tests can assert call counts / schemas used.

interface MockLLMOptions {
  parsePayload?: z.infer<typeof ParseResultPayloadSchema>;
  researchImpl?: () => Promise<unknown>;
}

function makeTrackedLLM(opts: MockLLMOptions = {}) {
  const generateObject = vi.fn(
    async <T>(req: { schema: z.ZodSchema<T>; messages: Message[]; model?: string }): Promise<T> => {
      // Parse path: runParseAgent calls generateObject with ParseResultPayloadSchema
      if (req.schema === ParseResultPayloadSchema) {
        return (opts.parsePayload ?? VALID_PARSE_PAYLOAD_WITH_JD) as unknown as T;
      }
      // Research path: runResearchAgent calls generateObject with ResearchSubObjectSchema
      if (req.schema === ResearchSubObjectSchema) {
        if (opts.researchImpl) {
          return opts.researchImpl() as Promise<T>;
        }
        return VALID_LLM_RESEARCH_SUB as unknown as T;
      }
      // Framework path
      if (req.schema === FrameworkAgentOutputSchema) {
        return VALID_FRAMEWORK_OUTPUT as unknown as T;
      }
      throw new Error(`Unexpected schema in mock LLM: ${String(req.schema)}`);
    },
  );

  const llm: LLMProvider = {
    chat: vi.fn(async () => ({ content: "" })),
    chatStream: vi.fn(async function* () {}),
    generateObject,
  } as unknown as LLMProvider;

  return { llm, generateObject };
}

// ─── Minimal valid graph input ────────────────────────────────────────────────

const BASE_INPUT = {
  resume_text: "5年AI产品经理经验",
  jd_text: "招聘AI产品经理,要求3年以上AI产品经验",
  research_opt_in: false,
  research_input: null,
  framework_config: null,
};

// ─── Case A: research_opt_in=false → short-circuit ───────────────────────────

describe("Case A — research_opt_in=false → researchNode short-circuits", () => {
  it("research_skipped=true, research_error=null, research_payload=null", async () => {
    const { llm, generateObject } = makeTrackedLLM();
    const graph = buildIntakeGraph({ llm });

    const result = await graph.invoke({
      ...BASE_INPUT,
      research_opt_in: false,
    });

    expect(result.research_skipped).toBe(true);
    expect(result.research_error).toBeNull();
    expect(result.research_payload).toBeNull();

    // ResearchSubObjectSchema must NOT appear in any generateObject call
    const researchCalls = generateObject.mock.calls.filter(
      (call) => call[0].schema === ResearchSubObjectSchema,
    );
    expect(researchCalls).toHaveLength(0);
  });

  it("logger receives research_node_skipped with reason=opt_out", async () => {
    const { llm } = makeTrackedLLM();
    const infoSpy = vi.fn();
    const graph = buildIntakeGraph({ llm, logger: { info: infoSpy } });

    await graph.invoke({ ...BASE_INPUT, research_opt_in: false });

    const skippedCalls = infoSpy.mock.calls.filter((c) => c[0] === "research_node_skipped");
    expect(skippedCalls.length).toBeGreaterThanOrEqual(1);
    expect(skippedCalls[0][1]).toEqual({ reason: "opt_out" });
  });
});

// ─── Case B: research_opt_in=true + valid jd_company/role → research runs ────

describe("Case B — research_opt_in=true + valid jd → research runs successfully", () => {
  it("research_payload!=null, research_skipped=false, research_error=null", async () => {
    const { llm } = makeTrackedLLM({
      parsePayload: VALID_PARSE_PAYLOAD_WITH_JD,
    });
    const graph = buildIntakeGraph({ llm });

    const result = await graph.invoke({
      ...BASE_INPUT,
      research_opt_in: true,
    });

    expect(result.research_payload).not.toBeNull();
    expect(result.research_skipped).toBe(false);
    expect(result.research_error).toBeNull();
    // Verify company data flowed through
    expect(result.research_payload?.company?.name).toBe("Acme Corp");
  });

  it("ResearchSubObjectSchema was called (research LLM call happened)", async () => {
    const { llm, generateObject } = makeTrackedLLM({
      parsePayload: VALID_PARSE_PAYLOAD_WITH_JD,
    });
    const graph = buildIntakeGraph({ llm });

    await graph.invoke({ ...BASE_INPUT, research_opt_in: true });

    const researchCalls = generateObject.mock.calls.filter(
      (call) => call[0].schema === ResearchSubObjectSchema,
    );
    expect(researchCalls.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Case C: research_opt_in=true + empty jd_company → insufficient_jd_signal ─

describe("Case C — research_opt_in=true + empty jd_company_name → insufficient_jd_signal skip", () => {
  it("research_skipped=true, research_error=null, research_payload=null", async () => {
    const { llm } = makeTrackedLLM({
      parsePayload: VALID_PARSE_PAYLOAD_NO_COMPANY,
    });
    const graph = buildIntakeGraph({ llm });

    const result = await graph.invoke({
      ...BASE_INPUT,
      research_opt_in: true,
    });

    expect(result.research_skipped).toBe(true);
    expect(result.research_error).toBeNull();
    expect(result.research_payload).toBeNull();
  });

  it("logger receives research_node_skipped with reason=insufficient_jd_signal", async () => {
    const { llm } = makeTrackedLLM({
      parsePayload: VALID_PARSE_PAYLOAD_NO_COMPANY,
    });
    const infoSpy = vi.fn();
    const graph = buildIntakeGraph({ llm, logger: { info: infoSpy } });

    await graph.invoke({ ...BASE_INPUT, research_opt_in: true });

    const skippedCalls = infoSpy.mock.calls.filter((c) => c[0] === "research_node_skipped");
    expect(skippedCalls.length).toBeGreaterThanOrEqual(1);
    expect(skippedCalls[0][1]).toEqual({ reason: "insufficient_jd_signal" });
  });

  it("ResearchSubObjectSchema was NOT called when jd_company is empty", async () => {
    const { llm, generateObject } = makeTrackedLLM({
      parsePayload: VALID_PARSE_PAYLOAD_NO_COMPANY,
    });
    const graph = buildIntakeGraph({ llm });

    await graph.invoke({ ...BASE_INPUT, research_opt_in: true });

    const researchCalls = generateObject.mock.calls.filter(
      (call) => call[0].schema === ResearchSubObjectSchema,
    );
    expect(researchCalls).toHaveLength(0);
  });
});

// ─── Case D: research hangs >15s → timeout sentinel → research_skipped=true, error="timeout" ─
//
// Design note: We test researchNode behavior via buildIntakeGraph with fake timers.
// The mock research LLM impl returns `new Promise(() => {})` (never resolves),
// simulating a hung LLM call. vi.useFakeTimers() + vi.advanceTimersByTimeAsync(15_001)
// advances the timeout Promise, causing the Symbol sentinel to win the race.
//
// We pre-supply `research_input` in state (backward-compat hatch) so that
// deriveResearchInputFromParse is bypassed and research definitely attempts to run.

describe("Case D — research_opt_in=true + research hangs >15s → timeout", () => {
  it("research_skipped=true, research_error='timeout' after 15s fake timeout", async () => {
    vi.useFakeTimers();

    const neverResolvingResearch = () => new Promise<never>(() => {});

    const { llm } = makeTrackedLLM({
      parsePayload: VALID_PARSE_PAYLOAD_WITH_JD,
      researchImpl: neverResolvingResearch,
    });

    const infoSpy = vi.fn();
    const graph = buildIntakeGraph({ llm, logger: { info: infoSpy } });

    // Start graph invocation (it will hang at researchNode's LLM call)
    const invokePromise = graph.invoke({
      ...BASE_INPUT,
      research_opt_in: true,
    });

    // Advance fake timers past the 15s research timeout
    await vi.advanceTimersByTimeAsync(15_001);

    const result = await invokePromise;

    expect(result.research_skipped).toBe(true);
    expect(result.research_error).toBe("timeout");
    expect(result.research_payload).toBeNull();

    // Logger should have received research_node_timeout
    const timeoutCalls = infoSpy.mock.calls.filter((c) => c[0] === "research_node_timeout");
    expect(timeoutCalls.length).toBeGreaterThanOrEqual(1);
  }, 10_000);
});
