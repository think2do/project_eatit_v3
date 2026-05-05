/**
 * error-isolation.contract.test.ts — M5.2.b
 *
 * Parametrized error-class-name preservation tests:
 *
 * 1. postReportGraph parallel error isolation:
 *    Parametrize 5 error classes (Error / TypeError / RangeError / SyntaxError / URIError)
 *    — confirm each is captured in coach_error / reflection_error without graph throwing.
 *
 * 2. turnGraph budget guard:
 *    When turn_index + 1 >= budget → next_question.should_end === true.
 *
 * 3. intakeGraph research error class preservation:
 *    When researchAgent throws Error vs TypeError → research_error captures constructor.name.
 *
 * Constraints:
 *   §A0  — No Tauri imports.
 *   §C3  — Stub LLM only; no process.env / keychain.
 *   L0 #13 — Locked node literals: coach_node / reflection_node /
 *             turn_assessment / compression / next_question /
 *             parse_node / research_node / predict_questions_node.
 */

import { describe, it, expect } from "vitest";
import { buildPostReportGraph } from "@/core/graphs/postReportGraph.js";
import { buildTurnGraph } from "@/core/graphs/turnGraph.js";
import { buildIntakeGraph } from "@/core/graphs/intakeGraph.js";
import type { LLMProvider } from "@/core/llm/types";
import {
  TurnAssessmentSchema,
  CompressionAgentOutputSchema,
  InterviewerAgentOutputSchema,
} from "@/core/schemas/turns";
import { _LLMCoachOutputSchema } from "@/core/schemas/coach";
import { _LLMReflectionOutputSchema } from "@/core/schemas/reflection";
import { ParseResultPayloadSchema } from "@/core/schemas/parse";
import { FrameworkAgentOutputSchema } from "@/core/schemas/frameworks";
import { z } from "zod";

// ─── Schema-identification helpers (shape-key, robust across re-imports) ─────

function identifyPostReportSchema(schema: z.ZodSchema<unknown>): "coach" | "reflection" | "unknown" {
  const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape;
  if (!shape) return "unknown";
  if ("headline" in shape) return "coach";
  if ("executive_summary" in shape) return "reflection";
  return "unknown";
}

function identifyTurnSchema(schema: z.ZodSchema<unknown>): string {
  const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape ?? {};
  const keys = Object.keys(shape).sort().join(",");
  if (keys === "strengths,summary,weaknesses") return "turn_assessment";
  if (keys === "open_threads,preserved_keywords,summary") return "compression";
  if (keys.includes("expected_depth") && keys.includes("intent") && keys.includes("question")) return "interviewer";
  return `unknown(${keys})`;
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
  report_payload: { ai_verdict: "冗长" },
  turns: [],
  parse_payload: null,
  research_payload: null,
};

const POST_REPORT_BASE = {
  user_id: "user-001",
  last_session_id: "sess-abc",
  coach_input: VALID_COACH_INPUT,
  reflection_input: VALID_REFLECTION_INPUT,
};

// ─── Stub LLM helpers ────────────────────────────────────────────────────────

function makeSuccessPostReportLLM(): LLMProvider {
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

// ─── §11.3 postReportGraph: error class name preservation (5 error classes) ──

const ERROR_CLASSES: Array<[string, () => Error]> = [
  ["Error",      () => new Error("generic")],
  ["TypeError",  () => new TypeError("type error")],
  ["RangeError", () => new RangeError("range error")],
  ["SyntaxError",() => new SyntaxError("syntax error")],
  ["URIError",   () => new URIError("uri error")],
];

describe("postReportGraph — coach_error captures error constructor.name (5 error classes)", () => {
  for (const [errorClassName, makeError] of ERROR_CLASSES) {
    it(`coach throws ${errorClassName} → coach_error === "${errorClassName}", graph never throws`, async () => {
      const errorLLM: LLMProvider = {
        chat: async () => ({ content: "" }),
        chatStream: async function* () {},
        generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
          const tag = identifyPostReportSchema(req.schema);
          if (tag === "coach") throw makeError();
          return _LLMReflectionOutputSchema.parse({
            executive_summary: "s",
            per_question_coaching: [],
            general_growth_advice: "a",
            mock_followup_dialogue: [],
          }) as unknown as T;
        },
      } as unknown as LLMProvider;

      const graph = buildPostReportGraph({ llm: errorLLM });

      let result: Awaited<ReturnType<typeof graph.invoke>> | undefined;
      let threw = false;
      try {
        result = await graph.invoke(POST_REPORT_BASE);
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
      expect(result).toBeDefined();
      expect(result!.coach_error).toBe(errorClassName);
      expect(result!.reflection_error).toBeNull();
    }, 5000);
  }
});

describe("postReportGraph — reflection_error captures error constructor.name (5 error classes)", () => {
  for (const [errorClassName, makeError] of ERROR_CLASSES) {
    it(`reflection throws ${errorClassName} → reflection_error === "${errorClassName}", graph never throws`, async () => {
      const errorLLM: LLMProvider = {
        chat: async () => ({ content: "" }),
        chatStream: async function* () {},
        generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
          const tag = identifyPostReportSchema(req.schema);
          if (tag === "reflection") throw makeError();
          return _LLMCoachOutputSchema.parse({
            headline: "h",
            headline_detail: "d",
            recurring_weaknesses: [],
            improvement_signals: [],
            next_focus_areas: [],
          }) as unknown as T;
        },
      } as unknown as LLMProvider;

      const graph = buildPostReportGraph({ llm: errorLLM });

      let result: Awaited<ReturnType<typeof graph.invoke>> | undefined;
      let threw = false;
      try {
        result = await graph.invoke(POST_REPORT_BASE);
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
      expect(result).toBeDefined();
      expect(result!.reflection_error).toBe(errorClassName);
      expect(result!.coach_error).toBeNull();
    }, 5000);
  }
});

// ─── turnGraph: budget guard forces should_end (L0 #13: next_question node) ──

describe("turnGraph — budget guard forces should_end via next_question node (L0 #13)", () => {
  it("turn_index + 1 >= budget → next_question_out.should_end === true", async () => {
    const graph = buildTurnGraph({ llm: makeTurnSuccessLLM() });
    // stages: [{question_budget: 1}] → budget = 1; turn_index=0 → 0+1 >= 1 → forced
    const result = await graph.invoke({
      turn_index: 0,
      question: "q?",
      answer: "a.",
      framework_json: JSON.stringify({ stages: [{ question_budget: 1 }] }),
      recent_turns: [],
    });
    expect(result.next_question_out?.should_end).toBe(true);
  });

  it("turn_index + 1 < budget → next_question_out.should_end is NOT forced", async () => {
    const graph = buildTurnGraph({ llm: makeTurnSuccessLLM() });
    // budget = 5; turn_index=0 → 0+1=1 < 5 → no force
    const result = await graph.invoke({
      turn_index: 0,
      question: "q?",
      answer: "a.",
      framework_json: JSON.stringify({ stages: [{ question_budget: 5 }] }),
      recent_turns: [],
    });
    // The stub LLM returns should_end: false (default for InterviewerAgentOutputSchema)
    expect(result.next_question_out?.should_end).toBe(false);
  });
});

// ─── intakeGraph: research_error captures error constructor.name ──────────────

describe("intakeGraph — research_error captures error constructor.name on LLM failure", () => {
  it("research throws Error → research_error === 'Error'", async () => {
    // We supply research_input directly (backward-compat hatch) so research definitely runs
    const RESEARCH_INPUT = {
      company_name: "Acme Corp",
      role_title: "PM",
      industry_hints: ["SaaS"],
    };

    const errorLLM: LLMProvider = {
      chat: async () => ({ content: "" }),
      chatStream: async function* () {},
      generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
        if (req.schema === ParseResultPayloadSchema) {
          return ParseResultPayloadSchema.parse({}) as unknown as T;
        }
        // All other schemas (research) → throw
        throw new Error("LLMNetworkError");
      },
    } as unknown as LLMProvider;

    const graph = buildIntakeGraph({ llm: errorLLM });
    const result = await graph.invoke({
      resume_text: "resume",
      jd_text: "jd",
      research_opt_in: true,
      research_input: RESEARCH_INPUT,
      framework_config: null,
    });

    expect(result.research_error).toBe("Error");
    expect(result.research_skipped).toBe(true);
    expect(result.research_payload).toBeNull();
  });

  it("research throws TypeError → research_error === 'TypeError'", async () => {
    const RESEARCH_INPUT = {
      company_name: "Acme Corp",
      role_title: "PM",
      industry_hints: ["SaaS"],
    };

    const errorLLM: LLMProvider = {
      chat: async () => ({ content: "" }),
      chatStream: async function* () {},
      generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
        if (req.schema === ParseResultPayloadSchema) {
          return ParseResultPayloadSchema.parse({}) as unknown as T;
        }
        throw new TypeError("Unexpected token");
      },
    } as unknown as LLMProvider;

    const graph = buildIntakeGraph({ llm: errorLLM });
    const result = await graph.invoke({
      resume_text: "resume",
      jd_text: "jd",
      research_opt_in: true,
      research_input: RESEARCH_INPUT,
      framework_config: null,
    });

    expect(result.research_error).toBe("TypeError");
    expect(result.research_skipped).toBe(true);
  });
});
