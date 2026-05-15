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
import type { ReadableAnswerPersona } from "@/core/agents/coach/prompts";
import { staticOpeningQuestion } from "@/core/sessions/staticOpeningQuestions";

export type QueueGenContext = TurnRecord[];

// L2(2026-05-14):LLM 调用的超时 + 重试封装。Q4+ 经常出现 prompt 超长 / ARK 429
// rate-limit / 网络抖动 → prefetch 卡住或失败。包一层 race timeout + 指数退避,
// 让短暂故障自愈,不让用户卡在"等待问题加载"。
async function withRetryAndTimeout<T>(
  fn: () => Promise<T>,
  label: string,
  opts: { timeoutMs: number; maxAttempts: number } = { timeoutMs: 30_000, maxAttempts: 3 },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`${label} timeout after ${opts.timeoutMs}ms`)),
            opts.timeoutMs,
          ),
        ),
      ]);
    } catch (err) {
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[QQ-retry] ${label} attempt ${attempt}/${opts.maxAttempts} failed: ${errMsg}`);
      if (attempt < opts.maxAttempts) {
        // 指数退避:1s, 4s
        const backoffMs = 1000 * Math.pow(4, attempt - 1);
        await new Promise((res) => setTimeout(res, backoffMs));
      }
    }
  }
  throw lastError;
}

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
    // DIAG-Q5: trace prefetch lifecycle
    console.warn(`[QQ] prefetch Q${idx} fired, ctx_len=${context.length}`);
    const promise = this.gen(idx, context);
    promise
      .then((result) => {
        console.warn(`[QQ] prefetch Q${idx} resolved: should_end=${result.should_end} question="${result.question?.slice(0, 50)}..."`);
      })
      .catch((err) => {
        console.error(`[QQ] prefetch Q${idx} REJECTED:`, err?.message ?? String(err), err?.stack ?? "");
      });
    this.cache.set(idx, promise);
  }

  /**
   * Await the prefetched question for idx.
   * Throws if prefetch was never called — indicates pipeline is broken.
   */
  async next(idx: number): Promise<InterviewerAgentOutput> {
    console.warn(`[QQ] next(Q${idx}) called, has_cache=${this.cache.has(idx)}`);
    if (!this.cache.has(idx)) {
      throw new Error(`Q${idx} not prefetched — pipeline broken`);
    }
    try {
      const result = await this.cache.get(idx)!;
      console.warn(`[QQ] next(Q${idx}) resolved, should_end=${result.should_end} question="${result.question?.slice(0, 50)}..."`);
      return result;
    } catch (err) {
      console.error(`[QQ] next(Q${idx}) THREW:`, err);
      throw err;
    }
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
  persona: ReadableAnswerPersona;  // M9.2: used to select static opening templates for Q0/Q1
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
      // M9.2 (F-508): Q0/Q1 are invariant opening questions — skip LLM entirely.
      // Zero latency, zero failure risk for the two most critical session moments.
      // 老板原话:"提前两条最最简单的开场介绍和项目介绍这两个问题必问"。
      if (idx <= 1) {
        return staticOpeningQuestion(idx as 0 | 1, args.persona);
      }

      const out = await withRetryAndTimeout(
        () =>
          runInterviewerAgent(
            {
              framework_json: args.frameworkJson,
              recent_turns: context,
              remaining_minutes: args.durationMinutes,
              // M8.6 修复:idx 透传到 InterviewerAgent,prompt 按 idx 给不同 openingHint
              // 让 Q0/Q1/Q2(空 context)能产出不同题目而不是 3 个一样的自我介绍。
              target_turn_index: idx,
            },
            { llm: args.llm },
          ),
        `Q${idx} gen`,
      );
      // 2026-05-14 修复:LLM 不该自行决定收尾(会导致状态机跳 ended 卡住),
      // 是否结束由 QuestionQueue.totalTurns 上限和用户主动"结束面试"按钮决定。
      // 强制覆盖 should_end → false。
      return { ...out, should_end: false };
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
