import { test, expect } from "@playwright/test";

import { mockReportApi } from "./fixtures/mockApi";

// V32.M4.3 — scenario 2. ReportPage renders HeroScoreCard + 5 dimension
// rows + L0 A18 visual guardrail (no 0-100% number anywhere).
test("report 页渲染 HeroScoreCard + 维度卡(L0 A18 视觉护栏)", async ({
  page,
}) => {
  await mockReportApi(page);

  await page.goto("/report/mock-session-1");

  // HeroScoreCard surfaces 通过可能性 + the 中上/中/中下 enum.
  await expect(page.getByText("通过可能性")).toBeVisible();
  await expect(page.getByText(/中上|中下|^中$/)).toBeVisible();

  // L0 A18: the report must NEVER render an "NN%" pass-rate number.
  const banned = await page.locator("text=/\\d{1,3}%/").count();
  expect(banned).toBe(0);

  // F-312 — five-dimension lock.
  for (const dim of [
    "专业深度",
    "结构化表达",
    "批判性思考",
    "业务直觉",
    "沟通节奏",
  ]) {
    await expect(page.getByText(dim, { exact: true })).toBeVisible();
  }
});
