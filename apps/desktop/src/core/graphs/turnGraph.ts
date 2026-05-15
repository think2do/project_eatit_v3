import { StateGraph, START, END } from "@langchain/langgraph";
import type { StateGraphArgs } from "@langchain/langgraph";
import {
  TurnAssessmentSchema,
  type TurnState as _TurnStateFromSchemas,
  type TurnAssessment,
  type CompressionAgentOutput,
  type InterviewerAgentOutput,
  type TurnRecord,
  type CompressionTurn,
} from "@/core/schemas/turns";
import type { LLMProvider } from "@/core/llm/types";
import { runCompressionAgent } from "@/core/agents/compression";
import { runInterviewerAgent } from "@/core/agents/interviewer";
import { getConfiguredModel } from "@/core/llm/configuredModel";

// §C3: No process.env / getApiKey / keychain access. LLM calls go through deps.llm only.

// ─── L0 #13: Node-name lock ──────────────────────────────────────────────────
// Three layers: ① TS literal type, ② frozen Set runtime, ③ contract test assertion.
// Modifying this set = immediate L0 red line violation.

export type TurnGraphNodeName = "turn_assessment" | "compression" | "next_question";

export const TURN_GRAPH_NODES = Object.freeze(
  new Set(["turn_assessment", "compression", "next_question"] as const),
);

// ─── TurnState ───────────────────────────────────────────────────────────────
// Mirrors apps/api/app/orchestrator/state.py TurnState.
// Types imported from @/core/schemas/turns (appended by M3.3.1.dev.a).
//
// JUDGMENT CALL: LangGraph.js 0.2.74 rejects a node name that matches a channel
// key (error: "already being used as a state attribute, cannot also be used as a
// node name"). Python LangGraph has no such restriction. Since L0 #13 locks the
// node name to "next_question" and we cannot rename the node, we use the channel
// key "next_question_out" for the state slot that carries the InterviewerAgentOutput.
// This is a JS-only implementation detail; externally the compiled graph node is
// still named "next_question" per L0 lock.

type TurnState = {
  turn_index: number;
  question: string;
  answer: string;
  framework_json: string;
  recent_turns: TurnRecord[];
  previous_summary?: string | null;
  remaining_minutes?: number | null;
  assessment?: TurnAssessment | null;
  compressed?: CompressionAgentOutput | null;
  next_question_out?: InterviewerAgentOutput | null;
};

// ─── Channel reducers (§4) ───────────────────────────────────────────────────
// `reducer:` API — supported in LangGraph.js 0.2.74 (see annotation.d.ts SingleReducer type).
// The deprecated `value:` alternative is used only in the older _smoke.ts (M3.1.3).

const channels: StateGraphArgs<TurnState>["channels"] = {
  turn_index:        { reducer: (l, r) => r ?? l, default: () => 0 },
  question:          { reducer: (l, r) => r ?? l, default: () => "" },
  answer:            { reducer: (l, r) => r ?? l, default: () => "" },
  framework_json:    { reducer: (l, r) => r ?? l, default: () => "" },
  recent_turns:      { reducer: (l, r) => r ?? l, default: () => [] },
  previous_summary:  { reducer: (l, r) => r ?? l, default: () => null },
  remaining_minutes: { reducer: (l, r) => r ?? l, default: () => null },
  assessment:        { reducer: (l, r) => r ?? l, default: () => null },
  compressed:        { reducer: (l, r) => r ?? l, default: () => null },
  // "next_question_out" instead of "next_question" — see JUDGMENT CALL comment above.
  next_question_out: { reducer: (l, r) => r ?? l, default: () => null },
};

// ─── TurnGraphDeps ───────────────────────────────────────────────────────────

export interface TurnGraphDeps {
  llm: LLMProvider;
  logger?: {
    info?(msg: string, meta?: Record<string, unknown>): void;
    warn?(msg: string, meta?: Record<string, unknown>): void;
  };
}

// ─── System prompts ──────────────────────────────────────────────────────────
// MUST match Python turn_graph.py lines 100-104 character-for-character.

const TURN_ASSESSMENT_SYSTEM =
  "你是面试复盘助理。对候选人在单轮问答里的表现做简短打点:" +
  "用一句 30 字以内的 summary,再各列 1~3 条 strengths 与 weaknesses。" +
  "只输出 JSON,不要解释。";

// ─── Nodes ───────────────────────────────────────────────────────────────────

// §5.1 — inline-Instructor turn_assessment node
async function turnAssessmentNode(state: TurnState, deps: TurnGraphDeps): Promise<Partial<TurnState>> {
  const assessment = await deps.llm.generateObject({
    schema: TurnAssessmentSchema,
    messages: [
      { role: "system", content: TURN_ASSESSMENT_SYSTEM },
      { role: "user", content: `问题:${state.question}\n候选人作答:${state.answer}` },
    ],
    model: await getConfiguredModel(),
  });
  return { assessment };
}

// §5.2 — delegates to runCompressionAgent (already has 3s timeout — do NOT wrap a second timeout)
// CompressionTurnSchema.strict() only allows {question, answer} — do NOT pass assessment here.
async function compressionNode(state: TurnState, deps: TurnGraphDeps): Promise<Partial<TurnState>> {
  const turns: CompressionTurn[] = [
    ...state.recent_turns.map((t) => ({ question: t.question, answer: t.answer })),
    { question: state.question, answer: state.answer },
  ];
  const compressed = await runCompressionAgent(
    { previous_summary: state.previous_summary ?? null, turns },
    { llm: deps.llm, logger: deps.logger as { warn(msg: string, ...args: unknown[]): void } | undefined },
  );
  return { compressed };
}

// §5.3 — Interviewer + budget guard
// Budget guard mirrors Python turn_graph.py lines 184-194.
async function nextQuestionNode(state: TurnState, deps: TurnGraphDeps): Promise<Partial<TurnState>> {
  const currentTurn: TurnRecord = {
    question: state.question,
    answer: state.answer,
    assessment: state.assessment ? { summary: state.assessment.summary } : null,
  };
  const long_term_summary = state.compressed?.summary ?? state.previous_summary ?? null;

  let next_q = await runInterviewerAgent(
    {
      framework_json: state.framework_json,
      recent_turns: [...state.recent_turns, currentTurn],
      long_term_summary,
      remaining_minutes: state.remaining_minutes ?? null,
    },
    { llm: deps.llm },
  );

  // Budget guard — mirrors Python turn_graph.py lines 184-194
  const budget = totalQuestionBudget(state.framework_json);
  if (budget !== undefined && !next_q.should_end && state.turn_index + 1 >= budget) {
    deps.logger?.info?.("interviewer.budget_guard", {
      answered: state.turn_index + 1,
      budget,
      forced_should_end: true,
    });
    next_q = { ...next_q, should_end: true };
  }
  return { next_question_out: next_q };
}

// ─── totalQuestionBudget ─────────────────────────────────────────────────────
// Line-for-line port of Python _total_question_budget (turn_graph.py lines 47-98).
// Exported for unit tests.

export function totalQuestionBudget(framework_json: string): number | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(framework_json);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const fw = parsed as Record<string, unknown>;

  // Shape 1: legacy DirectionFramework with explicit `stages`
  const stages = fw.stages;
  if (Array.isArray(stages) && stages.length > 0) {
    let total = 0;
    for (const stage of stages) {
      if (typeof stage !== "object" || stage === null) continue;
      const budget = (stage as Record<string, unknown>).question_budget;
      if (typeof budget === "number" && Number.isInteger(budget) && budget > 0) {
        total += budget;
      }
    }
    if (total > 0) return total;
  }

  // Shape 2: v3.2 agent output with pace_plan.segments[*].rough_minutes
  const pace_plan = fw.pace_plan;
  if (typeof pace_plan === "object" && pace_plan !== null) {
    const segments = (pace_plan as Record<string, unknown>).segments;
    if (Array.isArray(segments) && segments.length > 0) {
      let total = 0;
      for (const seg of segments) {
        if (typeof seg !== "object" || seg === null) continue;
        const rough = (seg as Record<string, unknown>).rough_minutes;
        if (typeof rough === "number" && Number.isInteger(rough) && rough > 0) {
          total += Math.max(1, Math.floor(rough / 3));
        }
      }
      if (total > 0) return total;
    }
  }

  return undefined;
}

// ─── buildTurnGraph ──────────────────────────────────────────────────────────
// §6.2 — five edges: START→turn_assessment, START→compression (fan-out),
//         turn_assessment→next_question, compression→next_question (fan-in),
//         next_question→END.
// Mirrors Python turn_graph.py lines 197-206.

export function buildTurnGraph(deps: TurnGraphDeps) {
  const graph = new StateGraph<TurnState>({ channels })
    .addNode("turn_assessment", (s) => turnAssessmentNode(s, deps))
    .addNode("compression",     (s) => compressionNode(s, deps))
    .addNode("next_question",   (s) => nextQuestionNode(s, deps))
    .addEdge(START, "turn_assessment")
    .addEdge(START, "compression")
    .addEdge("turn_assessment", "next_question")
    .addEdge("compression",     "next_question")
    .addEdge("next_question", END);
  return graph.compile();
}
