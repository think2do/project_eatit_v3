/**
 * log-keys.contract.test.ts — M5.2.b
 *
 * Verifies that each graph emits its locked logger key strings with the correct
 * shape when the relevant code path is triggered. Uses vi.fn() spies on
 * deps.logger.info / deps.logger.warn.
 *
 * Locked keys (M3.3.x design docs):
 *   turnGraph:
 *     "interviewer.budget_guard"  — info  — {answered, budget, forced_should_end}
 *
 *   intakeGraph:
 *     "research_node_skipped"          — info — {reason: "opt_out" | "insufficient_jd_signal"}
 *     "research_node_timeout"          — info — (no meta)
 *     "research_node_llm_error"        — info — {reason: errorClassName}
 *     "predict_questions_node_framework_error" — info — {reason: errorClassName}
 *
 *   postReportGraph:
 *     "post_report_coach_node_skipped"      — info — {reason: "no_input"}
 *     "post_report_coach_node_unhandled"    — warn — {reason: errorClassName}
 *     "post_report_reflection_node_skipped" — info — {reason: "no_input"}
 *     "post_report_reflection_node_unhandled" — warn — {reason: errorClassName}
 *
 * Constraints:
 *   §A0  — No Tauri imports.
 *   §C3  — Stub LLM only; no process.env / keychain.
 *   L0 #13 — Locked node names only.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
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

afterEach(() => {
  vi.useRealTimers();
});

// ─── Schema identification helpers ────────────────────────────────────────────

function identifyTurnSchema(schema: z.ZodSchema<unknown>): string {
  const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape ?? {};
  const keys = Object.keys(shape).sort().join(",");
  if (keys === "strengths,summary,weaknesses") return "turn_assessment";
  if (keys === "open_threads,preserved_keywords,summary") return "compression";
  if (keys.includes("expected_depth") && keys.includes("intent") && keys.includes("question")) return "interviewer";
  return `unknown(${keys})`;
}

function identifyPostReportSchema(schema: z.ZodSchema<unknown>): "coach" | "reflection" | "unknown" {
  const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape;
  if (!shape) return "unknown";
  if ("headline" in shape) return "coach";
  if ("executive_summary" in shape) return "reflection";
  return "unknown";
}

// ─── Stub LLM factories ───────────────────────────────────────────────────────

function makeTurnSuccessLLM(): LLMProvider {
  return {
    chat: async () => ({ content: "" }),
    chatStream: async function* () {},
    generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
      const tag = identifyTurnSchema(req.schema);
      if (tag === "turn_assessment") {
        return TurnAssessmentSchema.parse({ summary: "ok", strengths: [], weaknesses: [] }) as unknown as T;
      }
      if (tag === "compression") {
        return CompressionAgentOutputSchema.parse({ summary: "ok", preserved_keywords: [], open_threads: [] }) as unknown as T;
      }
      return InterviewerAgentOutputSchema.parse({ question: "q?", intent: "t", expected_depth: "surface" }) as unknown as T;
    },
  } as unknown as LLMProvider;
}

function makeIntakeSuccessLLM(parsePayload?: unknown): LLMProvider {
  return {
    chat: async () => ({ content: "" }),
    chatStream: async function* () {},
    generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
      if (req.schema === ParseResultPayloadSchema) {
        return (parsePayload ?? ParseResultPayloadSchema.parse({})) as unknown as T;
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

function makePostReportSuccessLLM(): LLMProvider {
  return {
    chat: async () => ({ content: "" }),
    chatStream: async function* () {},
    generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
      const tag = identifyPostReportSchema(req.schema);
      if (tag === "coach") {
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

// ─── Minimal valid post-report inputs ─────────────────────────────────────────

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
  session_id: "s1",
  report_id: "r1",
  report_payload: { ai_verdict: "ok" },
  turns: [],
  parse_payload: null,
  research_payload: null,
};

const POST_REPORT_BASE = {
  user_id: "u1",
  last_session_id: "s1",
  coach_input: VALID_COACH_INPUT,
  reflection_input: VALID_REFLECTION_INPUT,
};

// ─── turnGraph: interviewer.budget_guard log key ───────────────────────────────

describe("turnGraph log key — interviewer.budget_guard (§5.3 budget guard logging)", () => {
  it("emits info('interviewer.budget_guard', {answered, budget, forced_should_end}) when budget exceeded", async () => {
    const infoSpy = vi.fn();
    const graph = buildTurnGraph({ llm: makeTurnSuccessLLM(), logger: { info: infoSpy } });

    await graph.invoke({
      turn_index: 2,
      question: "q?",
      answer: "a.",
      // budget = 3 (one stage of question_budget 3); turn_index=2 → 2+1=3 >= 3 → triggers
      framework_json: JSON.stringify({ stages: [{ question_budget: 3 }] }),
      recent_turns: [],
    });

    const budgetLogs = infoSpy.mock.calls.filter((c) => c[0] === "interviewer.budget_guard");
    expect(budgetLogs.length).toBeGreaterThanOrEqual(1);
    const meta = budgetLogs[0][1] as Record<string, unknown>;
    expect(meta).toHaveProperty("budget", 3);
    expect(meta).toHaveProperty("forced_should_end", true);
    expect(meta).toHaveProperty("answered");
  });
});

// ─── intakeGraph: research_node_skipped (opt_out / insufficient_jd_signal) ───

describe("intakeGraph log key — research_node_skipped", () => {
  it("emits info('research_node_skipped', {reason: 'opt_out'}) when research_opt_in=false", async () => {
    const infoSpy = vi.fn();
    const graph = buildIntakeGraph({ llm: makeIntakeSuccessLLM(), logger: { info: infoSpy } });

    await graph.invoke({
      resume_text: "resume",
      jd_text: "jd",
      research_opt_in: false,
      research_input: null,
      framework_config: null,
    });

    const calls = infoSpy.mock.calls.filter((c) => c[0] === "research_node_skipped");
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][1]).toEqual({ reason: "opt_out" });
  });

  it("emits info('research_node_skipped', {reason: 'insufficient_jd_signal'}) when jd_company is empty", async () => {
    const infoSpy = vi.fn();
    const emptyCompanyPayload = ParseResultPayloadSchema.parse({
      jd_company_name: "",
      jd_role_title: "PM",
    });
    const graph = buildIntakeGraph({
      llm: makeIntakeSuccessLLM(emptyCompanyPayload),
      logger: { info: infoSpy },
    });

    await graph.invoke({
      resume_text: "resume",
      jd_text: "jd",
      research_opt_in: true,
      research_input: null,
      framework_config: null,
    });

    const calls = infoSpy.mock.calls.filter((c) => c[0] === "research_node_skipped");
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][1]).toEqual({ reason: "insufficient_jd_signal" });
  });
});

// ─── intakeGraph: research_node_llm_error log key ────────────────────────────

describe("intakeGraph log key — research_node_llm_error", () => {
  it("emits info('research_node_llm_error', {reason: errorClassName}) when research LLM throws", async () => {
    const infoSpy = vi.fn();
    const RESEARCH_INPUT = { company_name: "Acme", role_title: "PM", industry_hints: ["SaaS"] };

    const errorLLM: LLMProvider = {
      chat: async () => ({ content: "" }),
      chatStream: async function* () {},
      generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
        if (req.schema === ParseResultPayloadSchema) {
          return ParseResultPayloadSchema.parse({}) as unknown as T;
        }
        throw new RangeError("LLM response out of range");
      },
    } as unknown as LLMProvider;

    const graph = buildIntakeGraph({ llm: errorLLM, logger: { info: infoSpy } });
    await graph.invoke({
      resume_text: "resume",
      jd_text: "jd",
      research_opt_in: true,
      research_input: RESEARCH_INPUT,
      framework_config: null,
    });

    const calls = infoSpy.mock.calls.filter((c) => c[0] === "research_node_llm_error");
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][1]).toEqual({ reason: "RangeError" });
  });
});

// ─── postReportGraph: coach/reflection skip log keys ─────────────────────────

describe("postReportGraph log key — post_report_coach_node_skipped", () => {
  it("emits info('post_report_coach_node_skipped', {reason: 'no_input'}) when coach_input=null", async () => {
    const infoSpy = vi.fn();
    const graph = buildPostReportGraph({ llm: makePostReportSuccessLLM(), logger: { info: infoSpy } });

    await graph.invoke({ ...POST_REPORT_BASE, coach_input: null });

    const calls = infoSpy.mock.calls.filter((c) => c[0] === "post_report_coach_node_skipped");
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][1]).toEqual({ reason: "no_input" });
  });
});

describe("postReportGraph log key — post_report_reflection_node_skipped", () => {
  it("emits info('post_report_reflection_node_skipped', {reason: 'no_input'}) when reflection_input=null", async () => {
    const infoSpy = vi.fn();
    const graph = buildPostReportGraph({ llm: makePostReportSuccessLLM(), logger: { info: infoSpy } });

    await graph.invoke({ ...POST_REPORT_BASE, reflection_input: null });

    const calls = infoSpy.mock.calls.filter((c) => c[0] === "post_report_reflection_node_skipped");
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][1]).toEqual({ reason: "no_input" });
  });
});

describe("postReportGraph log key — post_report_coach_node_unhandled", () => {
  it("emits warn('post_report_coach_node_unhandled', {reason: errorClassName}) when coach LLM throws", async () => {
    const warnSpy = vi.fn();
    const errorLLM: LLMProvider = {
      chat: async () => ({ content: "" }),
      chatStream: async function* () {},
      generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
        const tag = identifyPostReportSchema(req.schema);
        if (tag === "coach") throw new TypeError("coach network failure");
        return _LLMReflectionOutputSchema.parse({
          executive_summary: "s",
          per_question_coaching: [],
          general_growth_advice: "a",
          mock_followup_dialogue: [],
        }) as unknown as T;
      },
    } as unknown as LLMProvider;

    const graph = buildPostReportGraph({ llm: errorLLM, logger: { warn: warnSpy } });
    await graph.invoke(POST_REPORT_BASE);

    const calls = warnSpy.mock.calls.filter((c) => c[0] === "post_report_coach_node_unhandled");
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][1]).toEqual({ reason: "TypeError" });
  });
});

describe("postReportGraph log key — post_report_reflection_node_unhandled", () => {
  it("emits warn('post_report_reflection_node_unhandled', {reason: errorClassName}) when reflection LLM throws", async () => {
    const warnSpy = vi.fn();
    const errorLLM: LLMProvider = {
      chat: async () => ({ content: "" }),
      chatStream: async function* () {},
      generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
        const tag = identifyPostReportSchema(req.schema);
        if (tag === "reflection") throw new SyntaxError("reflection parse failure");
        return _LLMCoachOutputSchema.parse({
          headline: "h",
          headline_detail: "d",
          recurring_weaknesses: [],
          improvement_signals: [],
          next_focus_areas: [],
        }) as unknown as T;
      },
    } as unknown as LLMProvider;

    const graph = buildPostReportGraph({ llm: errorLLM, logger: { warn: warnSpy } });
    await graph.invoke(POST_REPORT_BASE);

    const calls = warnSpy.mock.calls.filter((c) => c[0] === "post_report_reflection_node_unhandled");
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][1]).toEqual({ reason: "SyntaxError" });
  });
});
