import axios from "axios";
import { apiClient } from "@/api/client";

export interface AppSettingValue<T = unknown> {
  value: T;
}

/**
 * GET /api/v1/app-settings/{key}
 * Returns null when the backend reports 404 "not set".
 * Any other error is re-thrown so the caller can surface it.
 *
 * `skipErrorToast: true` because 404 ("not set") is a *legitimate* state
 * for first-launch / never-toggled keys; the global axios interceptor
 * would otherwise surface "请求失败 / not set" toasts on every Settings
 * page mount. Callers who want toasts on unexpected 5xx can re-throw.
 */
export async function getAppSetting<T = unknown>(key: string): Promise<T | null> {
  try {
    const response = await apiClient.get<AppSettingValue<T>>(
      `/api/v1/app-settings/${encodeURIComponent(key)}`,
      { skipErrorToast: true },
    );
    return response.data.value;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      return null;
    }
    throw err;
  }
}

/** PUT /api/v1/app-settings/{key} — persist a JSON-serializable value. */
export async function putAppSetting<T>(key: string, value: T): Promise<T> {
  const response = await apiClient.put<AppSettingValue<T>>(
    `/api/v1/app-settings/${encodeURIComponent(key)}`,
    { value },
  );
  return response.data.value;
}
