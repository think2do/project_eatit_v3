/**
 * api/sessions — M5.4.dev.b PR3a + PR3b1 + PR3b2
 *
 * Tests the db Bridge CRUD pattern for getSession / getSessionList /
 * endSession / getSessionReport / createSession / generateReport.
 *
 * Mocks @/services/db so the bridge layer is not exercised here
 * (bridge contract is covered by infra/db.expanded.test.ts).
 *
 * §A0: no Tauri. §B9: db mock mirrors Zod Row contract.
 * §A0.4: read-only / simple-update paths — no secret bind values.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/db", () => ({
  db: {
    query: vi.fn(),
    exec: vi.fn(),
    tx: vi.fn(),
  },
}));

vi.mock("@/core/agents/framework", () => ({
  runFrameworkAgent: vi.fn(),
}));

vi.mock("@/core/agents/report", () => ({
  runReportAgent: vi.fn(),
}));

vi.mock("@/core/graphs/postReportGraph", () => ({
  buildPostReportGraph: vi.fn(),
}));

vi.mock("@/core/llm", () => ({
  llm: { generateObject: vi.fn() },
}));

import { db } from "@/services/db";
import {
  getSession,
  getSessionList,
  endSession,
  getSessionReport,
  createSession,
  generateReport,
} from "@/api/sessions";
import { runFrameworkAgent } from "@/core/agents/framework";
import { runReportAgent } from "@/core/agents/report";
import { buildPostReportGraph } from "@/core/graphs/postReportGraph";

const mockQuery = vi.mocked(db.query);
const mockExec = vi.mocked(db.exec);
const mockTx = vi.mocked(db.tx);
const fwMock = vi.mocked(runFrameworkAgent);
const reportMock = vi.mocked(runReportAgent);
const buildGraphMock = vi.mocked(buildPostReportGraph);

beforeEach(() => {
  mockQuery.mockReset();
  mockExec.mockReset();
  mockTx.mockReset();
  fwMock.mockReset();
  reportMock.mockReset();
  buildGraphMock.mockReset();
});

// ─── fixture helpers ──────────────────────────────────────────────────────────

const SESSION_ID = "sess-abc-001";
const CANDIDATE_ASSET_ID = "asset-xyz-999";

const makeSessionRow = (overrides: Record<string, unknown> = {}) => ({
  id: SESSION_ID,
  user_id: "local",
  candidate_asset_id: CANDIDATE_ASSET_ID,
  status: "ended",
  started_at: "2024-01-10T10:00:00.000Z",
  ended_at: "2024-01-10T11:00:00.000Z",
  turn_count: 8,
  config_snapshot: JSON.stringify({ style: "behavioral", direction: "product" }),
  created_at: "2024-01-10T09:59:00.000Z",
  updated_at: "2024-01-10T11:00:00.000Z",
  ...overrides,
});

const FRAMEWORK_PAYLOAD = JSON.stringify({
  style: "behavioral",
  direction: "product",
  duration_minutes: 45,
  stages: [],
  focus_points: ["leadership"],
  risk_points: [],
});

const REPORT_PAYLOAD = JSON.stringify({
  overall_summary: "Strong candidate",
  round_reviews: [],
  strengths: ["clarity"],
  improvements: ["depth", "examples"],
  next_actions: [],
  pass_probability: 75,
  reasons: [],
  overall_score: 82,
  pass_likelihood: "中上",
});

// ─── getSession ───────────────────────────────────────────────────────────────

describe("getSession", () => {
  it("returns full SessionDetailResponse when session + framework + ready report all exist", async () => {
    mockQuery
      .mockResolvedValueOnce([makeSessionRow()])
      .mockResolvedValueOnce([{ payload: FRAMEWORK_PAYLOAD }])
      .mockResolvedValueOnce([{ payload: REPORT_PAYLOAD, status: "ready" }]);

    const result = await getSession(SESSION_ID);

    expect(result.id).toBe(SESSION_ID);
    expect(result.user_id).toBe("local");
    expect(result.candidate_asset_id).toBe(CANDIDATE_ASSET_ID);
    expect(result.status).toBe("ended");
    expect(result.turn_count).toBe(8);
    expect(result.config_snapshot).toEqual({ style: "behavioral", direction: "product" });
    expect(result.direction_framework).not.toBeNull();
    expect(result.direction_framework?.focus_points).toEqual(["leadership"]);
    expect(result.latest_overall_score).toBe(82);
    expect(result.latest_weaknesses).toEqual(["depth", "examples"]);
    expect(result.config).toBeNull();
  });

  it("returns direction_framework=null when no framework row exists", async () => {
    mockQuery
      .mockResolvedValueOnce([makeSessionRow()])
      .mockResolvedValueOnce([])           // no framework
      .mockResolvedValueOnce([]);           // no report

    const result = await getSession(SESSION_ID);

    expect(result.direction_framework).toBeNull();
    expect(result.latest_overall_score).toBeNull();
    expect(result.latest_weaknesses).toEqual([]);
  });

  it("returns score=null + weaknesses=[] when no report row exists", async () => {
    mockQuery
      .mockResolvedValueOnce([makeSessionRow()])
      .mockResolvedValueOnce([{ payload: FRAMEWORK_PAYLOAD }])
      .mockResolvedValueOnce([]);           // no report

    const result = await getSession(SESSION_ID);

    expect(result.latest_overall_score).toBeNull();
    expect(result.latest_weaknesses).toEqual([]);
  });

  it("returns score=null when report status is 'pending' (not ready)", async () => {
    mockQuery
      .mockResolvedValueOnce([makeSessionRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ payload: REPORT_PAYLOAD, status: "pending" }]);

    const result = await getSession(SESSION_ID);

    expect(result.latest_overall_score).toBeNull();
    expect(result.latest_weaknesses).toEqual([]);
  });

  it("throws when session row does not exist", async () => {
    mockQuery.mockResolvedValueOnce([]);

    await expect(getSession(SESSION_ID)).rejects.toThrow(`session not found: ${SESSION_ID}`);
  });
});

// ─── getSessionList ───────────────────────────────────────────────────────────

describe("getSessionList", () => {
  it("returns empty list when no sessions exist", async () => {
    mockQuery
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    const result = await getSessionList();

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.page_size).toBe(20);
  });

  it("returns a full page of items with defaults (page=1, page_size=20)", async () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      makeSessionRow({
        id: `sess-${i}`,
        config_snapshot: JSON.stringify({}),
        report_payload: null,
        report_status: null,
      }),
    );

    mockQuery
      .mockResolvedValueOnce([{ total: 10 }])
      .mockResolvedValueOnce(rows);

    const result = await getSessionList();

    expect(result.items).toHaveLength(10);
    expect(result.total).toBe(10);
    expect(result.page).toBe(1);
    expect(result.page_size).toBe(20);
  });

  it("applies pagination correctly for page=2, page_size=5", async () => {
    mockQuery
      .mockResolvedValueOnce([{ total: 15 }])
      .mockResolvedValueOnce([]);

    const result = await getSessionList({ page: 2, page_size: 5 });

    expect(result.page).toBe(2);
    expect(result.page_size).toBe(5);

    // Verify LIMIT/OFFSET passed correctly in second db.query call
    const dataCallArgs = mockQuery.mock.calls[1];
    const params = dataCallArgs[1] as unknown[];
    // params ends with [pageSize, offset] → [5, 5]
    expect(params[params.length - 2]).toBe(5);  // LIMIT
    expect(params[params.length - 1]).toBe(5);  // OFFSET = (2-1)*5
  });

  it("filters by status when status param provided", async () => {
    mockQuery
      .mockResolvedValueOnce([{ total: 3 }])
      .mockResolvedValueOnce([]);

    await getSessionList({ status: "ended" });

    const countCallArgs = mockQuery.mock.calls[0];
    const params = countCallArgs[1] as unknown[];
    expect(params).toContain("ended");
    expect(params).toContain("local");
  });

  it("populates latest_overall_score + latest_weaknesses from joined ready report", async () => {
    const rowWithReport = makeSessionRow({
      report_payload: REPORT_PAYLOAD,
      report_status: "ready",
    });

    mockQuery
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([rowWithReport]);

    const result = await getSessionList();

    expect(result.items[0].latest_overall_score).toBe(82);
    expect(result.items[0].latest_weaknesses).toEqual(["depth", "examples"]);
  });

  it("always binds user_id='local' in the WHERE clause", async () => {
    mockQuery
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await getSessionList();

    const countCallArgs = mockQuery.mock.calls[0];
    expect(countCallArgs[1]).toContain("local");
  });
});

// ─── endSession ───────────────────────────────────────────────────────────────

describe("endSession", () => {
  it("returns EndSessionResponse on success", async () => {
    mockExec.mockResolvedValue({ rowsAffected: 1 });

    const result = await endSession(SESSION_ID);

    expect(result.session_id).toBe(SESSION_ID);
    expect(result.status).toBe("ended");
    expect(typeof result.ended_at).toBe("string");
    expect(new Date(result.ended_at).toISOString()).toBe(result.ended_at);
  });

  it("throws when session row does not exist (rowsAffected=0)", async () => {
    mockExec.mockResolvedValue({ rowsAffected: 0 });

    await expect(endSession(SESSION_ID)).rejects.toThrow(`session not found: ${SESSION_ID}`);
  });

  it("binds a valid ISO timestamp in the UPDATE SQL", async () => {
    mockExec.mockResolvedValue({ rowsAffected: 1 });

    const before = Date.now();
    await endSession(SESSION_ID);
    const after = Date.now();

    const params = mockExec.mock.calls[0][1] as unknown[];
    // params[0] = ended_at, params[1] = updated_at, params[2] = sessionId
    const endedAt = params[0] as string;
    const ts = new Date(endedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
    expect(new Date(endedAt).toISOString()).toBe(endedAt);
  });
});

// ─── getSessionReport ─────────────────────────────────────────────────────────

describe("getSessionReport", () => {
  it("returns InterviewReportResponse with JSON.parsed payload when row exists", async () => {
    mockQuery.mockResolvedValue([
      {
        session_id: SESSION_ID,
        status: "ready",
        requested_at: "2024-01-10T11:00:00.000Z",
        generated_at: "2024-01-10T11:05:00.000Z",
        payload: REPORT_PAYLOAD,
        created_at: "2024-01-10T11:00:00.000Z",
        updated_at: "2024-01-10T11:05:00.000Z",
      },
    ]);

    const result = await getSessionReport(SESSION_ID);

    expect(result.id).toBe(SESSION_ID);
    expect(result.interview_session_id).toBe(SESSION_ID);
    expect(result.status).toBe("ready");
    expect(result.payload.overall_score).toBe(82);
    expect(result.payload.improvements).toEqual(["depth", "examples"]);
    expect(result.requested_at).toBe("2024-01-10T11:00:00.000Z");
    expect(result.generated_at).toBe("2024-01-10T11:05:00.000Z");
  });

  it("throws when report row does not exist", async () => {
    mockQuery.mockResolvedValue([]);

    await expect(getSessionReport(SESSION_ID)).rejects.toThrow(
      `report not found: ${SESSION_ID}`,
    );
  });

  it("binds sessionId in the WHERE clause", async () => {
    mockQuery.mockResolvedValue([]);

    try {
      await getSessionReport(SESSION_ID);
    } catch {
      // expected throw — we only care about what was passed to db.query
    }

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE session_id = ?"),
      [SESSION_ID],
    );
  });
});

// ─── createSession ────────────────────────────────────────────────────────────

const FW_OUTPUT = {
  direction: "project_deep_dive" as const,
  focus_competencies: [
    { title: "需求抽象", why: "核心PM能力", probe_hint: "追问拆解逻辑" },
    { title: "指标设计", why: "数据驱动决策", probe_hint: "追问北极星指标" },
  ],
  opening_questions: ["介绍一下你最近的项目", "你在团队中扮演什么角色"],
  deep_dive_anchors: [
    { anchor: "用户增长项目", probe_chain: ["背景?", "方案?", "结果?", "反思?"] },
  ],
  pace_plan: {
    total_minutes: 30,
    segments: [
      { name: "暖场", rough_minutes: 3, goal: "破冰" },
      { name: "项目深挖", rough_minutes: 20, goal: "考察执行力" },
      { name: "反问", rough_minutes: 7, goal: "候选人提问" },
    ],
  },
  predicted_questions: null,
};

const CREATE_REQUEST = {
  asset_bundle_id: CANDIDATE_ASSET_ID,
  config: {
    style: "structured" as const,
    directions: ["ai-insight" as const],
    duration_minutes: 30 as const,
    direction: null,
  },
};

describe("createSession", () => {
  it("returns CreateSessionResponse with session_id, status='created', and direction_framework on success", async () => {
    mockQuery.mockResolvedValueOnce([{ payload: '{"key":"val"}' }]);
    fwMock.mockResolvedValueOnce(FW_OUTPUT as any);
    mockTx.mockResolvedValueOnce(undefined);

    const result = await createSession(CREATE_REQUEST);

    expect(result.session_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(result.status).toBe("created");
    expect(result.direction_framework.style).toBe("structured");
    expect(result.direction_framework.direction).toBe("ai-insight");
    expect(result.direction_framework.duration_minutes).toBe(30);
  });

  it("throws when parse_results row does not exist for asset_bundle_id", async () => {
    mockQuery.mockResolvedValueOnce([]);

    await expect(createSession(CREATE_REQUEST)).rejects.toThrow(
      `parse_results not found for asset_bundle_id: ${CANDIDATE_ASSET_ID}`,
    );
    expect(fwMock).not.toHaveBeenCalled();
  });

  it("maps focus_competencies titles to direction_framework.focus_points", async () => {
    mockQuery.mockResolvedValueOnce([{ payload: '{"key":"val"}' }]);
    fwMock.mockResolvedValueOnce(FW_OUTPUT as any);
    mockTx.mockResolvedValueOnce(undefined);

    const result = await createSession(CREATE_REQUEST);

    expect(result.direction_framework.focus_points).toEqual(["需求抽象", "指标设计"]);
    expect(result.direction_framework.risk_points).toEqual([]);
  });

  it("maps pace_plan.segments to direction_framework.stages with question_budget >= 1", async () => {
    mockQuery.mockResolvedValueOnce([{ payload: '{"key":"val"}' }]);
    fwMock.mockResolvedValueOnce(FW_OUTPUT as any);
    mockTx.mockResolvedValueOnce(undefined);

    const result = await createSession(CREATE_REQUEST);

    expect(result.direction_framework.stages).toHaveLength(3);
    for (const stage of result.direction_framework.stages) {
      expect(stage.question_budget).toBeGreaterThanOrEqual(1);
    }
    expect(result.direction_framework.stages[0].name).toBe("暖场");
    expect(result.direction_framework.stages[1].name).toBe("项目深挖");
  });

  it("tx inserts interview_sessions row with user_id='local', status='created', turn_count=0, config_snapshot", async () => {
    mockQuery.mockResolvedValueOnce([{ payload: '{"key":"val"}' }]);
    fwMock.mockResolvedValueOnce(FW_OUTPUT as any);
    mockTx.mockResolvedValueOnce(undefined);

    const result = await createSession(CREATE_REQUEST);

    expect(mockTx).toHaveBeenCalledTimes(1);
    const [statements] = mockTx.mock.calls[0] as any[];
    const sessionInsert = statements[0];
    expect(sessionInsert.sql).toContain("INSERT INTO interview_sessions");
    const params = sessionInsert.params as unknown[];
    const sessionId = params[0] as string;
    expect(sessionId).toBe(result.session_id);
    expect(params[1]).toBe(CANDIDATE_ASSET_ID);       // candidate_asset_id
    expect(params[2]).toBe(JSON.stringify(CREATE_REQUEST.config)); // config_snapshot
  });

  it("tx inserts direction_frameworks row linking to session_id", async () => {
    mockQuery.mockResolvedValueOnce([{ payload: '{"key":"val"}' }]);
    fwMock.mockResolvedValueOnce(FW_OUTPUT as any);
    mockTx.mockResolvedValueOnce(undefined);

    const result = await createSession(CREATE_REQUEST);

    const [statements] = mockTx.mock.calls[0] as any[];
    const fwInsert = statements[1];
    expect(fwInsert.sql).toContain("INSERT INTO direction_frameworks");
    const params = fwInsert.params as unknown[];
    expect(params[1]).toBe(result.session_id);         // interview_session_id
    const storedFw = JSON.parse(params[2] as string);
    expect(storedFw.style).toBe("structured");
    expect(storedFw.focus_points).toEqual(["需求抽象", "指标设计"]);
  });

  it("propagates FrameworkAgent errors without swallowing them", async () => {
    mockQuery.mockResolvedValueOnce([{ payload: '{"key":"val"}' }]);
    fwMock.mockRejectedValueOnce(new Error("LLM timeout"));

    await expect(createSession(CREATE_REQUEST)).rejects.toThrow("LLM timeout");
    expect(mockTx).not.toHaveBeenCalled();
  });

  it("passes research_payload_json=null to runFrameworkAgent (v3.4 createSession does not run Research)", async () => {
    mockQuery.mockResolvedValueOnce([{ payload: '{"resume":"text"}' }]);
    fwMock.mockResolvedValueOnce(FW_OUTPUT as any);
    mockTx.mockResolvedValueOnce(undefined);

    await createSession(CREATE_REQUEST);

    const [input] = fwMock.mock.calls[0] as any[];
    expect(input.research_payload_json).toBeNull();
    expect(input.parse_payload_json).toBe('{"resume":"text"}');
  });
});

// ─── generateReport ───────────────────────────────────────────────────────────

const REPORT_OUTPUT = {
  pass_probability: 70,
  summary: "Solid candidate with good structure",
  reasons: [],
  next_actions: [],
  pass_likelihood: "中" as const,
  overall_score: 70,
  ai_verdict: null,
  dimensions: [],
  round_reviews_v2: [],
  next_actions_v2: null,
};

const PARSE_PAYLOAD = JSON.stringify({ skills: ["TypeScript", "React"] });
const FRAMEWORK_JSON = JSON.stringify({ style: "behavioral", direction: "product", duration_minutes: 45 });

/** Sets up db.query mocks in order: sessions → direction_frameworks → parse_results → interview_turns */
function setupHappyPathMocks(turnRows: Record<string, unknown>[] = []) {
  mockQuery
    .mockResolvedValueOnce([{ candidate_asset_id: CANDIDATE_ASSET_ID, status: "ended" }]) // sessions
    .mockResolvedValueOnce([{ payload: FRAMEWORK_JSON }])                                  // direction_frameworks
    .mockResolvedValueOnce([{ payload: PARSE_PAYLOAD }])                                   // parse_results
    .mockResolvedValueOnce(turnRows);                                                       // interview_turns + turn_assessments
}

describe("generateReport", () => {
  beforeEach(() => {
    reportMock.mockResolvedValue(REPORT_OUTPUT as any);
    buildGraphMock.mockReturnValue({
      invoke: vi.fn().mockResolvedValue({}),
    } as any);
    mockExec.mockResolvedValue({ rowsAffected: 1 });
  });

  it("happy path: reads 4 tables, runs ReportAgent, inserts report, returns {session_id, status:'ready', requested_at}", async () => {
    setupHappyPathMocks();

    const result = await generateReport(SESSION_ID);

    expect(result.session_id).toBe(SESSION_ID);
    expect(result.status).toBe("ready");
    expect(typeof result.requested_at).toBe("string");
    expect(new Date(result.requested_at).toISOString()).toBe(result.requested_at);
  });

  it("throws 'session not found' when interview_sessions row missing", async () => {
    mockQuery.mockResolvedValueOnce([]);

    await expect(generateReport(SESSION_ID)).rejects.toThrow(`session not found: ${SESSION_ID}`);
    expect(reportMock).not.toHaveBeenCalled();
  });

  it("throws 'direction_framework not found' when direction_frameworks row missing", async () => {
    mockQuery
      .mockResolvedValueOnce([{ candidate_asset_id: CANDIDATE_ASSET_ID, status: "ended" }])
      .mockResolvedValueOnce([]);

    await expect(generateReport(SESSION_ID)).rejects.toThrow(
      `direction_framework not found for session: ${SESSION_ID}`,
    );
    expect(reportMock).not.toHaveBeenCalled();
  });

  it("throws 'parse_results not found' when parse_results row missing", async () => {
    mockQuery
      .mockResolvedValueOnce([{ candidate_asset_id: CANDIDATE_ASSET_ID, status: "ended" }])
      .mockResolvedValueOnce([{ payload: FRAMEWORK_JSON }])
      .mockResolvedValueOnce([]);

    await expect(generateReport(SESSION_ID)).rejects.toThrow(
      `parse_results not found for asset: ${CANDIDATE_ASSET_ID}`,
    );
    expect(reportMock).not.toHaveBeenCalled();
  });

  it("runs ReportAgent with empty turns array when no interview_turns rows exist", async () => {
    setupHappyPathMocks([]);

    await generateReport(SESSION_ID);

    const [input] = reportMock.mock.calls[0] as any[];
    expect(input.turns).toEqual([]);
    expect(input.parse_payload_json).toBe(PARSE_PAYLOAD);
    expect(input.framework_json).toBe(FRAMEWORK_JSON);
    expect(input.long_term_summary).toBeNull();
  });

  it("maps turn with both strengths + weaknesses → assessment.summary with 优势/不足 parts", async () => {
    const turnRows = [
      {
        turn_id: "t1",
        turn_index: 0,
        question_text: "Tell me about your project",
        answer_text: "I led a team of 5",
        strengths_json: JSON.stringify(["领导力", "执行力"]),
        weaknesses_json: JSON.stringify(["细节把控"]),
      },
    ];
    setupHappyPathMocks(turnRows);

    await generateReport(SESSION_ID);

    const [input] = reportMock.mock.calls[0] as any[];
    expect(input.turns).toHaveLength(1);
    const turn = input.turns[0];
    expect(turn.question).toBe("Tell me about your project");
    expect(turn.answer).toBe("I led a team of 5");
    expect(turn.assessment).not.toBeNull();
    expect(turn.assessment.summary).toContain("优势:领导力、执行力");
    expect(turn.assessment.summary).toContain("不足:细节把控");
  });

  it("maps turn without turn_assessments → assessment=null", async () => {
    const turnRows = [
      {
        turn_id: "t1",
        turn_index: 0,
        question_text: "Question?",
        answer_text: "Answer.",
        strengths_json: null,
        weaknesses_json: null,
      },
    ];
    setupHappyPathMocks(turnRows);

    await generateReport(SESSION_ID);

    const [input] = reportMock.mock.calls[0] as any[];
    expect(input.turns[0].assessment).toBeNull();
  });

  it("maps turn with malformed strengths JSON → assessment=null (silent skip)", async () => {
    const turnRows = [
      {
        turn_id: "t1",
        turn_index: 0,
        question_text: "Q",
        answer_text: "A",
        strengths_json: "NOT_VALID_JSON",
        weaknesses_json: "[]",
      },
    ];
    setupHappyPathMocks(turnRows);

    await generateReport(SESSION_ID);

    const [input] = reportMock.mock.calls[0] as any[];
    expect(input.turns[0].assessment).toBeNull();
  });

  it("inserts interview_reports with ON CONFLICT upsert SQL and sessionId + 'ready' status", async () => {
    setupHappyPathMocks();

    await generateReport(SESSION_ID);

    expect(mockExec).toHaveBeenCalledTimes(1);
    const [sql, params] = mockExec.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("INSERT INTO interview_reports");
    expect(sql).toContain("ON CONFLICT(session_id) DO UPDATE SET");
    expect(params[0]).toBe(SESSION_ID);
    expect(sql).toContain("'ready'");
  });

  it("calls buildPostReportGraph (fire-and-forget) with coach_input=null", async () => {
    setupHappyPathMocks();
    const invokeMock = vi.fn().mockResolvedValue({});
    buildGraphMock.mockReturnValue({ invoke: invokeMock } as any);

    await generateReport(SESSION_ID);

    expect(buildGraphMock).toHaveBeenCalledTimes(1);
    const stateArg = invokeMock.mock.calls[0][0] as Record<string, unknown>;
    expect(stateArg.coach_input).toBeNull();
    expect(stateArg.user_id).toBe("local");
    expect(stateArg.last_session_id).toBe(SESSION_ID);
  });

  it("reflection_input.report_id equals sessionId (§6.2 PK lock)", async () => {
    setupHappyPathMocks();
    const invokeMock = vi.fn().mockResolvedValue({});
    buildGraphMock.mockReturnValue({ invoke: invokeMock } as any);

    await generateReport(SESSION_ID);

    const stateArg = invokeMock.mock.calls[0][0] as Record<string, unknown>;
    const reflectionInput = stateArg.reflection_input as Record<string, unknown>;
    expect(reflectionInput.report_id).toBe(SESSION_ID);
    expect(reflectionInput.session_id).toBe(SESSION_ID);
  });

  it("does not throw when buildPostReportGraph.invoke rejects (fire-and-forget noop catch)", async () => {
    setupHappyPathMocks();
    const invokeMock = vi.fn().mockRejectedValue(new Error("graph error"));
    buildGraphMock.mockReturnValue({ invoke: invokeMock } as any);

    // Should not throw — fire-and-forget catches errors
    await expect(generateReport(SESSION_ID)).resolves.toBeDefined();
  });
});
