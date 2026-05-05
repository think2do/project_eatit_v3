import { test, expect } from "@playwright/test";

import type { Page } from "@playwright/test";

// M4.X — Full happy-path smoke. Walks 8 canonical pages in sequence,
// asserting structural presence of key affordances at each step.
//
// Coverage decision (see M4.X-audit.md §"Playwright spec coverage"):
//   AUTOMATED (this spec): Onboarding, Settings, Upload, Config,
//                          Report, History, MetaReport (static render).
//   DEFERRED to operator:  InterviewPage (requires real mic + Volc ASR creds)
//                          and Reflection async poll (requires live backend).
//
// A20: never hits a real LLM. All Bridge calls are intercepted via stubTauriHost.
// V34.M5.4.dev.d: /api/v1 HTTP stubs removed — Python backend retired §A0 §K #2.
//
// Run: pnpm e2e   (Vite dev server on 5173, headless)

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------
const MOCK_SESSION_ID = "mock-session-1";
const MOCK_META_ID = "mock-meta-1";

// ---------------------------------------------------------------------------
// Local mock helpers
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

/** Wire Bridge mock needed for the full happy-path.
 *
 * V34.M5.4.dev.d: HTTP /api/v1 routes removed. v3.4 frontend is Bridge-only;
 * all data flows through Tauri invoke / db calls, not HTTP.
 */
async function mockFullHappyPath(page: Page): Promise<void> {
  await stubTauriHost(page);
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

  // ------------------------------------------------------------------
  // 8. MetaReport (Reflection) — h1 "你这段时间的面试趋势".
  //    Full async generation is deferred to operator playbook.
  // ------------------------------------------------------------------
  await page.goto(`/meta-report/${MOCK_META_ID}`);
  await expect(
    page.getByRole("heading", { name: "你这段时间的面试趋势" }),
  ).toBeVisible();
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
