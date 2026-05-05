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

// ★ KEEP UNCHANGED PR3a: createSession (复杂 — runFrameworkAgent inline, PR3b)
export const createSession = async (
  request: CreateSessionRequest,
): Promise<CreateSessionResponse> => {
  // FrameworkAgent runs inline on POST /sessions; on slower LLM tiers
  // (free siliconflow / deepseek) the framework synthesis routinely
  // takes 40-90s. Default 30s axios timeout fires "timeout of 30000ms
  // exceeded" mid-call. Allow 3 minutes here — the user is staring at
  // the TipsCarousel in the meantime.
  const response = await apiClient.post<CreateSessionResponse>("/api/v1/sessions", request, {
    timeout: 180_000,
  });
  return response.data;
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
