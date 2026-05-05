import { defineConfig } from "@playwright/test";

// V32.M4.3 — smoke E2E. Two scenarios behind a Vite-only dev server
// (no backend); fixtures/mockApi.ts intercepts the few backend calls
// the pages need (A20: never hit a real LLM).
//
// -----------------------------------------------------------------------
// M5.3 — Dual-mode E2E architecture
// -----------------------------------------------------------------------
// Mode A — "vite-dev" (current, active):
//   Playwright drives a Vite dev server at localhost:5173. All 3 existing
//   specs run in this mode. Backend calls are intercepted by inline mocks.
//   This is the 金标 baseline for automated CI.
//
// Mode B — "eatit-app" (deferred to M5.3-extended / M6.X):
//   Playwright would drive the native Eatit.app WKWebView. This requires
//   a Swift XCTest UI target that injects a JS test-hook via
//   evaluateJavaScript(), plus a WebSocket bridge between the XCTest
//   harness and Playwright. See apps/desktop/tests/e2e/launchEatitApp.ts
//   and scripts/build-and-test-e2e.sh §OPERATOR PLAYBOOK for details.
//   §A0: Tauri is permanently excluded; `_electron` does not apply here.
//
// When Mode B is implemented, add a second entry to the `projects` array
// below and toggle it via the EATIT_E2E_MODE env var.
// -----------------------------------------------------------------------

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "corepack pnpm dev --port 5173",
    port: 5173,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
  },
  // projects placeholder — currently only one mode is active.
  // Uncomment and extend when Mode B (eatit-app) is implemented in M5.3-extended.
  //
  // projects: [
  //   {
  //     name: "vite-dev",
  //     use: { baseURL: "http://localhost:5173" },
  //   },
  //   {
  //     name: "eatit-app",   // M5.3-extended / M6.X — requires XCTest UI target
  //     use: { baseURL: "http://localhost:5173" },  // placeholder; real URL TBD
  //   },
  // ],
});
