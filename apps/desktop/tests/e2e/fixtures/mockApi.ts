import type { Page, Route } from "@playwright/test";

import { mockInterviewReport } from "./interviewReport";

// V32.M4.3 — Playwright mock backend. Intercepts the small handful of
// `127.0.0.1:8000` calls that the smoke pages make.
//
// A20: never reach a real LLM / network — every request resolves
// locally with a hardcoded fixture or a minimal 200/204 stub.

// `main.tsx` blocks the first React render on initBackendUrl(), which
// polls the Tauri host for ~30s before giving up in a plain browser.
// We short-circuit by stubbing `window.__TAURI_INTERNALS__.invoke` so
// the very first poll resolves and React mounts immediately.
async function stubTauriHost(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      invoke: (cmd: string) =>
        cmd === "get_backend_port"
          ? Promise.resolve(8000)
          : Promise.reject(new Error("e2e stub")),
      transformCallback: () => 0,
      unregisterCallback: () => undefined,
      convertFileSrc: (s: string) => s,
    };
  });
}

// Match anything served from the backend host — never accidentally
// catch the Vite dev server (5173) or first-party assets.
const BACKEND_RE = /^https?:\/\/(127\.0\.0\.1|localhost):8000\//;

async function json(
  route: Route,
  status: number,
  body: unknown,
): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

// Playwright handlers run in LIFO order — the LAST `page.route()` call
// is matched first. So the catch-all is registered FIRST and the
// specific endpoint stubs go AFTER it; specifics override.
export async function mockReportApi(page: Page): Promise<void> {
  await stubTauriHost(page);

  await page.route(BACKEND_RE, async (route) => {
    const url = route.request().url();
    console.warn(`[mockApi] unhandled backend call: ${url}`);
    await route.fulfill({ status: 404, body: "" });
  });

  await page.route("**/api/v1/app-settings/onboarding_completed_at", (r) =>
    json(r, 200, { value: "2026-01-01T00:00:00Z" }),
  );

  await page.route("**/api/v1/sessions/*/report", async (route) => {
    if (route.request().method() === "GET") {
      await json(route, 200, mockInterviewReport);
      return;
    }
    await json(route, 200, {
      session_id: "mock-session-1",
      status: "ready",
      requested_at: "2026-05-01T08:00:00Z",
    });
  });

  await page.route("**/api/v1/sessions/*/reflection", (r) => json(r, 204, {}));
}

export async function mockUploadFlow(page: Page): Promise<void> {
  await stubTauriHost(page);

  await page.route(BACKEND_RE, (r) => r.fulfill({ status: 404, body: "" }));

  await page.route("**/api/v1/app-settings/onboarding_completed_at", (r) =>
    json(r, 200, { value: "2026-01-01T00:00:00Z" }),
  );
}
