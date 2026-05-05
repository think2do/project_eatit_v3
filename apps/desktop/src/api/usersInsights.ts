import type { UserInsightCache } from "@eatit/shared-types";
import { db } from "@/services/db";

// §A0.4: read-only path; no secret bind values.
// F-318 V32.M3.1.4 — Dashboard reads the cross-session Coach insight to
// render the AICoachCard. Returns null when:
//   - row absent (Coach has never run for this user), OR
//   - status !== "ok" (running / failed / skipped — Dashboard treats as no insight)
// Sql-level: SELECT payload, status FROM user_insight_cache WHERE user_id = 'local'
export const getUserInsights = async (): Promise<UserInsightCache | null> => {
  const rows = await db.query(
    "SELECT payload, status FROM user_insight_cache WHERE user_id = ?",
    ["local"],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  if (row.status !== "ok") return null;
  return JSON.parse(row.payload as string) as UserInsightCache;
};
