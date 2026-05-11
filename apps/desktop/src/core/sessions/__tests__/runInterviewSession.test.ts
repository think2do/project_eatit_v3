/**
 * Tests for runInterviewSession AsyncGenerator and createAsyncQueue helper.
 *
 * Mock strategy: vi.mock at module level for all agent/graph deps.
 * Each test reconfigures mocks via mockResolvedValue / mockRejectedValue.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runInterviewSession,
  createAsyncQueue,
  type RunInterviewSessionInput,
  type InterviewSessionEvent,
  type InterviewSessionInput,
} from "../runInterviewSession";
import type { InterviewerAgentOutput } from "@/core/schemas/turns";
import type { ObserverAgentOutput, TurnAssessment, ReferenceAgentOutput } from "@/core/schemas/turns";

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/core/agents/interviewer", () => ({
  runInterviewerAgent: vi.fn(),
}));
vi.mock("@/core/agents/observer", () => ({
  runObserverAgent: vi.fn(),
}));
vi.mock("@/core/agents/reference", () => ({
  runReferenceAgent: vi.fn(),
}));
vi.mock("@/core/graphs/turnGraph", () => ({
  buildTurnGraph: vi.fn(() => ({ invoke: vi.fn() })),
}));
vi.mock("@/core/graphs/postReportGraph", () => ({
  buildPostReportGraph: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({}),
  })),
}));
vi.mock("@/core/llm", () => ({
  llm: { generateObject: vi.fn(), chat: vi.fn(), chatStream: vi.fn() },
}));
vi.mock("@/services/db", () => ({
  db: {
    exec: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
    query: vi.fn().mockResolvedValue([]),
    tx: vi.fn().mockResolvedValue(undefined),
  },
}));

// M8.6: mock the QuestionQueue registry so runInterviewSession uses a
// controlled queue. getSessionQueue returns a stub queue that delegates
// next(idx) to mockRunInterviewerAgent — matching the pre-pipeline behavior
// where the agent was called once per turn. This keeps the existing test
// assertions unchanged while exercising the new queue.next() code path.
vi.mock("@/core/sessions/QuestionQueue", () => {
  // A minimal stub queue: next(idx) calls mockRunInterviewerAgent lazily
  // (once), scheduleNext is a no-op so no surprise extra calls.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let _mockRunInterviewerAgent: any;
  const callCache = new Map<number, Promise<InterviewerAgentOutput>>();

  const stubQueue = {
    prefetch: vi.fn(),
    scheduleNext: vi.fn(),
    async next(idx: number): Promise<InterviewerAgentOutput> {
      if (!callCache.has(idx)) {
        callCache.set(idx, _mockRunInterviewerAgent());
      }
      return callCache.get(idx)!;
    },
    _reset() {
      callCache.clear();
    },
    _setAgent(agent: unknown) {
      _mockRunInterviewerAgent = agent;
    },
  };

  return {
    QuestionQueue: vi.fn(() => stubQueue),
    getSessionQueue: vi.fn(() => stubQueue),
    registerSessionPrefetch: vi.fn(() => stubQueue),
    releaseSession: vi.fn(),
    _stubQueue: stubQueue,
  };
});

// ─── Import mocks after vi.mock declarations ──────────────────────────────────

import { runInterviewerAgent } from "@/core/agents/interviewer";
import { runObserverAgent } from "@/core/agents/observer";
import { runReferenceAgent } from "@/core/agents/reference";
import { buildTurnGraph } from "@/core/graphs/turnGraph";
import { buildPostReportGraph } from "@/core/graphs/postReportGraph";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import * as QuestionQueueModule from "@/core/sessions/QuestionQueue";

const mockRunInterviewerAgent = vi.mocked(runInterviewerAgent);
const mockRunObserverAgent = vi.mocked(runObserverAgent);
const mockRunReferenceAgent = vi.mocked(runReferenceAgent);
const mockBuildTurnGraph = vi.mocked(buildTurnGraph);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stubQueue = (QuestionQueueModule as any)._stubQueue as {
  prefetch: ReturnType<typeof vi.fn>;
  scheduleNext: ReturnType<typeof vi.fn>;
  next: (idx: number) => Promise<InterviewerAgentOutput>;
  _reset: () => void;
  _setAgent: (agent: unknown) => void;
};
const mockBuildPostReportGraph = vi.mocked(buildPostReportGraph);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FRAMEWORK_JSON = JSON.stringify({ style: "structured" });

const BASE_INPUT: RunInterviewSessionInput = {
  sessionId: "sess-001",
  llmConfigMeta: { provider: "ark", model: "doubao-seed-1-6-250615" },
  frameworkJson: FRAMEWORK_JSON,
  parseSummary: {
    job_requirements: [],
    candidate_highlights: [],
    candidate_risks: [],
    project_hooks: [],
    match_summary: "good fit",
    candidate_profile: null,
    match_score: null,
    profile_summary: null,
    match_advantages: [],
    gaps: [],
    interview_focus: [],
    project_hooks_v32: [],
    jd_company_name: null,
    jd_role_title: null,
    jd_industry_hints: [],
  },
  durationMinutes: 30,
};

function makeBootstrapOutput(overrides: Partial<InterviewerAgentOutput> = {}): InterviewerAgentOutput {
  return {
    question: "请介绍一下你最近的项目。",
    intent: "了解候选人背景",
    expected_depth: "surface",
    followup_hint: null,
    should_end: false,
    followup_hints: [],
    live_observation: null,
    ...overrides,
  };
}

function makeAssessment(overrides: Partial<TurnAssessment> = {}): TurnAssessment {
  return {
    summary: "回答结构清晰",
    strengths: ["逻辑清晰"],
    weaknesses: ["缺乏数据"],
    ...overrides,
  };
}

function makeObserverOutput(overrides: Partial<ObserverAgentOutput> = {}): ObserverAgentOutput {
  return {
    observation: "候选人表达流利",
    tone: "support",
    actionable: true,
    ...overrides,
  };
}

function makeReferenceOutput(overrides: Partial<ReferenceAgentOutput> = {}): ReferenceAgentOutput {
  return {
    answer_outline: ["STAR 结构"],
    ideal_answer: "使用 STAR 法则阐述",
    key_evaluation_points: ["数据驱动"],
    common_pitfalls: ["过于笼统"],
    ...overrides,
  };
}

function makeTurnGraphResult(nextQ?: Partial<InterviewerAgentOutput>, assessmentOverrides?: Partial<TurnAssessment>) {
  return {
    assessment: makeAssessment(assessmentOverrides),
    compressed: { summary: null, preserved_keywords: [], open_threads: [] },
    next_question_out: makeBootstrapOutput({
      question: "下一个问题？",
      intent: "深入了解",
      expected_depth: "tactical",
      ...nextQ,
    }),
  };
}

/** Collect all events from the generator with a finite input sequence. */
async function collectEvents(
  sessionInput: RunInterviewSessionInput,
  inputs: InterviewSessionInput[],
): Promise<InterviewSessionEvent[]> {
  const queue = createAsyncQueue<InterviewSessionInput>();
  const gen = runInterviewSession(sessionInput, queue.iter());

  const events: InterviewSessionEvent[] = [];

  // Start consuming the generator
  const consuming = (async () => {
    for await (const event of gen) {
      events.push(event);
    }
  })();

  // Push inputs with a small yield to allow generator to reach the await point
  for (const inp of inputs) {
    await Promise.resolve(); // let generator advance to for-await
    queue.push(inp);
  }

  // After all inputs pushed, close the queue and wait for generator to finish
  await Promise.resolve();
  queue.close();
  await consuming;

  return events;
}

// ─── beforeEach: reset all mocks ─────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: bootstrap returns a question
  mockRunInterviewerAgent.mockResolvedValue(makeBootstrapOutput());

  // M8.6: wire the stub queue to use mockRunInterviewerAgent for next() calls
  stubQueue._reset();
  stubQueue._setAgent(mockRunInterviewerAgent);

  // Default: observer and reference succeed
  mockRunObserverAgent.mockResolvedValue(makeObserverOutput());
  mockRunReferenceAgent.mockResolvedValue(makeReferenceOutput());

  // Default: turnGraph returns assessment + next question
  const mockInvoke = vi.fn().mockResolvedValue(makeTurnGraphResult());
  mockBuildTurnGraph.mockReturnValue({ invoke: mockInvoke } as ReturnType<typeof buildTurnGraph>);

  // Default: postReportGraph fire-and-forget
  const mockPostInvoke = vi.fn().mockResolvedValue({});
  mockBuildPostReportGraph.mockReturnValue({ invoke: mockPostInvoke } as ReturnType<typeof buildPostReportGraph>);
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("runInterviewSession", () => {
  // Test 1
  // M8.6: bootstrap now goes through queue.next(0) rather than calling runInterviewerAgent
  // directly. The stub queue calls mockRunInterviewerAgent() once for Q0.
  // Arg-level assertions are the pipeline contract test's responsibility.
  it("bootstrap: queue provides first question → yields question.generated", async () => {
    const events = await collectEvents(BASE_INPUT, [{ type: "session.end" }]);

    expect(mockRunInterviewerAgent).toHaveBeenCalledTimes(1);

    const questionEvents = events.filter((e) => e.type === "question.generated");
    expect(questionEvents).toHaveLength(1);
    expect((questionEvents[0] as Extract<InterviewSessionEvent, { type: "question.generated" }>).payload.question).toBe(
      "请介绍一下你最近的项目。",
    );
  });

  // Test 2
  it("bootstrap fail → yields error with code='bootstrap_failed' then generator done", async () => {
    mockRunInterviewerAgent.mockRejectedValue(new Error("LLM timeout"));

    const queue = createAsyncQueue<InterviewSessionInput>();
    const events: InterviewSessionEvent[] = [];

    for await (const event of runInterviewSession(BASE_INPUT, queue.iter())) {
      events.push(event);
    }
    queue.close();

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    const errorEvent = events[0] as Extract<InterviewSessionEvent, { type: "error" }>;
    expect(errorEvent.payload.code).toBe("bootstrap_failed");
    expect(errorEvent.payload.message).toBe("LLM timeout");
  });

  // Test 3
  it("answer.submitted → 4-event sequence: turn.assessed / coach.observation / reference.ready / question.generated", async () => {
    const events = await collectEvents(BASE_INPUT, [
      { type: "answer.submitted", text: "我做了一个 LLM 摘要项目", turnIndex: 0 },
      { type: "session.end" },
    ]);

    const types = events.map((e) => e.type);
    // bootstrap question, then after answer: assessed, observation, reference, next question, then session.ended
    expect(types).toContain("question.generated");
    expect(types).toContain("turn.assessed");
    expect(types).toContain("coach.observation");
    expect(types).toContain("reference.ready");
    expect(types).toContain("session.ended");

    // Verify ordering after first answer.submitted
    const firstQuestionIdx = types.indexOf("question.generated");
    const assessedIdx = types.indexOf("turn.assessed");
    const observationIdx = types.indexOf("coach.observation");
    const referenceIdx = types.indexOf("reference.ready");
    const lastQuestionIdx = types.lastIndexOf("question.generated");

    expect(firstQuestionIdx).toBeLessThan(assessedIdx);
    expect(assessedIdx).toBeLessThan(lastQuestionIdx);
    expect(observationIdx).toBeLessThan(lastQuestionIdx);
    expect(referenceIdx).toBeLessThan(lastQuestionIdx);
  });

  // Test 4
  it("turn_graph fail → yields error with code='turn_failed' then generator done", async () => {
    const mockInvoke = vi.fn().mockRejectedValue(new Error("graph crash"));
    mockBuildTurnGraph.mockReturnValue({ invoke: mockInvoke } as ReturnType<typeof buildTurnGraph>);

    const events = await collectEvents(BASE_INPUT, [
      { type: "answer.submitted", text: "答案", turnIndex: 0 },
    ]);

    const errorEvents = events.filter((e) => e.type === "error");
    expect(errorEvents).toHaveLength(1);
    const errorEvent = errorEvents[0] as Extract<InterviewSessionEvent, { type: "error" }>;
    expect(errorEvent.payload.code).toBe("turn_failed");
    expect(errorEvent.payload.message).toBe("graph crash");

    // Generator should have ended after error — no more events
    const afterError = events.slice(events.indexOf(errorEvents[0]) + 1);
    expect(afterError).toHaveLength(0);
  });

  // Test 5
  it("observer fail / reference success → silent skip observer, yields reference.ready", async () => {
    mockRunObserverAgent.mockRejectedValue(new Error("observer down"));
    mockRunReferenceAgent.mockResolvedValue(makeReferenceOutput());

    const events = await collectEvents(BASE_INPUT, [
      { type: "answer.submitted", text: "答案", turnIndex: 0 },
      { type: "session.end" },
    ]);

    const types = events.map((e) => e.type);
    expect(types).not.toContain("coach.observation");
    expect(types).toContain("reference.ready");
    expect(types).not.toContain("error");
  });

  // Test 6
  it("both observer and reference fail → no side-channel events, main flow continues", async () => {
    mockRunObserverAgent.mockRejectedValue(new Error("observer down"));
    mockRunReferenceAgent.mockRejectedValue(new Error("reference down"));

    const events = await collectEvents(BASE_INPUT, [
      { type: "answer.submitted", text: "答案", turnIndex: 0 },
      { type: "session.end" },
    ]);

    const types = events.map((e) => e.type);
    expect(types).not.toContain("coach.observation");
    expect(types).not.toContain("reference.ready");
    // Main flow should still yield turn.assessed and question.generated
    expect(types).toContain("turn.assessed");
    expect(types).toContain("question.generated");
    // No errors from side-channel failures
    expect(types).not.toContain("error");
  });

  // Test 7
  it("session.end → buildPostReportGraph called + yields session.ended with reason='user-end'", async () => {
    const mockPostInvoke = vi.fn().mockResolvedValue({});
    mockBuildPostReportGraph.mockReturnValue({ invoke: mockPostInvoke } as ReturnType<typeof buildPostReportGraph>);

    const events = await collectEvents(BASE_INPUT, [{ type: "session.end" }]);

    expect(mockBuildPostReportGraph).toHaveBeenCalledTimes(1);
    expect(mockPostInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "local",
        last_session_id: BASE_INPUT.sessionId,
      }),
    );

    const endedEvents = events.filter((e) => e.type === "session.ended");
    expect(endedEvents).toHaveLength(1);
    const endedEvent = endedEvents[0] as Extract<InterviewSessionEvent, { type: "session.ended" }>;
    expect(endedEvent.payload.reason).toBe("user-end");
  });

  // Test 8
  it("budget exhausted → yields session.ended with reason='budget-exhausted'", async () => {
    // Use 0 duration so computeRemaining immediately returns <= 0
    const zeroInput: RunInterviewSessionInput = { ...BASE_INPUT, durationMinutes: 0 };

    const events = await collectEvents(zeroInput, [
      { type: "answer.submitted", text: "答案", turnIndex: 0 },
    ]);

    const endedEvents = events.filter((e) => e.type === "session.ended");
    expect(endedEvents).toHaveLength(1);
    const endedEvent = endedEvents[0] as Extract<InterviewSessionEvent, { type: "session.ended" }>;
    expect(endedEvent.payload.reason).toBe("budget-exhausted");

    // turnGraph should NOT have been called (budget check happens before invoke)
    expect(mockBuildTurnGraph).not.toHaveBeenCalled();
  });

  // Test 9
  it("multiple turns: turnIndex increments and recent_turns accumulates", async () => {
    const turn1Invoke = vi.fn().mockResolvedValue(makeTurnGraphResult({ question: "第二题？" }));
    const turn2Invoke = vi.fn().mockResolvedValue(makeTurnGraphResult({ question: "第三题？" }));

    let callCount = 0;
    const mockInvoke = vi.fn().mockImplementation((...args) => {
      callCount++;
      if (callCount === 1) return turn1Invoke(...args);
      return turn2Invoke(...args);
    });
    mockBuildTurnGraph.mockReturnValue({ invoke: mockInvoke } as ReturnType<typeof buildTurnGraph>);

    await collectEvents(BASE_INPUT, [
      { type: "answer.submitted", text: "第一轮回答", turnIndex: 0 },
      { type: "answer.submitted", text: "第二轮回答", turnIndex: 1 },
      { type: "session.end" },
    ]);

    // Second turnGraph invoke should have recent_turns from first turn
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    const secondCallArgs = mockInvoke.mock.calls[1][0] as { turn_index: number; recent_turns: unknown[] };
    expect(secondCallArgs.turn_index).toBe(1);
    expect(secondCallArgs.recent_turns).toHaveLength(1);
    expect((secondCallArgs.recent_turns[0] as { question: string }).question).toBe("请介绍一下你最近的项目。");
  });

  // Test 10
  it("previous_summary accumulated from compressed.summary across turns", async () => {
    let callCount = 0;
    const mockInvoke = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          assessment: makeAssessment(),
          compressed: { summary: "第一轮摘要", preserved_keywords: [], open_threads: [] },
          next_question_out: makeBootstrapOutput({ question: "第二题？" }),
        });
      }
      return Promise.resolve(makeTurnGraphResult());
    });
    mockBuildTurnGraph.mockReturnValue({ invoke: mockInvoke } as ReturnType<typeof buildTurnGraph>);

    await collectEvents(BASE_INPUT, [
      { type: "answer.submitted", text: "第一轮回答", turnIndex: 0 },
      { type: "answer.submitted", text: "第二轮回答", turnIndex: 1 },
      { type: "session.end" },
    ]);

    // Second call should receive previous_summary from first turn's compressed.summary
    const secondCallArgs = mockInvoke.mock.calls[1][0] as { previous_summary: string | null };
    expect(secondCallArgs.previous_summary).toBe("第一轮摘要");
  });
});

// ─── createAsyncQueue tests ───────────────────────────────────────────────────

describe("createAsyncQueue", () => {
  // Test 11
  it("basic: push before iter — buffered, for-await retrieves in order", async () => {
    const queue = createAsyncQueue<number>();
    queue.push(1);
    queue.push(2);
    queue.push(3);
    queue.close();

    const results: number[] = [];
    for await (const item of queue.iter()) {
      results.push(item);
    }

    expect(results).toEqual([1, 2, 3]);
  });

  // Test 12
  it("push after iter awaits — waiter is resolved immediately", async () => {
    const queue = createAsyncQueue<string>();

    const results: string[] = [];
    const consuming = (async () => {
      for await (const item of queue.iter()) {
        results.push(item);
      }
    })();

    // Push values asynchronously after the consumer has started awaiting
    await Promise.resolve();
    queue.push("hello");
    await Promise.resolve();
    queue.push("world");
    await Promise.resolve();
    queue.close();

    await consuming;
    expect(results).toEqual(["hello", "world"]);
  });

  // Test 13
  it("close with pending waiter — iter terminates cleanly", async () => {
    const queue = createAsyncQueue<number>();

    const results: number[] = [];
    const consuming = (async () => {
      for await (const item of queue.iter()) {
        results.push(item);
      }
    })();

    await Promise.resolve();
    queue.close();
    await consuming;

    expect(results).toEqual([]);
  });

  // Test 14
  it("push after close is a no-op — does not error and does not add items", async () => {
    const queue = createAsyncQueue<number>();
    queue.push(1);
    queue.close();
    // pushing after close should silently do nothing
    queue.push(2);

    const results: number[] = [];
    for await (const item of queue.iter()) {
      results.push(item);
    }

    expect(results).toEqual([1]);
  });
});
