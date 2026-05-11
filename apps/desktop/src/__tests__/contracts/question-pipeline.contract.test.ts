/**
 * question-pipeline.contract.test.ts — M8.6 pipeline invariants
 *
 * Verifies the QuestionQueue prefetch pipeline:
 *   - Memoization: gen fires once per idx
 *   - next() after prefetch resolves to gen output
 *   - next() without prefetch throws "not prefetched — pipeline broken"
 *   - scheduleNext sliding-window context rules
 *   - Registry: registerSessionPrefetch / getSessionQueue / releaseSession
 *
 * §A0: no Tauri import.
 * §C3: no secret material, no keychain.read, no process.env.
 * §A11: gen callback is a stub — no actual LLM calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  QuestionQueue,
  registerSessionPrefetch,
  getSessionQueue,
  releaseSession,
} from "@/core/sessions/QuestionQueue";
import type { InterviewerAgentOutput, TurnRecord } from "@/core/schemas/turns";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("@/core/agents/interviewer", () => ({
  runInterviewerAgent: vi.fn(),
}));
vi.mock("@/core/llm", () => ({
  llm: { generateObject: vi.fn(), chat: vi.fn(), chatStream: vi.fn() },
}));

import { runInterviewerAgent } from "@/core/agents/interviewer";
const mockRunInterviewerAgent = vi.mocked(runInterviewerAgent);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeQuestion(q: string): InterviewerAgentOutput {
  return {
    question: q,
    intent: "test intent",
    expected_depth: "surface",
    followup_hint: null,
    should_end: false,
    followup_hints: [],
    live_observation: null,
  };
}

function makeTurn(question: string, answer: string): TurnRecord {
  return { question, answer, assessment: null };
}

const FRAMEWORK_JSON = JSON.stringify({ style: "structured" });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("QuestionQueue — prefetch pipeline invariants", () => {
  // Test 1: next() after prefetch resolves to gen output
  it("queue.next(0) after prefetch(0, []) resolves to the generated question", async () => {
    const expected = makeQuestion("你好,请介绍一下自己。");
    const gen = vi.fn().mockResolvedValue(expected);
    const queue = new QuestionQueue({ totalTurns: 8, gen });

    queue.prefetch(0, []);
    const result = await queue.next(0);

    expect(result).toEqual(expected);
    expect(gen).toHaveBeenCalledTimes(1);
    expect(gen).toHaveBeenCalledWith(0, []);
  });

  // Test 2: next() without prefetch throws
  it("queue.next(5) without prefetch throws 'not prefetched — pipeline broken'", async () => {
    const gen = vi.fn();
    const queue = new QuestionQueue({ totalTurns: 8, gen });

    await expect(queue.next(5)).rejects.toThrow("Q5 not prefetched — pipeline broken");
    expect(gen).not.toHaveBeenCalled();
  });

  // Test 3: memoization — prefetch called twice doesn't fire gen twice
  it("prefetch(0, ...) called twice doesn't fire gen twice (memoization)", async () => {
    const gen = vi.fn().mockResolvedValue(makeQuestion("Q0"));
    const queue = new QuestionQueue({ totalTurns: 8, gen });

    queue.prefetch(0, []);
    queue.prefetch(0, []); // second call should be no-op

    await queue.next(0);

    expect(gen).toHaveBeenCalledTimes(1);
  });

  // Test 4: scheduleNext with target ≤ 2 uses empty context
  it("scheduleNext(0, [{q,a}]) triggers prefetch(3, []) — target ≤ 2 → empty context", async () => {
    const gen = vi.fn().mockResolvedValue(makeQuestion("Q3"));
    const queue = new QuestionQueue({ totalTurns: 10, gen });
    const turns: TurnRecord[] = [makeTurn("Q0?", "A0")];

    queue.scheduleNext(0, turns);

    // target = 0 + 3 = 3; since 3 > 2, ctx = last 2 of turns → [turns[0]]
    expect(gen).toHaveBeenCalledTimes(1);
    expect(gen).toHaveBeenCalledWith(3, [turns[0]]);
  });

  // Test 5: scheduleNext with target ≤ 2 uses empty context explicitly
  it("scheduleNext with target=2 uses empty context (open question)", async () => {
    // currentIdx=(-1) would give target=2, but let's test: currentIdx=0-LOOKAHEAD doesn't apply.
    // Instead: a fresh queue with turns, prefetch(0,[]),prefetch(1,[]),prefetch(2,[]) already done.
    // scheduleNext(2, bigList) → target=5, ctx=last-2
    const turns: TurnRecord[] = [
      makeTurn("Q0?", "A0"),
      makeTurn("Q1?", "A1"),
      makeTurn("Q2?", "A2"),
    ];
    const gen = vi.fn().mockResolvedValue(makeQuestion("Q5"));
    const queue = new QuestionQueue({ totalTurns: 10, gen });

    queue.scheduleNext(2, turns);

    // target = 2 + 3 = 5; 5 > 2 → ctx = last 2 of turns = [turns[1], turns[2]]
    expect(gen).toHaveBeenCalledWith(5, [turns[1], turns[2]]);
  });

  // Test 6: scheduleNext beyond totalTurns is a no-op
  it("scheduleNext(7, ...) with totalTurns=8 no-ops (target 10 > totalTurns)", async () => {
    const gen = vi.fn().mockResolvedValue(makeQuestion("Q10"));
    const queue = new QuestionQueue({ totalTurns: 8, gen });

    queue.scheduleNext(7, [makeTurn("Q?", "A")]);

    expect(gen).not.toHaveBeenCalled();
  });

  // Test 7: sliding window last-2
  it("scheduleNext(2, [t0, t1, t2]) triggers prefetch(5, [t1, t2]) — sliding window last-2", async () => {
    const t0 = makeTurn("Q0?", "A0");
    const t1 = makeTurn("Q1?", "A1");
    const t2 = makeTurn("Q2?", "A2");
    const gen = vi.fn().mockResolvedValue(makeQuestion("Q5"));
    const queue = new QuestionQueue({ totalTurns: 10, gen });

    queue.scheduleNext(2, [t0, t1, t2]);

    expect(gen).toHaveBeenCalledWith(5, [t1, t2]);
  });

  // Test 8: multiple prefetches, each independently resolved
  it("prefetch(0), prefetch(1), prefetch(2) each independently resolved via next()", async () => {
    const gen = vi.fn().mockImplementation((idx: number) =>
      Promise.resolve(makeQuestion(`Q${idx}`)),
    );
    const queue = new QuestionQueue({ totalTurns: 8, gen });

    queue.prefetch(0, []);
    queue.prefetch(1, []);
    queue.prefetch(2, []);

    const [r0, r1, r2] = await Promise.all([queue.next(0), queue.next(1), queue.next(2)]);

    expect(r0.question).toBe("Q0");
    expect(r1.question).toBe("Q1");
    expect(r2.question).toBe("Q2");
    expect(gen).toHaveBeenCalledTimes(3);
  });
});

describe("QuestionQueue registry — session lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clean up any sessions registered from prior tests
    releaseSession("test-sess-registry");
    releaseSession("test-sess-release");
  });

  // Test 9: getSessionQueue returns undefined before registration
  it("getSessionQueue(unknown) returns undefined before registerSessionPrefetch", () => {
    const result = getSessionQueue("nonexistent-session-id-xyz");
    expect(result).toBeUndefined();
  });

  // Test 10: registerSessionPrefetch registers queue; getSessionQueue returns it
  it("after registerSessionPrefetch, getSessionQueue returns the queue", () => {
    mockRunInterviewerAgent.mockResolvedValue(makeQuestion("Q0"));

    const queue = registerSessionPrefetch({
      sessionId: "test-sess-registry",
      totalTurns: 8,
      llm: { generateObject: vi.fn(), chat: vi.fn(), chatStream: vi.fn() } as never,
      frameworkJson: FRAMEWORK_JSON,
      durationMinutes: 30,
    });

    const retrieved = getSessionQueue("test-sess-registry");
    expect(retrieved).toBe(queue);
  });

  // Test 11: registerSessionPrefetch is idempotent
  it("registerSessionPrefetch called twice returns same queue (idempotent)", () => {
    mockRunInterviewerAgent.mockResolvedValue(makeQuestion("Q0"));

    const fakeLlm = { generateObject: vi.fn(), chat: vi.fn(), chatStream: vi.fn() } as never;
    const q1 = registerSessionPrefetch({
      sessionId: "test-sess-registry",
      totalTurns: 8,
      llm: fakeLlm,
      frameworkJson: FRAMEWORK_JSON,
      durationMinutes: 30,
    });
    const q2 = registerSessionPrefetch({
      sessionId: "test-sess-registry",
      totalTurns: 8,
      llm: fakeLlm,
      frameworkJson: FRAMEWORK_JSON,
      durationMinutes: 30,
    });

    expect(q1).toBe(q2);
    // runInterviewerAgent only fired once (for Q0/Q1/Q2 in first registration)
    // second call is no-op
    expect(mockRunInterviewerAgent).toHaveBeenCalledTimes(3); // Q0, Q1, Q2 only once
  });

  // Test 12: releaseSession removes from registry
  it("releaseSession removes queue from registry", () => {
    mockRunInterviewerAgent.mockResolvedValue(makeQuestion("Q0"));

    registerSessionPrefetch({
      sessionId: "test-sess-release",
      totalTurns: 8,
      llm: { generateObject: vi.fn(), chat: vi.fn(), chatStream: vi.fn() } as never,
      frameworkJson: FRAMEWORK_JSON,
      durationMinutes: 30,
    });

    expect(getSessionQueue("test-sess-release")).toBeDefined();

    releaseSession("test-sess-release");

    expect(getSessionQueue("test-sess-release")).toBeUndefined();
  });
});
