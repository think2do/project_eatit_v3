// §A0 §A0.4 §A11 §K: metaReports.ts — fully local. No axios/apiClient.
// triggerMetaReport: multi-table read + runMetaReportAgent inline + db INSERT/UPDATE.
// getMetaReport / getMetaReportList: direct SQLite reads.
// JS never sees ARK_API_KEY — llm singleton reads from Swift Keychain Bridge.
import type {
  MetaReportDetailResponse,
  MetaReportListItem,
  MetaReportListResponse,
  MetaReportStatus,
  TriggerMetaReportRequest,
  TriggerMetaReportResponse,
} from "@eatit/shared-types";
import type { MetaReportAgentSessionInput } from "@/core/schemas/meta-report";
import { runMetaReportAgent } from "@/core/agents/meta_report";
import { db } from "@/services/db";
import type { DBValue } from "@/services/db";
import { llm } from "@/core/llm";

const USER_ID = "local";

async function loadEligibleSessions(
  filterIds: string[] | null,
): Promise<MetaReportAgentSessionInput[]> {
  const baseSql = `
    SELECT s.id AS session_id, s.created_at AS session_created_at,
           s.config_snapshot AS config_snapshot_json,
           r.payload AS report_payload_json
      FROM interview_sessions s
      JOIN interview_reports r ON r.session_id = s.id
     WHERE s.user_id = ? AND r.status = 'ready'
  `;
  let sql = baseSql;
  let params: DBValue[] = [USER_ID];
  if (filterIds && filterIds.length > 0) {
    const placeholders = filterIds.map(() => "?").join(",");
    sql = `${baseSql} AND s.id IN (${placeholders})`;
    params = [...params, ...filterIds];
  }
  sql += ` ORDER BY s.created_at ASC`;
  const rows = await db.query(sql, params);
  return rows.map((r) => ({
    session_id: r.session_id as string,
    session_created_at: r.session_created_at as string,
    config_snapshot_json: (r.config_snapshot_json as string) ?? "{}",
    report_payload_json: (r.report_payload_json as string) ?? "{}",
  }));
}

// §A0.4 §A11 §K: triggerMetaReport — synchronous mode (TS port).
// Waits for agent completion, returns status='ready'|'failed' directly.
// No task_queue: task_id field is filled with metaReportId for backward-compat.
export const triggerMetaReport = async (
  request: TriggerMetaReportRequest = {},
): Promise<TriggerMetaReportResponse> => {
  // 1) Load eligible sessions (all ready reports, optionally filtered by session_ids)
  const filterIds = request.session_ids ?? null;
  const sessions = await loadEligibleSessions(filterIds);
  if (sessions.length === 0) {
    throw new Error("至少需要 1 场已完成的面试");
  }

  // 2) INSERT meta_reports row with status='generating'
  const metaReportId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const coveredSessionIds = sessions.map((s) => s.session_id);
  await db.exec(
    `INSERT INTO meta_reports (id, user_id, covered_session_ids, status, payload, created_at, updated_at)
     VALUES (?, ?, ?, 'generating', NULL, ?, ?)`,
    [metaReportId, USER_ID, JSON.stringify(coveredSessionIds), createdAt, createdAt],
  );

  // 3) Run agent inline; capture LLM error → mark failed (do not re-throw)
  let payloadJson: string;
  let finalStatus: MetaReportStatus;
  try {
    const output = await runMetaReportAgent({ sessions }, { llm });
    payloadJson = JSON.stringify(output);
    finalStatus = "ready";
  } catch (err) {
    payloadJson = JSON.stringify({
      detail: `${(err as Error).name ?? "Error"}: ${(err as Error).message ?? String(err)}`,
    });
    finalStatus = "failed";
  }

  // 4) UPDATE row to terminal status
  const updatedAt = new Date().toISOString();
  await db.exec(
    `UPDATE meta_reports SET status = ?, payload = ?, updated_at = ? WHERE id = ?`,
    [finalStatus, payloadJson, updatedAt, metaReportId],
  );

  // 5) Return response (task_id = metaReportId — backward-compat placeholder, UI uses status)
  return {
    id: metaReportId,
    task_id: metaReportId,
    status: finalStatus,
    covered_session_ids: coveredSessionIds,
    created_at: createdAt,
  };
};

// §A0.4: read-only path; no secret bind values.
export const getMetaReport = async (
  metaReportId: string,
): Promise<MetaReportDetailResponse> => {
  const rows = await db.query(
    `SELECT id, user_id, covered_session_ids, status, payload, created_at, updated_at
       FROM meta_reports WHERE id = ? AND user_id = ?`,
    [metaReportId, USER_ID],
  );
  if (rows.length === 0) throw new Error(`meta report not found: ${metaReportId}`);
  const r = rows[0];
  return {
    id: r.id as string,
    user_id: r.user_id as string,
    status: r.status as MetaReportStatus,
    covered_session_ids: JSON.parse(r.covered_session_ids as string),
    payload: r.payload != null ? JSON.parse(r.payload as string) : null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
};

// §A0.4: read-only path; no secret bind values.
export const getMetaReportList = async (
  params: { page?: number; page_size?: number } = {},
): Promise<MetaReportListResponse> => {
  const page = params.page ?? 1;
  const pageSize = params.page_size ?? 20;
  const offset = (page - 1) * pageSize;

  const totalRows = await db.query(
    `SELECT COUNT(*) AS cnt FROM meta_reports WHERE user_id = ?`,
    [USER_ID],
  );
  const total = (totalRows[0]?.cnt as number) ?? 0;

  const rows = await db.query(
    `SELECT id, status, covered_session_ids, created_at
       FROM meta_reports WHERE user_id = ?
      ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [USER_ID, pageSize, offset],
  );

  const items: MetaReportListItem[] = rows.map((r) => {
    const ids = JSON.parse(r.covered_session_ids as string) as string[];
    return {
      id: r.id as string,
      status: r.status as MetaReportStatus,
      covered_session_ids: ids,
      session_count: ids.length,
      created_at: r.created_at as string,
    };
  });

  return { items, page, page_size: pageSize, total };
};
