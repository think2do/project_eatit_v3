import type { ReflectionReport } from "@eatit/shared-types";
import { db } from "@/services/db";

// §A0.4: read-only path; no secret bind values.
// F-322 V32.M3.2.3 — ReportPage segment tab "[详细复盘]" reads the
// reflection_reports row. null when row absent (post_report_graph hasn't
// run yet); the page polls until the row arrives.
export const getReflection = async (
  sessionId: string,
): Promise<ReflectionReport | null> => {
  const rows = await db.query(
    "SELECT payload FROM reflection_reports WHERE session_id = ?",
    [sessionId],
  );
  if (rows.length === 0) return null;
  return JSON.parse(rows[0].payload as string) as ReflectionReport;
};
