import type { UserInsightCache } from "@eatit/shared-types";
import { apiClient } from "@/api/client";

// F-318 V32.M3.1.4 — Dashboard reads the cross-session Coach insight to
// render the AICoachCard. 204 No Content → null (first run / Coach has
// not been triggered yet); the page falls back to the "complete N more
// sessions" empty state when null OR when status !== "ok".
export const getUserInsights = async (): Promise<UserInsightCache | null> => {
  const response = await apiClient.get<UserInsightCache>(
    "/api/v1/users/me/insights",
    { validateStatus: (status) => status === 200 || status === 204 },
  );
  if (response.status === 204) {
    return null;
  }
  return response.data;
};
