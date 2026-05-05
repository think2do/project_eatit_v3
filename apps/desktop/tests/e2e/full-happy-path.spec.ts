import { test, expect } from "@playwright/test";

import type { Page, Route } from "@playwright/test";
import { mockInterviewReport } from "./fixtures/interviewReport";
import { mockParseResultPayload } from "./fixtures/parseResult";

// M4.X — Full happy-path smoke. Walks 8 canonical pages in sequence,
// asserting structural presence of key affordances at each step.
//
// Coverage decision (see M4.X-audit.md §"Playwright spec coverage"):
//   AUTOMATED (this spec): Onboarding, Settings, Upload, Config,
//                          Report, History, MetaReport (static render).
//   DEFERRED to operator:  InterviewPage (requires real mic + Volc ASR creds)
//                          and Reflection async poll (requires live backend).
//
// A20: never hits a real LLM. All backend calls are intercepted by the
// inline mock helpers below (extends mockApi.ts patterns without modifying it).
//
// Run: pnpm e2e   (Vite dev server on 5173, headless)

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------
const MOCK_SESSION_ID = "mock-session-1";
const MOCK_META_ID = "mock-meta-1";
const BACKEND_RE = /^https?:\/\/(127\.0\.0\.1|localhost):8000\//;

// ---------------------------------------------------------------------------
// Local mock helpers — extend mockApi.ts patterns without modifying it.
// ---------------------------------------------------------------------------

async function stubTauriHost(page: Page): Promise<void> {
  // Same init-script pattern as mockApi.ts stubTauriHost.
  await page.addInitScript(() => {
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ =
      {
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

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

/** Wire all backend mocks needed for the full happy-path.
 *
 * Route registration order matters: Playwright uses LIFO — the LAST
 * registered route wins for a given URL. Strategy: register the broadest
 * patterns first (catch-all, then wildcards), specific endpoints last so
 * they override the wildcards.
 */
async function mockFullHappyPath(page: Page): Promise<void> {
  await stubTauriHost(page);

  // 1. Catch-all (broadest): 404 any unhandled backend call.
  await page.route(BACKEND_RE, async (route) => {
    const url = route.request().url();
    console.warn(`[mockApi:full-happy-path] unhandled: ${url}`);
    await route.fulfill({ status: 404, body: "" });
  });

  // 2. Wildcard: generic app-settings stub (returns null value).
  //    Must be registered BEFORE the specific onboarding_completed_at
  //    so that the specific route (registered last) wins for that URL.
  await page.route("**/api/v1/app-settings/**", (r) => {
    if (r.request().method() === "PUT") return json(r, 204, {});
    return json(r, 200, { value: null });
  });

  // 3. ASR health check.
  await page.route("**/api/v1/asr/health", (r) =>
    json(r, 200, { status: "ok" }),
  );
  // Research opt-in — note: the actual API path is /api/v1/settings/research-opt-in.
  await page.route("**/api/v1/settings/research-opt-in", (r) => {
    if (r.request().method() === "PUT") return json(r, 200, { enabled: false });
    return json(r, 200, { enabled: false });
  });

  // 4. Specific: onboarding gate — registered LAST so it overrides the
  //    app-settings/** wildcard for this one URL.
  await page.route("**/api/v1/app-settings/onboarding_completed_at", (r) =>
    json(r, 200, { value: "2026-01-01T00:00:00Z" }),
  );

  // Upload page: upload + parse stubs.
  await page.route("**/api/v1/assets/resume", (r) =>
    json(r, 200, { asset_id: "mock-resume-1", filename: "resume.pdf" }),
  );
  await page.route("**/api/v1/assets/jd", (r) =>
    json(r, 200, { asset_id: "mock-jd-1", filename: "jd.txt" }),
  );
  await page.route("**/api/v1/assets/parse", (r) =>
    json(r, 200, {
      task_id: "mock-task-1",
      status: "ready",
      payload: mockParseResultPayload,
    }),
  );
  await page.route("**/api/v1/assets/parse-result", (r) =>
    json(r, 200, {
      task_id: "mock-task-1",
      status: "ready",
      payload: mockParseResultPayload,
    }),
  );

  // Sessions endpoint — use regex so Playwright matches both the bare path
  // (/api/v1/sessions) and query-string variants (/api/v1/sessions?page=1…).
  // Must be registered before the more-specific session/:id and session/*/report
  // routes so those can override via LIFO ordering.
  await page.route(/\/api\/v1\/sessions(\?.*)?$/, (r) => {
    if (r.request().method() === "POST") {
      return json(r, 201, {
        session_id: MOCK_SESSION_ID,
        status: "created",
        created_at: "2026-05-05T00:00:00Z",
      });
    }
    // GET /sessions?page=1&page_size=50 → session list for HistoryPage.
    // config_snapshot mirrors the real backend shape; job_title drives the
    // "岗位 · 风格" column via buildJobAndStyle().
    return json(r, 200, {
      items: [
        {
          session_id: MOCK_SESSION_ID,
          user_id: "mock-user-1",
          candidate_asset_id: "mock-bundle-1",
          created_at: "2026-05-05T00:00:00Z",
          updated_at: "2026-05-05T00:00:00Z",
          status: "ended",
          started_at: "2026-05-05T00:00:00Z",
          ended_at: "2026-05-05T00:10:00Z",
          turn_count: 3,
          config_snapshot: {
            job_title: "高级产品经理",
            style: "structured",
            duration_minutes: 30,
          },
          latest_overall_score: 82,
          latest_weaknesses: [],
        },
      ],
      total: 1,
      page: 1,
      page_size: 50,
    });
  });

  // GET /sessions/:id — single session fetch (InterviewPage / other consumers).
  // Registered after the list route so it overrides via LIFO.
  await page.route(
    new RegExp(`/api/v1/sessions/${MOCK_SESSION_ID}$`),
    (r) =>
      json(r, 200, {
        session_id: MOCK_SESSION_ID,
        status: "completed",
        created_at: "2026-05-05T00:00:00Z",
        direction: "产品经理",
        duration: "30min",
        style: "structured",
        report_status: "ready",
      }),
  );

  // Report page.
  await page.route("**/api/v1/sessions/*/report", async (route) => {
    if (route.request().method() === "GET") {
      return json(route, 200, mockInterviewReport);
    }
    return json(route, 200, {
      session_id: MOCK_SESSION_ID,
      status: "ready",
      requested_at: "2026-05-05T00:00:00Z",
    });
  });
  await page.route("**/api/v1/sessions/*/reflection", (r) =>
    json(r, 204, {}),
  );

  // History: user insights for AICoachCard.
  // URL confirmed from apps/desktop/src/api/usersInsights.ts.
  await page.route("**/api/v1/users/me/insights", (r) =>
    json(r, 200, {
      insight_summary: null,
      recurring_topics: [],
      generated_at: null,
    }),
  );

  // MetaReport page (polling) — matches /api/v1/meta-reports/<id>.
  // Schema: MetaReportDetailResponse from packages/shared-types.
  await page.route("**/api/v1/meta-reports/**", (r) =>
    json(r, 200, {
      id: MOCK_META_ID,
      user_id: "mock-user-1",
      status: "ready",
      covered_session_ids: [MOCK_SESSION_ID],
      created_at: "2026-05-05T00:00:00Z",
      updated_at: "2026-05-05T00:01:00Z",
      payload: {
        overall_trend_summary: "整体稳步提升",
        recurring_weaknesses: [],
        improvement_signals: [],
        pass_probability_series: [],
        next_focus_areas: [],
      },
    }),
  );
  // MetaReport list — matches /api/v1/meta-reports (bare, no trailing slash).
  // Registered after the wildcard so it does NOT override (LIFO: last wins,
  // but glob `**/api/v1/meta-reports/**` won't match bare `/meta-reports`).
  await page.route("**/api/v1/meta-reports", (r) =>
    json(r, 200, {
      items: [
        {
          id: MOCK_META_ID,
          status: "ready",
          covered_session_ids: [MOCK_SESSION_ID],
          session_count: 1,
          created_at: "2026-05-05T00:00:00Z",
        },
      ],
      page: 1,
      page_size: 20,
    }),
  );

  // Health endpoint (unrelated to ASR, some pages call /health).
  await page.route("**/health", (r) => json(r, 200, { status: "ok" }));
}

// ---------------------------------------------------------------------------
// The happy-path test
// ---------------------------------------------------------------------------

test("full happy-path smoke: Onboarding → Settings → Upload → Config → Report → History → MetaReport", async ({
  page,
}) => {
  await mockFullHappyPath(page);

  // ------------------------------------------------------------------
  // 1. Onboarding — visit /onboarding directly (bypasses OnboardingGate).
  //    Assert step-0 welcome text + "开始配置" CTA visible.
  //    OnboardingPage renders StepWelcome at step=0 with text
  //    "开始你的第一次模拟面试" and a "开始配置" button.
  // ------------------------------------------------------------------
  await page.goto("/onboarding");
  await expect(page.getByText("开始你的第一次模拟面试")).toBeVisible();
  await expect(page.getByRole("button", { name: "开始配置" })).toBeVisible();

  // ------------------------------------------------------------------
  // 2. Settings — h1 heading "LLM 配置 · 数据管理" visible.
  //    (The eyebrow is "07 · 设置" but role=heading maps to the h1.)
  // ------------------------------------------------------------------
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "LLM 配置 · 数据管理" }),
  ).toBeVisible();

  // ------------------------------------------------------------------
  // 3. Upload — DropZone heading visible + file inputs attached.
  // ------------------------------------------------------------------
  await page.goto("/upload");
  await expect(
    page.getByRole("heading", { name: "上传简历与岗位 JD" }),
  ).toBeVisible();
  // Both file input areas should be in the DOM.
  await expect(page.locator("input[type='file']").first()).toBeAttached();

  // ------------------------------------------------------------------
  // 4. Config — heading + 4 style tiles visible (F-307 lock).
  //    Note: "结构化面试官" may appear in two places (tile + summary
  //    sidebar), so we use .first() to avoid strict-mode violation.
  // ------------------------------------------------------------------
  await page.goto("/config");
  await expect(
    page.getByRole("heading", { name: "选一套和今天状态匹配的面试方式" }),
  ).toBeVisible();
  for (const style of [
    "结构化面试官",
    "高压追问型",
    "亲和启发型",
    "资深行业专家",
  ]) {
    await expect(page.getByText(style, { exact: true }).first()).toBeVisible();
  }

  // ------------------------------------------------------------------
  // 5. InterviewPage — route matches without crash (mic deferred).
  //    Navigate to the route to confirm mount; no interaction with ASR.
  //    Full live-mic flow is operator-only (see M4.X-audit.md playbook).
  // ------------------------------------------------------------------
  await page.goto(`/interview/${MOCK_SESSION_ID}`);
  // The route must be accepted (no 404 redirect to "/").
  await expect(page).toHaveURL(new RegExp(`interview/${MOCK_SESSION_ID}`));

  // ------------------------------------------------------------------
  // 6. Report — HeroScoreCard + 5 dimensions + pass_likelihood (F-312/314).
  //    L0 A18: NO "NN%" pass-rate number anywhere on the page.
  // ------------------------------------------------------------------
  await page.goto(`/report/${MOCK_SESSION_ID}`);
  await expect(page.getByText("通过可能性")).toBeVisible();
  await expect(page.getByText(/中上|中下|^中$/)).toBeVisible();
  // L0 A18 guardrail.
  const pctCount = await page.locator("text=/\\d{1,3}%/").count();
  expect(pctCount).toBe(0);
  // F-312 five-dimension lock.
  for (const dim of [
    "专业深度",
    "结构化表达",
    "批判性思考",
    "业务直觉",
    "沟通节奏",
  ]) {
    await expect(page.getByText(dim, { exact: true })).toBeVisible();
  }

  // ------------------------------------------------------------------
  // 7. History — session table heading + mocked row visible.
  //    HistoryPage h1 = "我的面试记录".
  // ------------------------------------------------------------------
  await page.goto("/history");
  await expect(
    page.getByRole("heading", { name: "我的面试记录" }),
  ).toBeVisible();
  // The mocked session row should appear (job_title = 高级产品经理 in config_snapshot).
  // buildJobAndStyle() renders "高级产品经理 · 结构化" from the config_snapshot.
  await expect(page.getByText("高级产品经理", { exact: false })).toBeVisible();

  // ------------------------------------------------------------------
  // 8. MetaReport (Reflection) — h1 "你这段时间的面试趋势" + summary text.
  //    Full async generation is deferred to operator playbook.
  // ------------------------------------------------------------------
  await page.goto(`/meta-report/${MOCK_META_ID}`);
  await expect(
    page.getByRole("heading", { name: "你这段时间的面试趋势" }),
  ).toBeVisible();
  // overall_trend_summary from mock should render.
  await expect(page.getByText("整体稳步提升")).toBeVisible();
});

// ---------------------------------------------------------------------------
// Targeted non-regression checks
// ---------------------------------------------------------------------------

test("L0 A18: report never shows NN% pass-rate number", async ({ page }) => {
  await mockFullHappyPath(page);
  await page.goto(`/report/${MOCK_SESSION_ID}`);
  await expect(page.getByText("通过可能性")).toBeVisible();
  const banned = await page.locator("text=/\\d{1,3}%/").count();
  expect(banned).toBe(0);
});

test("WKWebView M4.3: every <select> carries className='select' (DOM gate)", async ({
  page,
}) => {
  // Navigate to Settings — ProviderSelect renders a <select> with className="select".
  await mockFullHappyPath(page);
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "LLM 配置 · 数据管理" }),
  ).toBeVisible();
  // Every <select> element on the page must carry the "select" CSS class
  // (M4.3 WKWebView alignment fix — 3 callsites in src/).
  const missingClass = await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll("select"));
    return selects.filter((el) => !el.classList.contains("select")).length;
  });
  expect(missingClass).toBe(0);
});
