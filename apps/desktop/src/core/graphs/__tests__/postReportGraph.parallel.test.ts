/**
 * postReportGraph.parallel.test.ts — parallel fan-out + error isolation tests.
 *
 * File location: core/graphs/__tests__/ — overrides spec's src/__tests__/ to
 * match the existing layout of turnGraph.parallel.test.ts (M3.3.1 pattern).
 *
 * Covers:
 *   - Parallel test 1: coach + reflection intervals overlap (interval-overlap)
 *   - Parallel test 2: graph state populates both branches after parallel execution
 *   - Error isolation Case A: coach throws, reflection succeeds
 *   - Error isolation Case B: reflection throws, coach succeeds
 *   - Error isolation Case C: both throw, graph still resolves
 *   - ZodError swallow: coach_input with PII (resume_text) → coach_error="ZodError"
 *   - post_report_coach_node_unhandled WARN log emitted on error path
 */

import { describe, it, expect, vi } from "vitest";
import { buildPostReportGraph } from "../postReportGraph.js";
import type { LLMProvider, Message } from "@/core/llm/types";
import { _LLMCoachOutputSchema } from "@/core/schemas/coach";
import { _LLMReflectionOutputSchema } from "@/core/schemas/reflection";
import { z } from "zod";

// ─── Schema identification (by shape, NOT reference equality) ─────────────────
// Shape-key inspection is robust across re-imports; reference equality can
// silently fail when the vitest module cache differs between test files.

function identifySchema(schema: z.ZodSchema<unknown>): "coach" | "reflection" | "unknown" {
  const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape;
  if (!shape) return "unknown";
  if ("headline" in shape) return "coach";
  if ("executive_summary" in shape) return "reflection";
  return "unknown";
}

// ─── Interval recording types ─────────────────────────────────────────────────

interface Interval {
  tag: "coach" | "reflection" | "unknown";
  start: number;
  end: number;
}

const DELAY_MS = 100;
const JITTER_MS = 20;

// ─── Slow recording mock LLM ──────────────────────────────────────────────────
// 100ms delay per call. Identifies schema by shape (NOT reference equality).

function makeRecordingLLM(intervals: Interval[]): LLMProvider {
  return {
    chat: async () => ({ content: "" }),
    chatStream: async function* () {},
    generateObject: async <T>(req: {
      schema: z.ZodSchema<T>;
      messages: Message[];
      model?: string;
    }): Promise<T> => {
      const tag = identifySchema(req.schema);
      const start = Date.now();

      await new Promise<void>((resolve) => setTimeout(resolve, DELAY_MS));

      const end = Date.now();
      intervals.push({ tag, start, end });

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
      throw new Error(`Unexpected schema in recording LLM: tag=${tag}`);
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

// ─── Parallel execution tests ─────────────────────────────────────────────────

describe("postReportGraph — parallel fan-out execution (§11.1)", () => {
  it(
    "coach_node and reflection_node run in parallel (intervals overlap)",
    async () => {
      const intervals: Interval[] = [];
      const graph = buildPostReportGraph({ llm: makeRecordingLLM(intervals) });

      await graph.invoke(MINIMAL_INVOKE_INPUT);

      const coachIntervals = intervals.filter((i) => i.tag === "coach");
      const reflectionIntervals = intervals.filter((i) => i.tag === "reflection");

      expect(coachIntervals).toHaveLength(1);
      expect(reflectionIntervals).toHaveLength(1);

      const coachStart = coachIntervals[0].start;
      const coachEnd = coachIntervals[0].end;
      const reflectionStart = reflectionIntervals[0].start;
      const reflectionEnd = reflectionIntervals[0].end;

      // Parallelism: later-starting branch must finish before earlier-starting ends
      const maxStart = Math.max(coachStart, reflectionStart);
      const minEnd = Math.min(coachEnd, reflectionEnd);

      if (maxStart >= minEnd + JITTER_MS) {
        throw new Error(
          "LangGraph.js 0.2.74 broke parallel fan-out from START — investigate Pregel scheduling. " +
            `coach: [${coachStart}, ${coachEnd}], ` +
            `reflection: [${reflectionStart}, ${reflectionEnd}], ` +
            `maxStart=${maxStart}, minEnd=${minEnd}`,
        );
      }

      expect(maxStart).toBeLessThan(minEnd + JITTER_MS);
    },
    5000,
  );

  it(
    "graph state populates both branches after parallel execution",
    async () => {
      const intervals: Interval[] = [];
      const graph = buildPostReportGraph({ llm: makeRecordingLLM(intervals) });

      const result = await graph.invoke(MINIMAL_INVOKE_INPUT);

      // Both nodes ran without error
      expect(result.coach_error).toBeNull();
      expect(result.reflection_error).toBeNull();
      expect(result.coach_skipped).toBe(false);

      // Both LLM calls were made
      const coachCalls = intervals.filter((i) => i.tag === "coach");
      const reflectionCalls = intervals.filter((i) => i.tag === "reflection");
      expect(coachCalls).toHaveLength(1);
      expect(reflectionCalls).toHaveLength(1);

      // User/session IDs preserved
      expect(result.user_id).toBe("user-001");
      expect(result.last_session_id).toBe("sess-abc");
    },
    5000,
  );
});

// ─── Error isolation tests ─────────────────────────────────────────────────────

describe("postReportGraph — error isolation (§11.3)", () => {
  it(
    "Case A: coach throws → coach_error set, reflection succeeds, graph never throws",
    async () => {
      const coachError = new Error("CoachLLMFailed");
      coachError.constructor = class CoachLLMFailed extends Error {};
      Object.defineProperty(coachError, "constructor", {
        value: class CoachLLMFailed {},
        configurable: true,
      });

      const errorLLM: LLMProvider = {
        chat: async () => ({ content: "" }),
        chatStream: async function* () {},
        generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
          const tag = identifySchema(req.schema);
          if (tag === "coach") throw new Error("CoachLLMFailed");
          // reflection succeeds
          return _LLMReflectionOutputSchema.parse({
            executive_summary: "建议围绕薄弱维度做专项练习",
            per_question_coaching: [],
            general_growth_advice: "用 STAR 框架重写关键回答",
            mock_followup_dialogue: [],
          }) as unknown as T;
        },
      } as unknown as LLMProvider;

      const graph = buildPostReportGraph({ llm: errorLLM });

      // graph.invoke MUST NOT throw
      let result: Awaited<ReturnType<typeof graph.invoke>> | undefined;
      let threw = false;
      try {
        result = await graph.invoke(MINIMAL_INVOKE_INPUT);
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
      expect(result).toBeDefined();
      expect(result!.coach_error).toBe("Error");
      expect(result!.coach_skipped).toBe(false);
      expect(result!.reflection_error).toBeNull();
    },
    5000,
  );

  it(
    "Case B: reflection throws → reflection_error set, coach succeeds, graph never throws",
    async () => {
      const errorLLM: LLMProvider = {
        chat: async () => ({ content: "" }),
        chatStream: async function* () {},
        generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
          const tag = identifySchema(req.schema);
          if (tag === "reflection") throw new Error("ReflectionLLMFailed");
          // coach succeeds
          return _LLMCoachOutputSchema.parse({
            headline: "继续稳步累积",
            headline_detail: "保持练习节奏",
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
        result = await graph.invoke(MINIMAL_INVOKE_INPUT);
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
      expect(result).toBeDefined();
      expect(result!.reflection_error).toBe("Error");
      expect(result!.coach_error).toBeNull();
      expect(result!.coach_skipped).toBe(false);
    },
    5000,
  );

  it(
    "Case C: both throw → both errors set, graph still resolves and NEVER throws",
    async () => {
      const errorLLM: LLMProvider = {
        chat: async () => ({ content: "" }),
        chatStream: async function* () {},
        generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
          const tag = identifySchema(req.schema);
          if (tag === "coach") throw new Error("CoachLLMFailed");
          if (tag === "reflection") throw new Error("ReflectionLLMFailed");
          throw new Error("Unexpected schema");
        },
      } as unknown as LLMProvider;

      const graph = buildPostReportGraph({ llm: errorLLM });

      let result: Awaited<ReturnType<typeof graph.invoke>> | undefined;
      let threw = false;
      try {
        result = await graph.invoke(MINIMAL_INVOKE_INPUT);
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
      expect(result).toBeDefined();
      expect(result!.coach_error).toBe("Error");
      expect(result!.reflection_error).toBe("Error");
      expect(result!.coach_skipped).toBe(false);
    },
    5000,
  );
});

// ─── ZodError swallow test ────────────────────────────────────────────────────

describe("postReportGraph — ZodError swallow (§11.4)", () => {
  it(
    "coach_input with PII (resume_text) → CoachAgentInputSchema.strict rejects → coach_error='ZodError', graph resolves",
    async () => {
      // resume_text is an extra field not allowed by CoachAgentInputSchema.strict()
      // runCoachAgent calls CoachAgentInputSchema.parse(input) which throws ZodError
      const dirtyCoachInput = {
        ...VALID_COACH_INPUT,
        resume_text: "leaked PII content",
      };

      const graph = buildPostReportGraph({ llm: makeRecordingLLM([]) });

      let result: Awaited<ReturnType<typeof graph.invoke>> | undefined;
      let threw = false;
      try {
        result = await graph.invoke({
          ...MINIMAL_INVOKE_INPUT,
          // Type cast needed since extra field is intentionally forbidden
          coach_input: dirtyCoachInput as typeof VALID_COACH_INPUT,
        });
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
      expect(result).toBeDefined();
      expect(result!.coach_error).toBe("ZodError");
      // Reflection is independent — succeeds
      expect(result!.reflection_error).toBeNull();
    },
    5000,
  );
});

// ─── WARN log on error path ───────────────────────────────────────────────────

describe("postReportGraph — WARN log on error path (§11.3 logging)", () => {
  it(
    "post_report_coach_node_unhandled WARN emitted with {reason: errorClassName} when coach throws",
    async () => {
      const warnLogs: Array<[string, Record<string, unknown>?]> = [];
      const logger = {
        info: vi.fn(),
        warn: (msg: string, meta?: Record<string, unknown>) => {
          warnLogs.push([msg, meta]);
        },
      };

      const errorLLM: LLMProvider = {
        chat: async () => ({ content: "" }),
        chatStream: async function* () {},
        generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
          const tag = identifySchema(req.schema);
          if (tag === "coach") throw new Error("LLMNetworkError");
          return _LLMReflectionOutputSchema.parse({
            executive_summary: "建议围绕薄弱维度做专项练习",
            per_question_coaching: [],
            general_growth_advice: "用 STAR 框架重写关键回答",
            mock_followup_dialogue: [],
          }) as unknown as T;
        },
      } as unknown as LLMProvider;

      const graph = buildPostReportGraph({ llm: errorLLM, logger });
      await graph.invoke(MINIMAL_INVOKE_INPUT);

      const warnLog = warnLogs.find(([msg]) => msg === "post_report_coach_node_unhandled");
      expect(warnLog).toBeDefined();
      expect(warnLog![1]).toEqual({ reason: "Error" });
    },
    5000,
  );

  it(
    "post_report_reflection_node_unhandled WARN emitted when reflection throws",
    async () => {
      const warnLogs: Array<[string, Record<string, unknown>?]> = [];
      const logger = {
        info: vi.fn(),
        warn: (msg: string, meta?: Record<string, unknown>) => {
          warnLogs.push([msg, meta]);
        },
      };

      const errorLLM: LLMProvider = {
        chat: async () => ({ content: "" }),
        chatStream: async function* () {},
        generateObject: async <T>(req: { schema: z.ZodSchema<T> }): Promise<T> => {
          const tag = identifySchema(req.schema);
          if (tag === "reflection") throw new Error("LLMNetworkError");
          return _LLMCoachOutputSchema.parse({
            headline: "继续稳步累积",
            headline_detail: "保持练习节奏",
            recurring_weaknesses: [],
            improvement_signals: [],
            next_focus_areas: [],
          }) as unknown as T;
        },
      } as unknown as LLMProvider;

      const graph = buildPostReportGraph({ llm: errorLLM, logger });
      await graph.invoke(MINIMAL_INVOKE_INPUT);

      const warnLog = warnLogs.find(([msg]) => msg === "post_report_reflection_node_unhandled");
      expect(warnLog).toBeDefined();
      expect(warnLog![1]).toEqual({ reason: "Error" });
    },
    5000,
  );
});
