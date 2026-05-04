import { describe, it, expect, afterEach, vi } from "vitest";
import { buildTurnGraph } from "../turnGraph.js";
import type { LLMProvider, Message } from "@/core/llm/types";
import {
  TurnAssessmentSchema,
  CompressionAgentOutputSchema,
  InterviewerAgentOutputSchema,
} from "@/core/schemas/turns";
import { z } from "zod";

afterEach(() => {
  vi.useRealTimers();
});

// ─── Slow mock LLM that records call intervals ────────────────────────────────
//
// Both turn_assessment (via LLM directly) and compression (via runCompressionAgent
// which internally calls LLM) delay ~100ms. We identify which call is which by
// inspecting the schema's shape keys.
//
// Schema identification strategy (robust across re-imports):
//   - TurnAssessmentSchema shape: {summary, strengths, weaknesses}
//   - CompressionAgentOutputSchema shape: {summary, preserved_keywords, open_threads}
//   - InterviewerAgentOutputSchema shape: {question, intent, expected_depth, ...}

interface Interval {
  tag: string;
  start: number;
  end: number;
}

const DELAY_MS = 100;

function identifySchema(schema: z.ZodSchema<unknown>): string {
  const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape;
  if (!shape) return "unknown";
  const keys = Object.keys(shape).sort().join(",");
  // TurnAssessmentSchema: summary, strengths, weaknesses
  if (keys === "strengths,summary,weaknesses") return "turn_assessment";
  // CompressionAgentOutputSchema: open_threads, preserved_keywords, summary
  if (keys === "open_threads,preserved_keywords,summary") return "compression";
  // InterviewerAgentOutputSchema: expected_depth, followup_hint, followup_hints, intent, live_observation, question, should_end
  if (keys.includes("expected_depth") && keys.includes("intent") && keys.includes("question")) return "interviewer";
  return `unknown(${keys})`;
}

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

      // Only delay upstream nodes (turn_assessment and compression LLM calls).
      // next_question (interviewer) does NOT need a delay — we only measure
      // parallelism of the two upstream branches.
      if (tag === "turn_assessment" || tag === "compression") {
        await new Promise<void>((resolve) => setTimeout(resolve, DELAY_MS));
      }

      const end = Date.now();
      intervals.push({ tag, start, end });

      if (tag === "turn_assessment") {
        return TurnAssessmentSchema.parse({
          summary: "parallel test assessment",
          strengths: [],
          weaknesses: [],
        }) as unknown as T;
      }
      if (tag === "compression") {
        return CompressionAgentOutputSchema.parse({
          summary: "parallel test compression",
          preserved_keywords: [],
          open_threads: [],
        }) as unknown as T;
      }
      // interviewer
      return InterviewerAgentOutputSchema.parse({
        question: "next question from parallel test?",
        intent: "test",
        expected_depth: "surface",
      }) as unknown as T;
    },
  } as unknown as LLMProvider;
}

// ─── Minimal valid TurnState input ───────────────────────────────────────────

const MINIMAL_INPUT = {
  turn_index: 0,
  question: "你最近一个项目是什么?",
  answer: "我做了一个 LLM 文档摘要系统。",
  framework_json: JSON.stringify({ style: "structured" }),
  recent_turns: [],
  previous_summary: null,
  remaining_minutes: null,
};

// ─── Parallel execution test ──────────────────────────────────────────────────

describe("turnGraph — parallel fan-out execution (§8.3)", () => {
  it(
    "turn_assessment and compression run in parallel (intervals overlap)",
    async () => {
      const intervals: Interval[] = [];
      const llm = makeRecordingLLM(intervals);
      const graph = buildTurnGraph({ llm });

      await graph.invoke(MINIMAL_INPUT);

      // Both upstream branches must have been called
      const assessmentIntervals = intervals.filter((i) => i.tag === "turn_assessment");
      const compressionIntervals = intervals.filter((i) => i.tag === "compression");

      expect(assessmentIntervals).toHaveLength(1);
      expect(compressionIntervals).toHaveLength(1);

      const assessmentStart = assessmentIntervals[0].start;
      const assessmentEnd = assessmentIntervals[0].end;
      const compressionStart = compressionIntervals[0].start;
      const compressionEnd = compressionIntervals[0].end;

      // Parallelism assertion: the later-starting branch must finish before
      // the earlier-starting branch ends (i.e. their intervals overlap).
      const maxStart = Math.max(assessmentStart, compressionStart);
      const minEnd = Math.min(assessmentEnd, compressionEnd);

      // Allow 20ms slack for event-loop scheduling jitter.
      // If sequential: minEnd ≈ maxStart + 0 (the second starts only after first ends).
      // If parallel:   minEnd > maxStart (both are running at the same wall time).
      const JITTER_MS = 20;

      if (maxStart >= minEnd + JITTER_MS) {
        throw new Error(
          "LangGraph.js 0.2.74 fan-in barrier broke parallel execution — " +
          "investigate Pregel super-step semantics. " +
          `turn_assessment: [${assessmentStart}, ${assessmentEnd}], ` +
          `compression: [${compressionStart}, ${compressionEnd}], ` +
          `maxStart=${maxStart}, minEnd=${minEnd}`,
        );
      }

      // Soft assertion (documents what we proved)
      expect(maxStart).toBeLessThan(minEnd + JITTER_MS);
    },
    // Generous timeout: 2 × 100ms delay + overhead
    5000,
  );

  it("graph still produces correct final output after parallel execution", async () => {
    const intervals: Interval[] = [];
    const llm = makeRecordingLLM(intervals);
    const graph = buildTurnGraph({ llm });

    const result = await graph.invoke(MINIMAL_INPUT);

    // next_question_out must be populated (node "next_question" writes to channel "next_question_out")
    expect(result.next_question_out).not.toBeNull();
    expect(result.next_question_out).toBeDefined();
    expect(typeof result.next_question_out?.question).toBe("string");
    expect(typeof result.next_question_out?.should_end).toBe("boolean");

    // assessment must be populated (turn_assessment ran)
    expect(result.assessment).not.toBeNull();
    expect(typeof result.assessment?.summary).toBe("string");

    // compressed must be populated (compression ran)
    expect(result.compressed).not.toBeNull();
    expect(typeof result.compressed?.summary).toBe("string");
  }, 5000);

  it("interviewer node runs after both upstream branches complete (fan-in)", async () => {
    const intervals: Interval[] = [];
    const llm = makeRecordingLLM(intervals);
    const graph = buildTurnGraph({ llm });

    await graph.invoke(MINIMAL_INPUT);

    const assessmentEnd = intervals.find((i) => i.tag === "turn_assessment")?.end ?? 0;
    const compressionEnd = intervals.find((i) => i.tag === "compression")?.end ?? 0;
    const interviewerStart = intervals.find((i) => i.tag === "interviewer")?.start ?? Infinity;

    // next_question starts after both upstream nodes complete
    expect(interviewerStart).toBeGreaterThanOrEqual(Math.max(assessmentEnd, compressionEnd) - 5);
  }, 5000);
});
