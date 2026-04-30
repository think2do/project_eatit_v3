import { defineConfig } from "@playwright/test";

// V32.M4.3 — smoke E2E. Two scenarios behind a Vite-only dev server
// (no backend); fixtures/mockApi.ts intercepts the few backend calls
// the pages need (A20: never hit a real LLM).
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
});
