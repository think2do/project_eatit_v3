import type {
  CreateSessionRequest,
  CreateSessionResponse,
  EndSessionResponse,
  InterviewReportResponse,
  SessionDetailResponse,
  SessionListRequest,
  SessionListResponse,
  TriggerReportRequest,
  TriggerReportResponse,
} from "@eatit/shared-types";
import { apiClient } from "@/api/client";

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

export const getSession = async (sessionId: string): Promise<SessionDetailResponse> => {
  const response = await apiClient.get<SessionDetailResponse>(`/api/v1/sessions/${sessionId}`);
  return response.data;
};

export const getSessionList = async (
  request: SessionListRequest = {},
): Promise<SessionListResponse> => {
  const response = await apiClient.get<SessionListResponse>("/api/v1/sessions", {
    params: request,
  });
  return response.data;
};

export const endSession = async (sessionId: string): Promise<EndSessionResponse> => {
  const response = await apiClient.post<EndSessionResponse>(`/api/v1/sessions/${sessionId}/end`);
  return response.data;
};

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

export const getSessionReport = async (
  sessionId: string,
): Promise<InterviewReportResponse> => {
  const response = await apiClient.get<InterviewReportResponse>(
    `/api/v1/sessions/${sessionId}/report`,
    // 404 ("not yet generated") and 409 ("still generating") are normal
    // polling states the caller handles explicitly — the global interceptor
    // already skips 409 but 404 would otherwise spam "Report not found."
    { skipErrorToast: true },
  );
  return response.data;
};
