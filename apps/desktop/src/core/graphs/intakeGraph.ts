/**
 * Intake-phase LangGraph (V32.M2.3.4 / F-320 + F-321 + M2.3.X audit fix).
 *
 * Independent graph from `turnGraph.ts`. The two never interleave — turnGraph
 * runs per-turn during the live interview, this one runs once during intake
 * to chain Parse → Research → Framework predict so that downstream UI can
 * show the company / industry / predicted-question cards.
 *
 *   START ──► parse_node ──► research_node ──► predict_questions_node ──► END
 *
 * Sequential rationale (M2.3.X audit-fix):
 *   Research / Predict need company + role + industry-hint signals out of
 *   the JD. Pre-audit we tried to extract these via a regex hand-rolled
 *   inside the assets domain service, which silently always returned None
 *   — so research_node never had a real input and the Research Agent was
 *   never actually called in production. Parse Agent already reads the JD
 *   end-to-end; we now ask it to emit `jd_company_name / jd_role_title /
 *   jd_industry_hints` alongside the rest of its output. research_node
 *   consumes `state.parse_payload.jd_*` to construct its own input, which
 *   forces this to be sequential — research_node MUST run after parse_node
 *   has committed parse_payload.
 *
 * ─── L0 #13 Node-name lock ────────────────────────────────────────────────────
 * The literal triple {"parse_node", "research_node", "predict_questions_node"}
 * is the ONLY allowed spelling. Three-layer enforcement:
 *   ① IntakeGraphNodeName Literal type union (below)
 *   ② INTAKE_GRAPH_NODES = Object.freeze(new Set([...])) runtime constant
 *   ③ Contract test asserts set equality + size 3 + frozen + getGraph().nodes matches
 * Adding a 4th node = immediate L0 red-line violation.
 * Renaming any node = immediate L0 red-line violation.
 *
 * ─── §C3 Secret ban ───────────────────────────────────────────────────────────
 * ZERO process.env / getApiKey() / keychain.read("ark_api_key") access here.
 * All LLM calls go through deps.llm.generateObject(...) via the agent layer.
 *
 * ─── Channel-key vs node-name collision ───────────────────────────────────────
 * No rename needed. Channel keys (parse_payload, research_payload, direction_framework,
 * research_skipped, research_error, research_input, framework_config, resume_text,
 * jd_text, research_opt_in) are ALL different from node names (*_node suffix).
 * Unlike turn_graph's next_question_out rename, NO suffix workaround required here.
 */

import { StateGraph, START, END } from "@langchain/langgraph";
import type { StateGraphArgs } from "@langchain/langgraph";
import {
  ResearchAgentInputSchema,
  type ResearchAgentInput,
  type ResearchAgentOutput,
} from "@/core/schemas/research";
import {
  type FrameworkConfigInput,
  type FrameworkAgentOutput,
} from "@/core/schemas/frameworks";
import { type ParseResultPayload } from "@/core/schemas/parse";
import type { LLMProvider } from "@/core/llm/types";
import { runParseAgent } from "@/core/agents/parse";
import { runResearchAgent } from "@/core/agents/research";
import { runFrameworkAgent } from "@/core/agents/framework";

// §C3: No process.env / getApiKey / keychain access. LLM calls go through deps.llm only.

// ─── L0 #13: Node-name lock — layer ① and ② ─────────────────────────────────
// Modifying this set = immediate L0 red-line violation.

export type IntakeGraphNodeName =
  | "parse_node"
  | "research_node"
  | "predict_questions_node";

export const INTAKE_GRAPH_NODES = Object.freeze(
  new Set(["parse_node", "research_node", "predict_questions_node"] as const),
);

// ─── Constants ───────────────────────────────────────────────────────────────

/** 15s hard timeout for research_node per M3.3.2 spec §5.2. */
export const RESEARCH_TIMEOUT_MS = 15_000;

// ─── IntakeState ─────────────────────────────────────────────────────────────
// TS type alias (NOT Zod schema) — matches turn_graph approach.
// Mirrors Python intake_graph.py IntakeState.

type IntakeState = {
  // ===== Inputs (set before invoke) =====
  resume_text: string;
  jd_text: string;
  research_opt_in: boolean;                         // default false
  research_input: ResearchAgentInput | null;        // backward-compat hatch (tests pre-build)
  framework_config: FrameworkConfigInput | null;    // null ⇒ predict_questions_node no-op

  // ===== Outputs (null until node populates) =====
  parse_payload: ParseResultPayload | null;
  research_payload: ResearchAgentOutput | null;
  research_skipped: boolean;                        // default false
  research_error: string | null;                    // error class name as string, or null
  direction_framework: FrameworkAgentOutput | null;
};

// ─── Channel reducers (§4) ────────────────────────────────────────────────────
// `reducer:` API — supported in LangGraph.js 0.2.74 (same as turnGraph.ts).
// Pattern: last-write-wins with null-passthrough (r ?? l).

const channels: StateGraphArgs<IntakeState>["channels"] = {
  resume_text:         { reducer: (l, r) => r ?? l, default: () => "" },
  jd_text:             { reducer: (l, r) => r ?? l, default: () => "" },
  research_opt_in:     { reducer: (l, r) => r ?? l, default: () => false },
  research_input:      { reducer: (l, r) => r ?? l, default: () => null },
  framework_config:    { reducer: (l, r) => r ?? l, default: () => null },
  parse_payload:       { reducer: (l, r) => r ?? l, default: () => null },
  research_payload:    { reducer: (l, r) => r ?? l, default: () => null },
  research_skipped:    { reducer: (l, r) => r ?? l, default: () => false },
  research_error:      { reducer: (l, r) => r ?? l, default: () => null },
  direction_framework: { reducer: (l, r) => r ?? l, default: () => null },
};

// ─── IntakeGraphDeps ──────────────────────────────────────────────────────────

export interface IntakeGraphDeps {
  llm: LLMProvider;
  logger?: {
    info?(msg: string, meta?: Record<string, unknown>): void;
    warn?(msg: string, meta?: Record<string, unknown>): void;
  };
}

// ─── Nodes ────────────────────────────────────────────────────────────────────

// §5.1 — parse_node: delegates to runParseAgent — no timeout, no soft-skip.
// Parse failure propagates (intake fails). Logger is omitted intentionally:
// runParseAgent's ParseAgentDeps.logger.warn(msg, ...args) uses variadic args,
// while IntakeGraphDeps.logger uses meta?: Record<string, unknown>. Passing
// { llm: deps.llm } only avoids the interface mismatch.
async function parseNode(
  state: IntakeState,
  deps: IntakeGraphDeps,
): Promise<Partial<IntakeState>> {
  const parse_output = await runParseAgent(
    { resume_text: state.resume_text, jd_text: state.jd_text },
    { llm: deps.llm },
  );
  return { parse_payload: parse_output };
}

// §5.2 — research_node: Promise.race + AbortController + Symbol sentinel + 15s timeout.
// 3-way soft-skip: opt_out | insufficient_jd_signal | timeout.
// Logging key lock: research_node_skipped / research_node_timeout / research_node_llm_error.
async function researchNode(
  state: IntakeState,
  deps: IntakeGraphDeps,
): Promise<Partial<IntakeState>> {
  // Step 1: pick research_input — backward-compat slot wins, else derive from parse
  let research_input: ResearchAgentInput | null = state.research_input;
  if (research_input === null) {
    research_input = deriveResearchInputFromParse(state);
  }

  // Step 2: opt-out / no signal ⇒ soft skip
  if (research_input === null) {
    const reason = state.research_opt_in ? "insufficient_jd_signal" : "opt_out";
    deps.logger?.info?.("research_node_skipped", { reason });
    return {
      research_payload: null,
      research_skipped: true,
      research_error: null,
    };
  }

  // Step 3: race runResearchAgent vs 15s timeout
  const controller = new AbortController();
  const timeoutSentinel = Symbol("research_timeout");
  const timeoutPromise = new Promise<typeof timeoutSentinel>((resolve) => {
    setTimeout(() => {
      controller.abort();
      resolve(timeoutSentinel);
    }, RESEARCH_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([
      runResearchAgent(research_input, { llm: deps.llm }),
      timeoutPromise,
    ]);
    if (result === timeoutSentinel) {
      deps.logger?.info?.("research_node_timeout");
      return {
        research_payload: null,
        research_skipped: true,
        research_error: "timeout",
      };
    }
    return {
      research_payload: result,
      research_skipped: false,
      research_error: null,
    };
  } catch (err) {
    const errorName = (err as Error)?.constructor?.name ?? "Error";
    deps.logger?.info?.("research_node_llm_error", { reason: errorName });
    return {
      research_payload: null,
      research_skipped: true,
      research_error: errorName,
    };
  }
}

// §5.3 — deriveResearchInputFromParse: exported for unit tests.
// §A11 PII guard: uses ResearchAgentInputSchema.safeParse to filter;
// never passes raw company_name / role_title to logs (cache_key hash used inside runResearchAgent).
export function deriveResearchInputFromParse(
  state: IntakeState,
): ResearchAgentInput | null {
  if (!state.research_opt_in) return null;
  const payload = state.parse_payload;
  if (payload === null) return null;
  const company = (payload.jd_company_name ?? "").trim();
  const role = (payload.jd_role_title ?? "").trim();
  if (!company || !role) return null;
  let hints = (payload.jd_industry_hints ?? [])
    .map((h) => h.trim())
    .filter((h) => h.length > 0);
  if (hints.length === 0) hints = [role];
  const result = ResearchAgentInputSchema.safeParse({
    company_name: company.slice(0, 80),
    role_title: role.slice(0, 80),
    industry_hints: hints.slice(0, 5),
  });
  return result.success ? result.data : null;
}

// §5.4 — predict_questions_node: double-skip guard + Framework + soft-skip on error.
// Logging key: predict_questions_node_framework_error + {reason: errorClassName}.
async function predictQuestionsNode(
  state: IntakeState,
  deps: IntakeGraphDeps,
): Promise<Partial<IntakeState>> {
  if (state.framework_config === null || state.parse_payload === null) {
    return { direction_framework: null };
  }

  const research_payload_json: string | null =
    state.research_payload !== null
      ? JSON.stringify(state.research_payload)
      : null;

  const framework_input = {
    parse_payload_json: JSON.stringify(state.parse_payload),
    config: state.framework_config,
    research_payload_json,
  };

  try {
    const framework_output = await runFrameworkAgent(framework_input, { llm: deps.llm });
    return { direction_framework: framework_output };
  } catch (err) {
    const errorName = (err as Error)?.constructor?.name ?? "Error";
    deps.logger?.info?.("predict_questions_node_framework_error", { reason: errorName });
    return { direction_framework: null };
  }
}

// ─── buildIntakeGraph factory ─────────────────────────────────────────────────
// §6.2 — 4 edges, strictly sequential, NO fan-out.
// START→parse_node→research_node→predict_questions_node→END

export function buildIntakeGraph(deps: IntakeGraphDeps) {
  const graph = new StateGraph<IntakeState>({ channels })
    .addNode("parse_node",             (s) => parseNode(s, deps))
    .addNode("research_node",          (s) => researchNode(s, deps))
    .addNode("predict_questions_node", (s) => predictQuestionsNode(s, deps))
    .addEdge(START, "parse_node")
    .addEdge("parse_node", "research_node")
    .addEdge("research_node", "predict_questions_node")
    .addEdge("predict_questions_node", END);
  return graph.compile();
}
