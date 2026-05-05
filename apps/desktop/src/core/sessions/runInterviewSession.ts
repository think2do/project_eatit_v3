/**
 * runInterviewSession — AsyncGenerator core for local interview sessions.
 *
 * Replaces the v3.3 WebSocket effect in InterviewPage. Drives the interview loop
 * via turnGraph + observer/reference side-channels, yielding structured events
 * for the UI to consume. No network round-trips besides those already made by
 * LLMGateway / ASRGateway.
 *
 * §A0 / §A0.4: secrets stay Swift-side. This generator never sees api_key.
 * §A11: agent input schemas are .strict(); we pass only schema-permitted fields.
 * §L0 #13: buildTurnGraph / buildPostReportGraph node names are not renamed.
 */

import { llm } from "@/core/llm";
import { runInterviewerAgent } from "@/core/agents/interviewer";
import { runObserverAgent } from "@/core/agents/observer";
import { runReferenceAgent } from "@/core/agents/reference";
import { buildTurnGraph } from "@/core/graphs/turnGraph";
import { buildPostReportGraph } from "@/core/graphs/postReportGraph";
import type { InterviewerAgentOutput, TurnAssessment, TurnRecord } from "@/core/schemas/turns";
import type { ObserverAgentOutput } from "@/core/schemas/turns";
import type { ReferenceAgentOutput } from "@/core/schemas/turns";
import type { ParseOutput } from "@/core/schemas/parse";

// ─── Public input / event types ──────────────────────────────────────────────

/**
 * Initial context passed to runInterviewSession.
 * §A0.4: api_key is deliberately absent — LLM calls go through deps.llm (Bridge → Swift Keychain).
 */
export interface RunInterviewSessionInput {
  sessionId: string;
  llmConfigMeta: { provider: string; model: string; base_url?: string | null };
  frameworkJson: string;
  /** Parsed parse_results.payload — provides candidate/JD context to agents. */
  parseSummary: ParseOutput;
  durationMinutes: number;
}

/**
 * Events yielded by runInterviewSession.
 * Payload types align with v3.3 SERVER_* event shapes for backward compatibility
 * with the interview-machine statechart dispatch.
 */
export type InterviewSessionEvent =
  | { type: "question.generated"; payload: InterviewerAgentOutput }
  | { type: "turn.assessed"; payload: TurnAssessment }
  | { type: "coach.observation"; payload: ObserverAgentOutput }
  | { type: "reference.ready"; payload: ReferenceAgentOutput }
  | { type: "session.ended"; payload: { reason: "user-end" | "budget-exhausted" } }
  | { type: "error"; payload: { code: string; message: string } };

/**
 * Messages the UI pushes into the generator via AsyncQueue.iter().
 */
export type InterviewSessionInput =
  | { type: "answer.submitted"; text: string; turnIndex: number }
  | { type: "session.end" };

// ─── AsyncQueue helper ────────────────────────────────────────────────────────

/**
 * Bidirectional async queue. UI calls push() to send inputs;
 * the generator consumes them via iter().
 *
 * createAsyncQueue<T>() — exported for use in InterviewPage (PR.c2).
 */
export interface AsyncQueue<T> {
  push(value: T): void;
  close(): void;
  iter(): AsyncIterable<T>;
}

export function createAsyncQueue<T>(): AsyncQueue<T> {
  const buffer: T[] = [];
  const waiters: Array<{ resolve: (value: IteratorResult<T>) => void }> = [];
  let closed = false;

  return {
    push(value) {
      if (closed) return;
      const waiter = waiters.shift();
      if (waiter) {
        waiter.resolve({ value, done: false });
      } else {
        buffer.push(value);
      }
    },
    close() {
      closed = true;
      while (waiters.length > 0) {
        const w = waiters.shift()!;
        w.resolve({ value: undefined as never, done: true });
      }
    },
    iter() {
      return {
        [Symbol.asyncIterator]: () => ({
          next(): Promise<IteratorResult<T>> {
            if (buffer.length > 0) {
              return Promise.resolve({ value: buffer.shift()!, done: false });
            }
            if (closed) {
              return Promise.resolve({ value: undefined as never, done: true });
            }
            return new Promise((resolve) => {
              waiters.push({ resolve });
            });
          },
        }),
      };
    },
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function computeRemaining(durationMinutes: number, startedAt: number): number {
  const elapsedMs = Date.now() - startedAt;
  return durationMinutes - Math.floor(elapsedMs / 60_000);
}

// ─── runInterviewSession ──────────────────────────────────────────────────────

/**
 * Drives a local interview session as an AsyncGenerator.
 *
 * Lifecycle:
 *   1. Bootstrap: call runInterviewerAgent (no prior turn) → yield "question.generated"
 *   2. For each "answer.submitted" input:
 *      a. Check budget; yield "session.ended" { reason: "budget-exhausted" } if <= 0
 *      b. Run turnGraph → yield "turn.assessed"
 *      c. Concurrently run ObserverAgent + ReferenceAgent (both soft-failures via allSettled)
 *      d. Yield "coach.observation" / "reference.ready" if agents succeeded
 *      e. Yield "question.generated" with next turn question from turn_graph result
 *   3. On "session.end" input: fire-and-forget postReportGraph → yield "session.ended"
 *
 * §A0: no /api/ calls; §A0.4: no api_key; §L0 #13: node names unchanged.
 */
export async function* runInterviewSession(
  input: RunInterviewSessionInput,
  inputs: AsyncIterable<InterviewSessionInput>,
): AsyncGenerator<InterviewSessionEvent, void, unknown> {
  const startedAt = Date.now();
  const turns: TurnRecord[] = [];
  let lastQuestion = "";
  let turnIndex = 0;
  let previousSummary: string | null = null;

  // 1) Bootstrap: first question — no prior turn available yet
  try {
    const bootstrap = await runInterviewerAgent(
      {
        framework_json: input.frameworkJson,
        recent_turns: [],
        remaining_minutes: input.durationMinutes,
      },
      { llm },
    );
    lastQuestion = bootstrap.question;
    yield { type: "question.generated", payload: bootstrap };
  } catch (err) {
    yield {
      type: "error",
      payload: { code: "bootstrap_failed", message: errorMessage(err) },
    };
    return;
  }

  // 2) Main loop: each user input drives one interview turn
  for await (const userInput of inputs) {
    if (userInput.type === "session.end") {
      void buildPostReportGraph({ llm })
        .invoke({
          user_id: "local",
          last_session_id: input.sessionId,
          coach_input: null,
          reflection_input: null,
          coach_skipped: false,
          coach_error: null,
          reflection_error: null,
        } as Parameters<ReturnType<typeof buildPostReportGraph>["invoke"]>[0])
        .catch(() => {});
      yield { type: "session.ended", payload: { reason: "user-end" } };
      return;
    }

    // userInput.type === "answer.submitted"
    try {
      const remaining = computeRemaining(input.durationMinutes, startedAt);
      if (remaining <= 0) {
        yield { type: "session.ended", payload: { reason: "budget-exhausted" } };
        return;
      }

      // Run turn graph (turn_assessment + compression + next_question in parallel internally)
      // Spread turns to snapshot the current list — avoids the mock recording a live reference.
      const result = await buildTurnGraph({ llm }).invoke({
        turn_index: turnIndex,
        question: lastQuestion,
        answer: userInput.text,
        framework_json: input.frameworkJson,
        recent_turns: [...turns],
        previous_summary: previousSummary,
        remaining_minutes: remaining,
      });

      if (result.assessment) {
        yield { type: "turn.assessed", payload: result.assessment };
      }

      // Accumulate turn record (TurnRecord schema: question / answer / assessment only — no turn_index)
      turns.push({
        question: lastQuestion,
        answer: userInput.text,
        assessment: result.assessment ? { summary: result.assessment.summary } : null,
      });

      // Update long-term summary if compression produced one
      if (result.compressed?.summary) {
        previousSummary = result.compressed.summary;
      }

      // Concurrently run observer + reference (per-turn side-channels)
      // Both are soft-failures: Promise.allSettled ensures one failing never blocks the other
      const [observerResult, referenceResult] = await Promise.allSettled([
        runObserverAgent(
          {
            turn_index: turnIndex,
            question: lastQuestion,
            answer: userInput.text,
            remaining_minutes: remaining,
            long_term_summary: previousSummary,
          },
          { llm },
        ),
        runReferenceAgent(
          {
            question: lastQuestion,
            job_context: input.parseSummary.match_summary ?? null,
            candidate_answer: userInput.text,
          },
          { llm },
        ),
      ]);

      if (observerResult.status === "fulfilled") {
        yield { type: "coach.observation", payload: observerResult.value };
      }
      if (referenceResult.status === "fulfilled") {
        yield { type: "reference.ready", payload: referenceResult.value };
      }

      // Next question (turn_graph already computed it in the next_question node)
      if (result.next_question_out) {
        lastQuestion = result.next_question_out.question;
        turnIndex += 1;
        yield { type: "question.generated", payload: result.next_question_out };
      }
    } catch (err) {
      yield {
        type: "error",
        payload: { code: "turn_failed", message: errorMessage(err) },
      };
      return;
    }
  }
}
