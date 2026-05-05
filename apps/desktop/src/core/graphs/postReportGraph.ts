/**
 * Post-report LangGraph (V32.M3.1.2 + V32.M3.2.2 / F-318 + F-322).
 *
 * Independent of `turn_graph` (per L0 A7) and of `intake_graph`. Runs
 * **after** `InterviewReport.status` reaches `ready` to fan out
 * post-report agents that don't belong on the critical interview path:
 *
 *   M3.2.2 (current):
 *       START ──┬─► coach_node ─────────┬──► END
 *               └─► reflection_node ────┘
 *
 * The two nodes are independent — Coach is keyed on user, Reflection is
 * keyed on session — so LangGraph schedules them concurrently. Each node
 * delegates to a domain service that owns retries, persistence, and
 * idempotency; failures inside one never starve the other.
 *
 * Node-name set is locked by `__tests__/postReportGraph.contract.test.ts`
 * (L0 #13 guard, mirroring `turnGraph.contract.test.ts` /
 * `intakeGraph.contract.test.ts`). Drift here breaks CI immediately.
 *
 * ─── L0 #13 Node-name lock ───────────────────────────────────────────────────
 * The literal pair {"coach_node", "reflection_node"} is the ONLY allowed
 * spelling. Three-layer enforcement:
 *   ① PostReportGraphNodeName Literal type union (below)
 *   ② POST_REPORT_GRAPH_NODES = Object.freeze(new Set([...])) runtime
 *   ③ Contract test asserts set equality + size 2 + frozen + getGraph().nodes matches
 * Adding a 3rd node = immediate L0 red-line violation.
 * Renaming any node = immediate L0 red-line violation.
 *
 * ─── §C3 Secret ban ──────────────────────────────────────────────────────────
 * ZERO process.env / getApiKey() / keychain.read("ark_api_key") access here.
 * All LLM calls go through deps.llm.generateObject(...) via the agent layer.
 * Forbidden: process.env.ARK_API_KEY / getApiKey / keychain.read("ark_api_key")
 *
 * ─── Fire-and-forget契约 ──────────────────────────────────────────────────────
 * graph internally awaits both nodes; UI caller (M3.4) does:
 *   void buildPostReportGraph(deps).invoke(state).catch(noop)
 * without awaiting — graph.invoke NEVER throws (errors flow to channels).
 * coach_error / reflection_error carry error class name strings on failure.
 * This is the basis of the fire-and-forget UI contract.
 *
 * ─── Channel-key vs node-name disjoint ───────────────────────────────────────
 * PostReportState fields (user_id / last_session_id / coach_input /
 * reflection_input / coach_skipped / coach_error / reflection_error) are
 * ALL distinct from node names (coach_node / reflection_node).
 * No `_out` rename workaround needed (unlike turn_graph's next_question_out).
 */

import { StateGraph, START, END } from "@langchain/langgraph";
import type { StateGraphArgs } from "@langchain/langgraph";
import type { CoachAgentInput } from "@/core/schemas/coach";
import type { ReflectionAgentInput } from "@/core/schemas/reflection";
import type { LLMProvider } from "@/core/llm/types";
import { runCoachAgent } from "@/core/agents/coach";
import { runReflectionAgent } from "@/core/agents/reflection";

// §C3: No process.env / getApiKey / keychain access. LLM calls go through deps.llm only.

// ─── L0 #13: Node-name lock — layer ① and ② ─────────────────────────────────
// Modifying this set = immediate L0 red-line violation.

export type PostReportGraphNodeName = "coach_node" | "reflection_node";

export const POST_REPORT_GRAPH_NODES = Object.freeze(
  new Set(["coach_node", "reflection_node"] as const),
);

// ─── PostReportState ──────────────────────────────────────────────────────────
// TS type alias (NOT Zod schema) — matches turn_graph / intake_graph approach.
// Mirrors Python post_report_graph.py PostReportState.

type PostReportState = {
  // ===== Inputs (set before invoke) — Python PostReportState fields =====
  user_id: string;
  last_session_id: string;

  // ===== Inputs (set before invoke) — TS port additions, see §3.5 =====
  coach_input: CoachAgentInput | null;           // null ⇒ coach_node soft-skips
  reflection_input: ReflectionAgentInput | null; // null ⇒ reflection_node soft-skips

  // ===== Outputs (node populates) — Python triage signal fields =====
  coach_skipped: boolean;          // default false
  coach_error: string | null;      // error class name string, or null
  reflection_error: string | null; // error class name string, or null
};

// ─── Channel reducers (§4) ────────────────────────────────────────────────────
// `reducer:` API — supported in LangGraph.js 0.2.74 (same as turnGraph.ts / intakeGraph.ts).
// Pattern: last-write-wins with null-passthrough (r ?? l).

const channels: StateGraphArgs<PostReportState>["channels"] = {
  user_id:          { reducer: (l, r) => r ?? l, default: () => "" },
  last_session_id:  { reducer: (l, r) => r ?? l, default: () => "" },
  coach_input:      { reducer: (l, r) => r ?? l, default: () => null },
  reflection_input: { reducer: (l, r) => r ?? l, default: () => null },
  coach_skipped:    { reducer: (l, r) => r ?? l, default: () => false },
  coach_error:      { reducer: (l, r) => r ?? l, default: () => null },
  reflection_error: { reducer: (l, r) => r ?? l, default: () => null },
};

// ─── PostReportGraphDeps ──────────────────────────────────────────────────────

export interface PostReportGraphDeps {
  llm: LLMProvider;
  logger?: {
    info?(msg: string, meta?: Record<string, unknown>): void;
    warn?(msg: string, meta?: Record<string, unknown>): void;
  };
}

// ─── Nodes ────────────────────────────────────────────────────────────────────

// §5.1 — coachNode: try/catch swallow + soft-skip on null input.
// Failure in coach_node MUST NOT affect reflection_node. Errors only write coach_error.
// Locked logging keys: post_report_coach_node_skipped / post_report_coach_node_unhandled.
async function coachNode(
  state: PostReportState,
  deps: PostReportGraphDeps,
): Promise<Partial<PostReportState>> {
  // Caller didn't supply input ⇒ skip (not an error)
  if (state.coach_input === null) {
    deps.logger?.info?.("post_report_coach_node_skipped", { reason: "no_input" });
    return { coach_skipped: true, coach_error: null };
  }

  try {
    await runCoachAgent(state.coach_input, { llm: deps.llm });
    return { coach_skipped: false, coach_error: null };
  } catch (err) {
    const errorName = (err as Error)?.constructor?.name ?? "Error";
    deps.logger?.warn?.("post_report_coach_node_unhandled", { reason: errorName });
    return { coach_skipped: false, coach_error: errorName };
  }
}

// §5.2 — reflectionNode: symmetric to coachNode.
// Failure in reflection_node MUST NOT affect coach_node. Errors only write reflection_error.
// coach_skipped NOT written here — only coachNode writes that channel.
// Locked logging keys: post_report_reflection_node_skipped / post_report_reflection_node_unhandled.
async function reflectionNode(
  state: PostReportState,
  deps: PostReportGraphDeps,
): Promise<Partial<PostReportState>> {
  // Caller didn't supply input ⇒ skip; reflection_error stays null (not a true error)
  if (state.reflection_input === null) {
    deps.logger?.info?.("post_report_reflection_node_skipped", { reason: "no_input" });
    return { reflection_error: null };
  }

  try {
    await runReflectionAgent(state.reflection_input, { llm: deps.llm });
    return { reflection_error: null };
  } catch (err) {
    const errorName = (err as Error)?.constructor?.name ?? "Error";
    deps.logger?.warn?.("post_report_reflection_node_unhandled", { reason: errorName });
    return { reflection_error: errorName };
  }
}

// ─── buildPostReportGraph factory ─────────────────────────────────────────────
// §6.2 — 4 edges: parallel fan-out from START, NO fan-in node.
// START→coach_node→END, START→reflection_node→END (both direct, concurrent).
// Mirrors Python post_report_graph.py topology.

export function buildPostReportGraph(deps: PostReportGraphDeps) {
  const graph = new StateGraph<PostReportState>({ channels })
    .addNode("coach_node",      (s) => coachNode(s, deps))
    .addNode("reflection_node", (s) => reflectionNode(s, deps))
    .addEdge(START, "coach_node")
    .addEdge(START, "reflection_node")
    .addEdge("coach_node", END)
    .addEdge("reflection_node", END);
  return graph.compile();
}
