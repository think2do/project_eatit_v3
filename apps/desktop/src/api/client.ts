import axios, { AxiosError } from "axios";
import { encodeForHeader, loadLLMConfig } from "@/lib/llm/config";
import { pushToast } from "@/stores/toast-store";

/**
 * Base URL of the local backend. Starts as the dev fallback `:8000`
 * (matches `uv run uvicorn` defaults) and gets rewritten by
 * `initBackendUrl()` at app boot once the Tauri host reports the
 * actual port chosen by the bundled backend subprocess. `let` gives us
 * ES-module live bindings so importers of `API_BASE_URL` see the
 * updated value automatically after init completes.
 */
export let API_BASE_URL = "http://127.0.0.1:8000";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
});

/**
 * §A0 永久排除 Tauri: 在 v3.4 macOS port 中 Tauri Rust sidecar 已废弃。
 * M2.7+ 把所有 LLM 调用走 Bridge → Swift LLMGateway。M4.2 删除 v3.3 backend
 * WebSocket;M5 全量移除 axios apiClient + apps/api 路径。
 * 本函数保留为兼容已存在的调用点(main.tsx 启动时调一次),但不再做任何事。
 * TODO M5: remove this export and its callsites entirely.
 */
export async function initBackendUrl(): Promise<void> {
  // no-op in v3.4 — Tauri backend polling permanently removed (§A0).
  return;
}

/**
 * Per-request opt-out flag. Call sites that want to render their own
 * error UI pass `{ skipErrorToast: true }` in the request config. The
 * response interceptor below reads this flag off the request config
 * before showing a generic toast.
 */
declare module "axios" {
  export interface AxiosRequestConfig {
    skipErrorToast?: boolean;
  }
}

/**
 * Every outbound request that doesn't already pin an X-LLM-Config header
 * gets one from the keychain. This covers the `/parse`, `POST /sessions`,
 * `POST /report` routes without each call site having to remember to
 * attach the header itself. Routes that don't need the header (health,
 * app-settings) don't break — the backend middleware only validates the
 * header when it's present.
 *
 * The `/llm/test` endpoint in api/llm.ts sets the header explicitly so it
 * can test an *unsaved* config; the `if already set` guard below leaves
 * that untouched.
 */
apiClient.interceptors.request.use(async (config) => {
  const existing = config.headers?.get?.("X-LLM-Config");
  if (existing) return config;

  try {
    const llm = await loadLLMConfig();
    if (llm && llm.api_key) {
      config.headers.set("X-LLM-Config", encodeForHeader(llm));
    }
  } catch {
    /* keychain unavailable in non-Tauri shell; request will proceed without */
  }
  return config;
});

// Intentionally NO response / error interceptor that forwards the axios
// `config` (which carries `X-LLM-Config` on every call) to Sentry or
// logs. Our Sentry `beforeSend` also redacts the header, but belt-and-
// braces: we never hand the raw request metadata to breadcrumb tooling
// in the first place. See src/lib/sentry.ts for the redaction contract.
//
// The response interceptor below ONLY reads the parsed JSON body (safe —
// backend exception_handlers.py already strips secrets) and dispatches
// a user-facing toast. We never stringify `error.config` or
// `error.request` into the toast / store.
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ detail?: string; request_id?: string; code?: string }>) => {
    if (error.config?.skipErrorToast) {
      return Promise.reject(error);
    }
    const status = error.response?.status;
    const body = error.response?.data;
    const detail = body?.detail ?? error.message ?? "请求失败";
    const requestId = body?.request_id;
    const code = body?.code;

    // 409 is almost always "state conflict, retry later" — every real caller
    // (report polling, async task status) handles it with a bespoke retry or
    // progress indicator. A generic "数据冲突" toast on every poll tick is
    // noise. Callers that WANT a toast can always re-throw / pushToast
    // themselves. (Observed 2026-04-24: report page polling while
    // ReportAgent was still generating surfaced a toast every 1.5s.)
    if (status === 409) {
      return Promise.reject(error);
    }

    let title = "请求失败";
    let tone: "error" | "warn" = "error";
    if (!error.response) {
      title = "网络异常";
      tone = "warn";
    } else if (status && status >= 500) {
      title = status === 502 ? "LLM 调用失败" : status === 503 ? "语音服务不可用" : "服务端错误";
    } else if (status === 400) {
      title = "请求参数有误";
      tone = "warn";
    } else if (status === 403 || status === 401) {
      title = "无权限或鉴权失败";
    }

    pushToast({
      tone,
      title,
      message: detail,
      requestId,
    });
    // Re-throw so the caller's existing error handling still runs; the
    // toast is purely additive UX.
    void code;
    return Promise.reject(error);
  },
);
