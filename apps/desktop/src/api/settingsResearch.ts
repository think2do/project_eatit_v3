// V32.M2.3.5 (F-320) — typed client for the research opt-in toggle.
// Backend contract: GET/PUT /api/v1/settings/research-opt-in returns
// { enabled: boolean }. PUT body uses StrictBool, so anything other
// than `true` / `false` becomes a 422 — keep the call site honest.
import { apiClient } from "@/api/client";

export interface ResearchOptInState {
  enabled: boolean;
}

export async function getResearchOptIn(): Promise<ResearchOptInState> {
  const response = await apiClient.get<ResearchOptInState>(
    "/api/v1/settings/research-opt-in",
  );
  return response.data;
}

export async function setResearchOptIn(
  enabled: boolean,
): Promise<ResearchOptInState> {
  const response = await apiClient.put<ResearchOptInState>(
    "/api/v1/settings/research-opt-in",
    { enabled },
  );
  return response.data;
}
