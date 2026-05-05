import type {
  CreateSessionRequest,
  CreateSessionResponse,
  DirectionFramework,
  EndSessionResponse,
  InterviewReportPayload,
  InterviewReportResponse,
  InterviewReportStatus,
  InterviewSessionStatus,
  SessionDetailResponse,
  SessionListRequest,
  SessionListResponse,
  SessionSummary,
  TriggerReportRequest,
  TriggerReportResponse,
} from "@eatit/shared-types";
import { apiClient } from "@/api/client";
import { db } from "@/services/db";
import { runFrameworkAgent } from "@/core/agents/framework";
import { llm } from "@/core/llm";

// §A0.4 §A11 §B9: createSession runs FrameworkAgent inline and writes 2 rows in a single tx.
// JS never sees ARK_API_KEY — llm singleton reads from Swift Keychain Bridge.
// generateReport remains on axios (PR3b2).
export const createSession = async (
  request: CreateSessionRequest,
): Promise<CreateSessionResponse> => {
  // 1) Read parse_results to get parse_payload_json for FrameworkAgent input.
  const parseRows = await db.query(
    "SELECT payload FROM parse_results WHERE candidate_asset_id = ?",
    [request.asset_bundle_id],
  );
  if (parseRows.length === 0) {
    throw new Error(`parse_results not found for asset_bundle_id: ${request.asset_bundle_id}`);
  }
  const parsePayloadJson = parseRows[0].payload as string;

  // 2) Build FrameworkConfigInput.
  // level: stringify the first selected direction (InterviewDirectionV32) as the
  // position-level signal the LLM uses to calibrate question depth.
  const config = {
    level: String(request.config.directions[0] ?? request.config.direction ?? "general"),
    style: request.config.style as string,
    duration_minutes:
      typeof request.config.duration_minutes === "number"
        ? request.config.duration_minutes
        : parseInt(String(request.config.duration_minutes), 10),
  };

  // 3) Run FrameworkAgent inline (~40-90s on slower LLM tiers).
  // research_payload_json is null — v3.4 createSession does not run Research opt-in.
  const fwOutput = await runFrameworkAgent(
    { parse_payload_json: parsePayloadJson, config, research_payload_json: null },
    { llm },
  );

  // 4) Map FrameworkAgentOutput → DirectionFramework (shared-types contract).
  // FrameworkAgentOutput fields: direction (4-value enum), focus_competencies,
  // opening_questions, deep_dive_anchors, pace_plan, predicted_questions.
  // DirectionFramework fields: style, direction (InterviewDirectionV32|InterviewDirection),
  // duration_minutes, stages, focus_points, risk_points.
  //
  // direction: use the user-selected direction from config (InterviewDirectionV32),
  //   not fwOutput.direction which uses a different 4-value internal enum.
  // stages: derived from pace_plan.segments; question_budget estimated proportionally
  //   (rough_minutes / total_minutes * 10, floor, min 1).
  // focus_points: competency titles from focus_competencies.
  // risk_points: not produced by FrameworkAgentOutput → empty array.
  const totalMinutes = fwOutput.pace_plan.total_minutes;
  const directionFramework: DirectionFramework = {
    style: request.config.style,
    direction: request.config.directions[0] ?? request.config.direction ?? "role_match",
    duration_minutes: totalMinutes,
    stages: fwOutput.pace_plan.segments.map((seg) => ({
      name: seg.name,
      goal: seg.goal,
      question_budget: Math.max(1, Math.floor((seg.rough_minutes / totalMinutes) * 10)),
    })),
    focus_points: fwOutput.focus_competencies.map((c) => c.title),
    risk_points: [],
  };

  // 5) Write interview_sessions + direction_frameworks in a single atomic tx.
  const sessionId = crypto.randomUUID();
  const fwId = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.tx([
    {
      sql: `INSERT INTO interview_sessions
            (id, user_id, candidate_asset_id, status, started_at, ended_at, turn_count, config_snapshot, created_at, updated_at)
            VALUES (?, 'local', ?, 'created', NULL, NULL, 0, ?, ?, ?)`,
      params: [sessionId, request.asset_bundle_id, JSON.stringify(request.config), now, now],
    },
    {
      sql: `INSERT INTO direction_frameworks
            (id, interview_session_id, payload, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)`,
      params: [fwId, sessionId, JSON.stringify(directionFramework), now, now],
    },
  ]);

  return {
    session_id: sessionId,
    status: "created",
    direction_framework: directionFramework,
  };
};

// §A0.4: read-only path; no secret bind values.
export const getSession = async (sessionId: string): Promise<SessionDetailResponse> => {
  const sessionRows = await db.query(
    `SELECT id, user_id, candidate_asset_id, status, started_at, ended_at, turn_count,
            config_snapshot, created_at, updated_at
       FROM interview_sessions
      WHERE id = ?`,
    [sessionId],
  );
  if (sessionRows.length === 0) throw new Error(`session not found: ${sessionId}`);
  const r = sessionRows[0];

  const fwRows = await db.query(
    `SELECT payload FROM direction_frameworks WHERE interview_session_id = ?`,
    [sessionId],
  );
  const directionFramework =
    fwRows.length === 0
      ? null
      : (JSON.parse(fwRows[0].payload as string) as DirectionFramework);

  const reportRows = await db.query(
    `SELECT payload, status FROM interview_reports WHERE session_id = ?`,
    [sessionId],
  );
  let latestOverallScore: number | null = null;
  let latestWeaknesses: string[] = [];
  if (reportRows.length > 0 && reportRows[0].status === "ready") {
    const payload = JSON.parse(reportRows[0].payload as string) as InterviewReportPayload;
    latestOverallScore = payload.overall_score ?? null;
    latestWeaknesses = payload.improvements ?? [];
  }

  return {
    id: r.id as string,
    user_id: r.user_id as string,
    candidate_asset_id: r.candidate_asset_id as string,
    status: r.status as InterviewSessionStatus,
    started_at: (r.started_at as string | null) ?? null,
    ended_at: (r.ended_at as string | null) ?? null,
    turn_count: r.turn_count as number,
    config_snapshot: JSON.parse(r.config_snapshot as string),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    latest_overall_score: latestOverallScore,
    latest_weaknesses: latestWeaknesses,
    config: null,
    direction_framework: directionFramework,
  };
};

// §A0.4: read-only path; no secret bind values.
export const getSessionList = async (
  request: SessionListRequest = {},
): Promise<SessionListResponse> => {
  const page = request.page ?? 1;
  const pageSize = request.page_size ?? 20;
  const offset = (page - 1) * pageSize;

  const whereClause = request.status
    ? "WHERE s.user_id = ? AND s.status = ?"
    : "WHERE s.user_id = ?";
  const whereParams: (string | number)[] = request.status
    ? ["local", request.status]
    : ["local"];

  const countRows = await db.query(
    `SELECT COUNT(*) AS total FROM interview_sessions s ${whereClause}`,
    whereParams,
  );
  const total = (countRows[0]?.total as number) ?? 0;

  const rows = await db.query(
    `SELECT s.id, s.user_id, s.candidate_asset_id, s.status, s.started_at, s.ended_at,
            s.turn_count, s.config_snapshot, s.created_at, s.updated_at,
            r.payload AS report_payload, r.status AS report_status
       FROM interview_sessions s
       LEFT JOIN interview_reports r ON r.session_id = s.id
       ${whereClause}
       ORDER BY s.created_at DESC
       LIMIT ? OFFSET ?`,
    [...whereParams, pageSize, offset],
  );

  const items: SessionSummary[] = rows.map((row) => {
    let latestOverallScore: number | null = null;
    let latestWeaknesses: string[] = [];
    if (row.report_status === "ready" && row.report_payload != null) {
      try {
        const p = JSON.parse(row.report_payload as string) as InterviewReportPayload;
        latestOverallScore = p.overall_score ?? null;
        latestWeaknesses = p.improvements ?? [];
      } catch {
        /* malformed JSON — skip score/weaknesses */
      }
    }
    return {
      id: row.id as string,
      user_id: row.user_id as string,
      candidate_asset_id: row.candidate_asset_id as string,
      status: row.status as InterviewSessionStatus,
      started_at: (row.started_at as string | null) ?? null,
      ended_at: (row.ended_at as string | null) ?? null,
      turn_count: row.turn_count as number,
      config_snapshot: JSON.parse(row.config_snapshot as string),
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      latest_overall_score: latestOverallScore,
      latest_weaknesses: latestWeaknesses,
    };
  });

  return { items, page, page_size: pageSize, total };
};

export const endSession = async (sessionId: string): Promise<EndSessionResponse> => {
  const now = new Date().toISOString();
  const result = await db.exec(
    `UPDATE interview_sessions
        SET status = 'ended', ended_at = ?, updated_at = ?
      WHERE id = ?`,
    [now, now, sessionId],
  );
  if (result.rowsAffected === 0) throw new Error(`session not found: ${sessionId}`);
  return { session_id: sessionId, status: "ended", ended_at: now };
};

// ★ KEEP UNCHANGED PR3a: generateReport (复杂 — runReportAgent inline + post_report_graph, PR3b)
export const generateReport = async (
  sessionId: string,
  request: TriggerReportRequest = {},
): Promise<TriggerReportResponse> => {
  const response = await apiClient.post<TriggerReportResponse>(
    `/api/v1/sessions/${sessionId}/report`,
    request,
    // ReportPage renders its own error UI (inline banner + retry affordance),
    // so the generic axios toast would just duplicate and confuse users.
    { skipErrorToast: true },
  );
  return response.data;
};

// §A0.4: read-only path; no secret bind values.
export const getSessionReport = async (sessionId: string): Promise<InterviewReportResponse> => {
  const rows = await db.query(
    `SELECT session_id, status, requested_at, generated_at, payload, created_at, updated_at
       FROM interview_reports
      WHERE session_id = ?`,
    [sessionId],
  );
  if (rows.length === 0) throw new Error(`report not found: ${sessionId}`);
  const r = rows[0];
  return {
    id: r.session_id as string,
    interview_session_id: r.session_id as string,
    status: r.status as InterviewReportStatus,
    requested_at: (r.requested_at as string | null) ?? null,
    generated_at: (r.generated_at as string | null) ?? null,
    payload: JSON.parse(r.payload as string),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
};
