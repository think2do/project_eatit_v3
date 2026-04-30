import { test, expect } from "@playwright/test";

import { mockUploadFlow } from "./fixtures/mockApi";

// V32.M4.3 — scenario 1. Walk Upload → Config and assert the headline
// affordances render on each step. We don't drive the file pickers
// because Playwright drag-and-drop fixtures would couple this smoke to
// DropZone internals; instead we verify both routes mount cleanly and
// the four interview-style tiles surface on Config (F-307 lock).
test("upload → config routing renders the four style tiles", async ({
  page,
}) => {
  await mockUploadFlow(page);

  await page.goto("/upload");
  await expect(
    page.getByRole("heading", { name: "上传简历与岗位 JD" }),
  ).toBeVisible();

  await page.goto("/config");
  await expect(
    page.getByRole("heading", { name: "选一套和今天状态匹配的面试方式" }),
  ).toBeVisible();

  // F-307 four-style lock — every label must surface.
  for (const style of [
    "结构化面试官",
    "高压追问型",
    "亲和启发型",
    "资深行业专家",
  ]) {
    await expect(page.getByText(style, { exact: true })).toBeVisible();
  }
});
