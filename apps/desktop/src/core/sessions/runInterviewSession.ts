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
import { db } from "@/services/db";
import { runObserverAgent } from "@/core/agents/observer";
import { runReferenceAgent } from "@/core/agents/reference";
import { streamDraftReadableAnswer } from "@/core/agents/coach";
import { buildTurnGraph } from "@/core/graphs/turnGraph";
import { buildPostReportGraph } from "@/core/graphs/postReportGraph";
import {
  getSessionQueue,
  registerSessionPrefetch,
  releaseSession,
} from "@/core/sessions/QuestionQueue";
import type { InterviewerAgentOutput, TurnAssessment, TurnRecord } from "@/core/schemas/turns";
import type { ObserverAgentOutput } from "@/core/schemas/turns";
import type { ReferenceAgentOutput } from "@/core/schemas/turns";
import type { ParseOutput } from "@/core/schemas/parse";
import type { ReadableAnswerPersona } from "@/core/agents/coach/prompts";

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
  /**
   * Persona name for the streaming reference drafter (M8.3).
   * Derived from session config style by the caller (InterviewPage).
   * L0 persona lock: must be one of Sarah / Marcus / Lin / Daniel.
   */
  personaName: ReadableAnswerPersona;
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
  // turnIndex on reference.ready: reference agent fires asynchronously when
  // the question is generated (peek-while-typing UX), so the event may
  // arrive before / during / after the corresponding submit. The state
  // machine drops late arrivals whose turnIndex doesn't match the active
  // turn so a stale reference doesn't leak into the next question's view.
  | { type: "reference.ready"; turnIndex: number; payload: ReferenceAgentOutput }
  // M8.3: streaming reference draft events — fired concurrently with reference.ready.
  // delta is a plain markdown text chunk (not JSON-wrapped).
  | { type: "reference.chunk"; turnIndex: number; delta: string }
  | { type: "reference.streamComplete"; turnIndex: number }
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
 *   1. Bootstrap: runInterviewerAgent → push "question.generated"
 *      → fire reference for Q in background (resolves whenever LLM done →
 *        push "reference.ready" with turnIndex)
 *   2. For each "answer.submitted" input:
 *      a. Check budget; push "session.ended" { reason: "budget-exhausted" } if <= 0
 *      b. Run turnGraph → push "turn.assessed"
 *      c. Run ObserverAgent (depends on user answer) → push "coach.observation"
 *      d. Push next "question.generated" + fire its reference in background
 *   3. On "session.end" input: fire-and-forget postReportGraph → push "session.ended"
 *
 * §A0: no /api/ calls; §A0.4: no api_key; §L0 #13: graph node names unchanged.
 *
 * Implementation note: the loop runs as a detached async fn pushing to an
 * internal queue.  An outer for-await yields from the queue.  This decoupling
 * lets the reference-agent .then() callback push reference.ready as soon as
 * the LLM completes, even while the main loop is parked on `for await
 * (userInput of inputs)`.  Without this, reference would only be visible at
 * submit time — defeating the peek-while-typing UX.
 */
export async function* runInterviewSession(
  input: RunInterviewSessionInput,
  inputs: AsyncIterable<InterviewSessionInput>,
): AsyncGenerator<InterviewSessionEvent, void, unknown> {
  const events = createAsyncQueue<InterviewSessionEvent>();

  // 2026-05-13:把简历真实经历 (profile + summary + advantages + gaps) 序列化传给 ReferenceAgent,
  // 让生成的 ideal_answer 用候选人**实际**项目/年限,而不是凭空捏"6 年 AI PM / 3 千万级月调用量"。
  // BYOK 产品下数据走用户自己的 ARK key,未离本机生态。
  //
  // L3(2026-05-14):前几题用完整 profile(自我介绍/核心项目题需要细节),Q4+
  // 改用 short summary 降 token,避免累积上下文 + recent_turns 把 prompt 撑爆 ARK 4xx。
  const candidateProfileFull = (() => {
    const ps = input.parseSummary;
    const hasContent =
      ps.candidate_profile != null ||
      (ps.profile_summary && ps.profile_summary.trim() !== "") ||
      ps.match_advantages.length > 0 ||
      ps.gaps.length > 0;
    if (!hasContent) return null;
    return JSON.stringify({
      profile: ps.candidate_profile ?? null,
      profile_summary: ps.profile_summary ?? null,
      match_advantages: ps.match_advantages,
      gaps: ps.gaps,
    });
  })();
  const candidateProfileShort = (() => {
    const ps = input.parseSummary;
    const summaryText = ps.profile_summary && ps.profile_summary.trim() !== ""
      ? ps.profile_summary
      : null;
    if (summaryText === null && ps.match_advantages.length === 0) return null;
    return JSON.stringify({
      profile_summary: summaryText,
      match_advantages: ps.match_advantages,
    });
  })();
  /** 给 ReferenceAgent 选 profile 体积:前 4 题(Q0-Q3)用 full,Q4+ 用 short。 */
  const profileForTurn = (turnIdx: number): string | null =>
    turnIdx < 4 ? candidateProfileFull : candidateProfileShort;

  // Fire reference for `question` in the background.  When the LLM call
  // settles, push reference.ready with the captured turnIndex so the state
  // machine can drop it if the user has already moved on (stale-arrival guard).
  const startReference = (question: string, capturedTurnIndex: number): void => {
    runReferenceAgent(
      {
        question,
        job_context: input.parseSummary.match_summary ?? null,
        // Pre-answer: candidate hasn't typed yet. Output schema doesn't
        // depend on candidate_answer; the comparison-to-user field in the
        // prompt template is optional.
        candidate_answer: null,
        candidate_profile_json: profileForTurn(capturedTurnIndex),
      },
      { llm },
    )
      .then((value) => {
        events.push({
          type: "reference.ready",
          turnIndex: capturedTurnIndex,
          payload: value,
        });
      })
      .catch(() => {
        /* soft-fail: reference is opt-in surface, never blocks the turn */
      });
  };

  // M8.3: per-turn AbortController map for streaming draft cancellation.
  // Keyed by turnIndex. abort() is called when the next turn starts or session ends,
  // so we don't waste tokens on stale streaming for a question the user moved past.
  const draftAbortControllers = new Map<number, AbortController>();

  // M8.3: Start streaming reference draft concurrently with startReference().
  // Fires chatStream (Bridge → Swift LLMGateway → ARK) and pushes reference.chunk
  // events to the UI for real-time rendering. The previous turn's controller is
  // aborted before starting a new one — abort triggers break inside the for-await.
  const startStreamingDraft = (
    question: string,
    capturedTurnIndex: number,
  ): void => {
    // Cancel any still-running draft from a prior turn
    for (const [idx, ctrl] of draftAbortControllers) {
      if (idx !== capturedTurnIndex) {
        ctrl.abort();
        draftAbortControllers.delete(idx);
      }
    }

    const controller = new AbortController();
    draftAbortControllers.set(capturedTurnIndex, controller);

    void (async () => {
      try {
        for await (const chunk of streamDraftReadableAnswer(
          { question, persona: input.personaName, candidateProfileJson: profileForTurn(capturedTurnIndex) },
          { llm },
        )) {
          if (controller.signal.aborted) break;
          events.push({ type: "reference.chunk", turnIndex: capturedTurnIndex, delta: chunk });
        }
        if (!controller.signal.aborted) {
          events.push({ type: "reference.streamComplete", turnIndex: capturedTurnIndex });
        }
      } catch {
        // Soft-fail: streaming failure does not abort the session.
        // The user still gets the structured reference via reference.ready.
      } finally {
        draftAbortControllers.delete(capturedTurnIndex);
      }
    })();
  };

  void (async () => {
    const startedAt = Date.now();
    const turns: TurnRecord[] = [];
    let lastQuestion = "";
    let turnIndex = 0;
    let previousSummary: string | null = null;

    // 1) Bootstrap: first question from prefetch pipeline.
    //    getSessionQueue returns the queue registered in createSession (ConfigPage path).
    //    Falls back to a new queue with prefetch for test path / late arrivals.
    //
    // 2026-05-16:对齐 ConfigPage UI 标签。之前 ceil(min × 0.4) + 2 算出来比 UI
    // 承诺的 2× 多(15min UI 说 3~4 题代码跑 8 题)。改为 lookup table。
    const totalTurnsByDuration = (m: number): number => {
      if (m <= 15) return 4;   // 15 分钟 · 精简 · 3~4 题(上限 4)
      if (m <= 30) return 8;   // 30 分钟 · 标准 · 6~8 题(上限 8)
      if (m <= 45) return 12;  // 45 分钟 · 完整 · 10~12 题(上限 12)
      return 16;               // 60 分钟+ · 深度 · 含 case
    };
    const queue =
      getSessionQueue(input.sessionId) ??
      registerSessionPrefetch({
        sessionId: input.sessionId,
        totalTurns: totalTurnsByDuration(input.durationMinutes),
        llm,
        frameworkJson: input.frameworkJson,
        durationMinutes: input.durationMinutes,
        persona: input.personaName,
      });

    try {
      const bootstrap = await queue.next(0);
      lastQuestion = bootstrap.question;
      events.push({ type: "question.generated", payload: bootstrap });
      startReference(lastQuestion, turnIndex);
      startStreamingDraft(lastQuestion, turnIndex);
      // Eagerly schedule N+LOOKAHEAD after consuming Q0
      queue.scheduleNext(0, []);
    } catch (err) {
      events.push({
        type: "error",
        payload: { code: "bootstrap_failed", message: errorMessage(err) },
      });
      events.close();
      return;
    }

    // 2) Main loop: each user input drives one interview turn
    for await (const userInput of inputs) {
      if (userInput.type === "session.end") {
        // M8.3: abort all active streaming drafts on session end to free resources
        for (const ctrl of draftAbortControllers.values()) {
          ctrl.abort();
        }
        draftAbortControllers.clear();
        // Release prefetch queue from module registry to free memory
        releaseSession(input.sessionId);
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
        events.push({ type: "session.ended", payload: { reason: "user-end" } });
        events.close();
        return;
      }

      // userInput.type === "answer.submitted"
      try {
        const remaining = computeRemaining(input.durationMinutes, startedAt);
        if (remaining <= 0) {
          events.push({
            type: "session.ended",
            payload: { reason: "budget-exhausted" },
          });
          events.close();
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
          events.push({ type: "turn.assessed", payload: result.assessment });
        }

        // Persist turn + assessment to SQLite so generateReport (later) sees the
        // real candidate answers instead of an empty turns[] (which forces the
        // ReportAgent LLM to hallucinate plausible-sounding round_reviews_v2).
        // Soft-fail: a DB error must not abort the live interview.
        try {
          const turnId = crypto.randomUUID();
          await db.exec(
            `INSERT INTO interview_turns
               (id, interview_session_id, turn_index, question_tag, question_text, answer_text)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              turnId,
              input.sessionId,
              turnIndex,
              "interview", // placeholder for NOT NULL; round_reviews_v2.question_tag is re-derived by ReportAgent
              lastQuestion,
              userInput.text,
            ],
          );
          if (result.assessment) {
            await db.exec(
              `INSERT INTO turn_assessments
                 (id, interview_turn_id, strengths, weaknesses, evidence)
               VALUES (?, ?, ?, ?, ?)`,
              [
                crypto.randomUUID(),
                turnId,
                JSON.stringify(result.assessment.strengths ?? []),
                JSON.stringify(result.assessment.weaknesses ?? []),
                "[]",
              ],
            );
          }
        } catch (persistErr) {
          events.push({
            type: "error",
            payload: {
              code: "persist_turn_failed",
              message: errorMessage(persistErr),
            },
          });
        }

        // L3(2026-05-14):recent_turns 在 InterviewerAgent / Coach 等 agent 里都会
        // 拼进 prompt。用户答得长(500-2000 字常见)+ 累积 2 轮 → 单题 prompt 容易超 8K
        // 触发 ARK rate-limit / token-limit 4xx。截断到 800 字保留语义骨架,降 token。
        const cappedAnswer =
          userInput.text.length > 800
            ? userInput.text.slice(0, 800) + "...(truncated for context budget)"
            : userInput.text;
        // Accumulate turn record (question / answer / assessment only — no turn_index)
        turns.push({
          question: lastQuestion,
          answer: cappedAnswer,
          assessment: result.assessment
            ? { summary: result.assessment.summary }
            : null,
        });

        if (result.compressed?.summary) {
          previousSummary = result.compressed.summary;
        }

        // Observer needs the user's actual answer, so it only fires post-submit.
        // Soft-fail; the panel just stays empty if it errors.
        try {
          const observation = await runObserverAgent(
            {
              turn_index: turnIndex,
              question: lastQuestion,
              answer: userInput.text,
              remaining_minutes: remaining,
              long_term_summary: previousSummary,
            },
            { llm },
          );
          events.push({ type: "coach.observation", payload: observation });
        } catch {
          /* soft-fail */
        }

        // L0 #13 NOTE: next_question node in turnGraph still executes (node-name lock preserved).
        // Its output (result.next_question_out) is intentionally discarded here — questions
        // now come from the prefetch pipeline (QuestionQueue) to eliminate per-turn LLM wait.
        // This matches the "concurrency implemented OUTSIDE LangGraph" pattern from M8.3.
        turnIndex += 1;

        // 2026-05-16:题数到了上限直接结束面试,不要再尝试 queue.next(N) 然后报错。
        // totalTurns lookup 与 ConfigPage UI 三处对齐:15min=4 / 30min=8 / 45min=12 / 60min=16
        const sessionTotalTurns = totalTurnsByDuration(input.durationMinutes);
        if (turnIndex >= sessionTotalTurns) {
          // 跟用户主动结束走同一条路径:fire-and-forget postReport + emit session.ended
          for (const ctrl of draftAbortControllers.values()) ctrl.abort();
          draftAbortControllers.clear();
          releaseSession(input.sessionId);
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
          events.push({ type: "session.ended", payload: { reason: "budget-exhausted" } });
          events.close();
          return;
        }

        try {
          const nextOut = await queue.next(turnIndex);
          lastQuestion = nextOut.question;
          events.push({ type: "question.generated", payload: nextOut });
          startReference(lastQuestion, turnIndex);
          // M8.3: startStreamingDraft cancels any prior-turn draft before starting new one
          startStreamingDraft(lastQuestion, turnIndex);
          // Schedule N+LOOKAHEAD using the accumulated turn history
          queue.scheduleNext(turnIndex, turns);
        } catch (nextErr) {
          // Fallback: if pipeline broken (e.g. prefetch failed), use turnGraph result
          if (result.next_question_out) {
            lastQuestion = result.next_question_out.question;
            events.push({ type: "question.generated", payload: result.next_question_out });
            startReference(lastQuestion, turnIndex);
            startStreamingDraft(lastQuestion, turnIndex);
          } else {
            events.push({
              type: "error",
              payload: { code: "next_question_failed", message: errorMessage(nextErr) },
            });
            events.close();
            return;
          }
        }
      } catch (err) {
        events.push({
          type: "error",
          payload: { code: "turn_failed", message: errorMessage(err) },
        });
        events.close();
        return;
      }
    }
  })();

  for await (const event of events.iter()) {
    yield event;
  }
}
