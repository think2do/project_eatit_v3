/**
 * QuestionQueue — prefetch pipeline for interview questions.
 *
 * §A0.4: no api_key access; LLM calls go through deps.llm in the gen callback.
 * §L0 #13: this module has no dependency on turnGraph node names.
 * §A11: gen callback passes only schema-permitted fields to runInterviewerAgent.
 *
 * Architecture:
 *   - Cache maps turn index → Promise<InterviewerAgentOutput> (fire-once memoization)
 *   - LOOKAHEAD=3: prefetch always stays 3 turns ahead of current
 *   - Sliding window: idx ≤ 2 → empty recent_turns; idx ≥ 3 → last 2 turns
 */

import { runInterviewerAgent } from "@/core/agents/interviewer";
import type { InterviewerAgentOutput, TurnRecord } from "@/core/schemas/turns";
import type { LLMProvider } from "@/core/llm/types";

export type QueueGenContext = TurnRecord[];

export interface QuestionQueueOptions {
  totalTurns: number;
  gen: (idx: number, context: QueueGenContext) => Promise<InterviewerAgentOutput>;
}

export class QuestionQueue {
  private readonly cache = new Map<number, Promise<InterviewerAgentOutput>>();
  private static readonly LOOKAHEAD = 3;
  private readonly totalTurns: number;
  private readonly gen: (idx: number, context: QueueGenContext) => Promise<InterviewerAgentOutput>;

  constructor(opts: QuestionQueueOptions) {
    this.totalTurns = opts.totalTurns;
    this.gen = opts.gen;
  }

  /**
   * Fire prefetch for the given turn index if not already in flight.
   * context: empty for idx ≤ 2; last-2 turns for idx ≥ 3 (call site decides).
   */
  prefetch(idx: number, context: QueueGenContext): void {
    if (this.cache.has(idx)) return;
    this.cache.set(idx, this.gen(idx, context));
  }

  /**
   * Await the prefetched question for idx.
   * Throws if prefetch was never called — indicates pipeline is broken.
   */
  async next(idx: number): Promise<InterviewerAgentOutput> {
    if (!this.cache.has(idx)) {
      throw new Error(`Q${idx} not prefetched — pipeline broken`);
    }
    return this.cache.get(idx)!;
  }

  /**
   * Schedule the N+LOOKAHEAD question after answering currentIdx.
   * Uses empty context for target ≤ 2; last-2 turns for target ≥ 3.
   */
  scheduleNext(currentIdx: number, allTurnsSoFar: QueueGenContext): void {
    const target = currentIdx + QuestionQueue.LOOKAHEAD;
    if (target >= this.totalTurns) return;
    const ctx: QueueGenContext = target <= 2 ? [] : allTurnsSoFar.slice(-2);
    this.prefetch(target, ctx);
  }
}

// ─── Module-level session registry ───────────────────────────────────────────

const sessionQueues = new Map<string, QuestionQueue>();

export interface RegisterSessionPrefetchArgs {
  sessionId: string;
  totalTurns: number;
  llm: LLMProvider;
  frameworkJson: string;
  durationMinutes: number;
}

/**
 * Register a QuestionQueue for the session and immediately prefetch Q0/Q1/Q2.
 * Idempotent: returns existing queue if sessionId already registered.
 *
 * §A0.4: llm is passed in — no process.env.ARK_API_KEY / keychain.read here.
 */
export function registerSessionPrefetch(args: RegisterSessionPrefetchArgs): QuestionQueue {
  if (sessionQueues.has(args.sessionId)) {
    return sessionQueues.get(args.sessionId)!;
  }

  const queue = new QuestionQueue({
    totalTurns: args.totalTurns,
    gen: async (idx, context) => {
      return runInterviewerAgent(
        {
          framework_json: args.frameworkJson,
          recent_turns: context,
          remaining_minutes: args.durationMinutes,
        },
        { llm: args.llm },
      );
    },
  });

  sessionQueues.set(args.sessionId, queue);

  // Fire Q0/Q1/Q2 immediately with empty context (open-question, no prior turns)
  queue.prefetch(0, []);
  queue.prefetch(1, []);
  queue.prefetch(2, []);

  return queue;
}

export function getSessionQueue(sessionId: string): QuestionQueue | undefined {
  return sessionQueues.get(sessionId);
}

export function releaseSession(sessionId: string): void {
  sessionQueues.delete(sessionId);
}
