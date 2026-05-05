/**
 * api/metaReports — M5.4.dev.b PR4b.dev2
 *
 * Tests the db Bridge + runMetaReportAgent inline pattern for
 * triggerMetaReport / getMetaReport / getMetaReportList.
 *
 * Mocks @/services/db and @/core/agents/meta_report so the bridge and
 * LLM layers are not exercised here.
 *
 * §A0: no Tauri. §B9: db mock mirrors Zod Row contract.
 * §A0.4: no secret bind values in any tested SQL path.
 * §A11: agent input/output schema is .strict() — validated inside agent (PR4b.dev1 done).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/db", () => ({
  db: {
    query: vi.fn(),
    exec: vi.fn(),
    tx: vi.fn(),
  },
}));

vi.mock("@/core/agents/meta_report", () => ({
  runMetaReportAgent: vi.fn(),
}));

vi.mock("@/core/llm", () => ({
  llm: { generateObject: vi.fn() },
}));

import { db } from "@/services/db";
import { runMetaReportAgent } from "@/core/agents/meta_report";
import {
  triggerMetaReport,
  getMetaReport,
  getMetaReportList,
} from "@/api/metaReports";

const mockQuery = vi.mocked(db.query);
const mockExec = vi.mocked(db.exec);
const agentMock = vi.mocked(runMetaReportAgent);

beforeEach(() => {
  mockQuery.mockReset();
  mockExec.mockReset();
  agentMock.mockReset();
});

// ─── fixtures ─────────────────────────────────────────────────────────────────

const SESSION_ID_1 = "sess-aaa-001";
const SESSION_ID_2 = "sess-bbb-002";
const META_REPORT_ID = "meta-report-xyz-999";

const makeSessionRow = (sessionId: string, createdAt: string) => ({
  session_id: sessionId,
  session_created_at: createdAt,
  config_snapshot_json: JSON.stringify({ style: "behavioral", direction: "product" }),
  report_payload_json: JSON.stringify({ overall_score: 75, pass_probability: 70 }),
});

const AGENT_OUTPUT = {
  overall_trend_summary: "Candidate shows steady improvement across sessions",
  recurring_weaknesses: [],
  improvement_signals: [],
  pass_probability_series: [
    { session_id: SESSION_ID_1, session_created_at: "2024-01-10T10:00:00.000Z", pass_probability: 70 },
  ],
  next_focus_areas: [],
};

const makeMetaReportRow = (overrides: Record<string, unknown> = {}) => ({
  id: META_REPORT_ID,
  user_id: "local",
  covered_session_ids: JSON.stringify([SESSION_ID_1]),
  status: "ready",
  payload: JSON.stringify(AGENT_OUTPUT),
  created_at: "2024-01-10T12:00:00.000Z",
  updated_at: "2024-01-10T12:05:00.000Z",
  ...overrides,
});

// ─── triggerMetaReport ────────────────────────────────────────────────────────

describe("triggerMetaReport", () => {
  beforeEach(() => {
    mockExec.mockResolvedValue({ rowsAffected: 1 });
    agentMock.mockResolvedValue(AGENT_OUTPUT as any);
  });

  it("1: no session_ids → loads all ready sessions without IN clause", async () => {
    mockQuery.mockResolvedValueOnce([
      makeSessionRow(SESSION_ID_1, "2024-01-10T10:00:00.000Z"),
      makeSessionRow(SESSION_ID_2, "2024-01-11T10:00:00.000Z"),
    ]);

    await triggerMetaReport({});

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain("IN (");
    expect(params).toEqual(["local"]);
    expect(agentMock).toHaveBeenCalledTimes(1);
  });

  it("2: with session_ids → SQL includes IN clause with correct placeholder count", async () => {
    mockQuery.mockResolvedValueOnce([
      makeSessionRow(SESSION_ID_1, "2024-01-10T10:00:00.000Z"),
      makeSessionRow(SESSION_ID_2, "2024-01-11T10:00:00.000Z"),
    ]);

    await triggerMetaReport({ session_ids: [SESSION_ID_1, SESSION_ID_2] });

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("IN (?,?)");
    // params: [USER_ID, SESSION_ID_1, SESSION_ID_2]
    expect(params).toHaveLength(3);
    expect(params[0]).toBe("local");
    expect(params[1]).toBe(SESSION_ID_1);
    expect(params[2]).toBe(SESSION_ID_2);
  });

  it("3: 0 eligible sessions → throws '至少需要 1 场已完成的面试', INSERT never called", async () => {
    mockQuery.mockResolvedValueOnce([]);

    await expect(triggerMetaReport()).rejects.toThrow("至少需要 1 场已完成的面试");
    expect(mockExec).not.toHaveBeenCalled();
    expect(agentMock).not.toHaveBeenCalled();
  });

  it("4: ready path → exec called twice: INSERT then UPDATE with status='ready'", async () => {
    mockQuery.mockResolvedValueOnce([
      makeSessionRow(SESSION_ID_1, "2024-01-10T10:00:00.000Z"),
    ]);

    await triggerMetaReport();

    expect(mockExec).toHaveBeenCalledTimes(2);

    const [insertSql] = mockExec.mock.calls[0] as [string, unknown[]];
    expect(insertSql).toContain("INSERT INTO meta_reports");
    expect(insertSql).toContain("'generating'");

    const [updateSql, updateParams] = mockExec.mock.calls[1] as [string, unknown[]];
    expect(updateSql).toContain("UPDATE meta_reports SET status");
    expect(updateParams[0]).toBe("ready");
  });

  it("5: agent throws → status='failed' + payload={detail}, does not re-throw, UPDATE still called", async () => {
    mockQuery.mockResolvedValueOnce([
      makeSessionRow(SESSION_ID_1, "2024-01-10T10:00:00.000Z"),
    ]);
    agentMock.mockRejectedValueOnce(new Error("LLM timeout"));

    const result = await triggerMetaReport();

    expect(result.status).toBe("failed");
    expect(mockExec).toHaveBeenCalledTimes(2);

    const [updateSql, updateParams] = mockExec.mock.calls[1] as [string, unknown[]];
    expect(updateSql).toContain("UPDATE meta_reports");
    expect(updateParams[0]).toBe("failed");
    const payloadDetail = JSON.parse(updateParams[1] as string) as { detail: string };
    expect(payloadDetail.detail).toContain("LLM timeout");
  });

  it("6: returned id is UUID v4 format", async () => {
    mockQuery.mockResolvedValueOnce([
      makeSessionRow(SESSION_ID_1, "2024-01-10T10:00:00.000Z"),
    ]);

    const result = await triggerMetaReport();

    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(result.task_id).toBe(result.id);
  });

  it("7: covered_session_ids order matches SQL ORDER BY created_at ASC", async () => {
    // SQL returns sessions in ASC order already; verify output preserves that order
    mockQuery.mockResolvedValueOnce([
      makeSessionRow(SESSION_ID_1, "2024-01-10T10:00:00.000Z"),
      makeSessionRow(SESSION_ID_2, "2024-01-11T10:00:00.000Z"),
    ]);

    const result = await triggerMetaReport();

    expect(result.covered_session_ids).toEqual([SESSION_ID_1, SESSION_ID_2]);

    // Also verify the agent received sessions in the same order
    const [agentInput] = agentMock.mock.calls[0] as [{ sessions: { session_id: string }[] }, unknown];
    expect(agentInput.sessions[0].session_id).toBe(SESSION_ID_1);
    expect(agentInput.sessions[1].session_id).toBe(SESSION_ID_2);
  });
});

// ─── getMetaReport ────────────────────────────────────────────────────────────

describe("getMetaReport", () => {
  it("8: found → parses covered_session_ids + payload JSON, returns MetaReportDetailResponse", async () => {
    mockQuery.mockResolvedValueOnce([makeMetaReportRow()]);

    const result = await getMetaReport(META_REPORT_ID);

    expect(result.id).toBe(META_REPORT_ID);
    expect(result.user_id).toBe("local");
    expect(result.status).toBe("ready");
    expect(result.covered_session_ids).toEqual([SESSION_ID_1]);
    expect(result.payload).toEqual(AGENT_OUTPUT);
    expect(result.created_at).toBe("2024-01-10T12:00:00.000Z");
    expect(result.updated_at).toBe("2024-01-10T12:05:00.000Z");
  });

  it("9: not found → throws 'meta report not found: <id>'", async () => {
    mockQuery.mockResolvedValueOnce([]);

    await expect(getMetaReport(META_REPORT_ID)).rejects.toThrow(
      `meta report not found: ${META_REPORT_ID}`,
    );
  });

  it("10: payload=NULL (generating state) → result.payload is null", async () => {
    mockQuery.mockResolvedValueOnce([
      makeMetaReportRow({ payload: null, status: "generating" }),
    ]);

    const result = await getMetaReport(META_REPORT_ID);

    expect(result.status).toBe("generating");
    expect(result.payload).toBeNull();
  });
});

// ─── getMetaReportList ────────────────────────────────────────────────────────

describe("getMetaReportList", () => {
  it("11: page=2, page_size=10 → OFFSET=10 LIMIT=10 passed to db.query", async () => {
    mockQuery
      .mockResolvedValueOnce([{ cnt: 25 }])
      .mockResolvedValueOnce([]);

    const result = await getMetaReportList({ page: 2, page_size: 10 });

    expect(result.page).toBe(2);
    expect(result.page_size).toBe(10);
    expect(result.total).toBe(25);

    const dataCallParams = mockQuery.mock.calls[1][1] as unknown[];
    // params: [USER_ID, pageSize, offset]
    expect(dataCallParams[dataCallParams.length - 2]).toBe(10); // LIMIT
    expect(dataCallParams[dataCallParams.length - 1]).toBe(10); // OFFSET = (2-1)*10
  });

  it("12: total=0 → items=[], total=0 with default pagination", async () => {
    mockQuery
      .mockResolvedValueOnce([{ cnt: 0 }])
      .mockResolvedValueOnce([]);

    const result = await getMetaReportList();

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.page_size).toBe(20);
  });

  it("items are mapped with session_count = covered_session_ids.length", async () => {
    const twoSessionIds = JSON.stringify([SESSION_ID_1, SESSION_ID_2]);
    mockQuery
      .mockResolvedValueOnce([{ cnt: 1 }])
      .mockResolvedValueOnce([
        {
          id: META_REPORT_ID,
          status: "ready",
          covered_session_ids: twoSessionIds,
          created_at: "2024-01-10T12:00:00.000Z",
        },
      ]);

    const result = await getMetaReportList();

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.id).toBe(META_REPORT_ID);
    expect(item.status).toBe("ready");
    expect(item.covered_session_ids).toEqual([SESSION_ID_1, SESSION_ID_2]);
    expect(item.session_count).toBe(2);
    expect(item.created_at).toBe("2024-01-10T12:00:00.000Z");
  });
});
