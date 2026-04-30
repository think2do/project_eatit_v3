import type { ReflectionReport } from "@eatit/shared-types";
import { apiClient } from "@/api/client";

// F-322 V32.M3.2.3 — ReportPage segment tab "[详细复盘]" reads the
// async-generated Reflection cache. 204 → null (post_report_graph hasn't
// run yet, or the report isn't ``ready``); the page polls until the row
// arrives or surfaces a failure state.
export const getReflection = async (
  sessionId: string,
): Promise<ReflectionReport | null> => {
  const response = await apiClient.get<ReflectionReport>(
    `/api/v1/sessions/${sessionId}/reflection`,
    { validateStatus: (status) => status === 200 || status === 204 },
  );
  if (response.status === 204) {
    return null;
  }
  return response.data;
};
