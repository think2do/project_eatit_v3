import type { Page } from "@playwright/test";

// V34.M5.4.dev.d — /api/v1 HTTP stubs removed (Python backend retired §A0 §K #2).
// v3.4 frontend is Bridge-only; no JS code calls the Python HTTP layer.
// stubTauriHost is kept: main.tsx still checks `get_backend_port` invoke on mount.

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

export async function mockReportApi(page: Page): Promise<void> {
  await stubTauriHost(page);
}

export async function mockUploadFlow(page: Page): Promise<void> {
  await stubTauriHost(page);
}
