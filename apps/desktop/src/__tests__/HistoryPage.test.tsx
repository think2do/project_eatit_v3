// V32.M3.X audit-fix G2 — HistoryPage × getUserInsights integration.
//
// PRD §6.4 Dashboard renders the AI Coach card from the
// `/api/v1/users/me/insights` payload (M3.1.3). The page must branch
// across all four states the API can return:
//
//   1. null (204 — Coach has not run yet) → hide AICoachCard, fall back
//      to the "complete N more sessions" progress card.
//   2. status === "ok" → render AICoachCard with headline + headline_detail
//      + recurring_weaknesses chips.
//   3. status === "running" → hide AICoachCard, show analyzing placeholder
//      copy ("Coach 正在分析你的近三场表现…").
//   4. status === "failed" → hide AICoachCard, show failed placeholder
//      copy ("本次成长洞察生成失败…").
//
// The original M3 build only had the AICoachCard component-level tests;
// this file closes the integration gap tester audit flagged: the
// `useQuery → setInsights → branch` data flow inside HistoryPage itself
// was not exercised end-to-end.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  SessionListResponse,
  SessionSummary,
  UserInsightCache,
} from "@eatit/shared-types";

vi.mock("@/api/usersInsights", () => ({
  getUserInsights: vi.fn(),
}));
vi.mock("@/api/sessions", () => ({
  getSessionList: vi.fn(),
}));
vi.mock("@/api/metaReports", () => ({
  triggerMetaReport: vi.fn(),
}));

import { getUserInsights } from "@/api/usersInsights";
import { getSessionList } from "@/api/sessions";
import { HistoryPage } from "@/pages/HistoryPage";
import { useAppStore } from "@/stores/app-store";

const insightsMock = vi.mocked(getUserInsights);
const sessionsMock = vi.mocked(getSessionList);

// At least 3 completed sessions so `remainingForCoach <= 0`. This pins
// the AICoachCard / progress-card branching purely on the insights
// status — without enough completed sessions the page short-circuits to
// "再完成 N 场解锁..." regardless of insights, which would mask the
// running/failed placeholder copy we want to assert on.
function buildSessionList(completedCount = 3): SessionListResponse {
  const items: SessionSummary[] = Array.from(
    { length: completedCount },
    (_unused, idx) => ({
      id: `s-${idx + 1}`,
      created_at: `2026-04-${String(20 + idx).padStart(2, "0")}T10:00:00+00:00`,
      updated_at: `2026-04-${String(20 + idx).padStart(2, "0")}T10:00:00+00:00`,
      user_id: "u-1",
      candidate_asset_id: `a-${idx + 1}`,
      // "ended" counts as completed for `isCompleted` and contributes to
      // `completedItems.length`, satisfying the >= 3 threshold above.
      status: "ended",
      started_at: null,
      ended_at: `2026-04-${String(20 + idx).padStart(2, "0")}T10:30:00+00:00`,
      turn_count: 5,
      config_snapshot: {
        job_title: "AI 产品经理",
        style: "structured",
        directions: ["data-driven"],
        duration_minutes: 30,
      },
    }),
  );
  return {
    items,
    page: 1,
    page_size: 50,
    total: items.length,
  };
}

function buildOkInsight(): UserInsightCache {
  return {
    user_id: "u-1",
    based_on_session_count: 4,
    based_on_last_session_id: "s-4",
    headline: "继续围绕数据驱动方向做专项训练",
    headline_detail:
      "近三场结构化表达稳定提升;建议接下来重点训练数据指标推导与跨职能协作类问题。",
    recurring_weaknesses: ["指标拆解深度不足", "STAR 收尾仓促"],
    improvement_signals: ["近三场结构化表达稳定提升"],
    next_focus_areas: ["data-driven", "cross-func"],
    generated_at: "2026-04-30T12:00:00+00:00",
    status: "ok",
  };
}

function buildPendingInsight(
  status: "pending" | "running" | "failed" | "skipped",
): UserInsightCache {
  // Pending/running/failed/skipped rows still satisfy the schema —
  // headline_detail / recurring_weaknesses are typically empty placeholders
  // that the page must NOT render via AICoachCard (status !== "ok").
  return {
    user_id: "u-1",
    based_on_session_count: 4,
    based_on_last_session_id: "s-4",
    headline: "",
    headline_detail: "",
    recurring_weaknesses: [],
    improvement_signals: [],
    next_focus_areas: [],
    generated_at: "2026-04-30T12:00:00+00:00",
    status,
  };
}

function renderHistoryPage(): ReturnType<typeof render> {
  // Per-test QueryClient with retry disabled so a failed mock does NOT
  // gate the assertion behind a 30 second back-off — we want
  // deterministic single-fetch behavior in unit tests.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/history"]}>
        <HistoryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  insightsMock.mockReset();
  sessionsMock.mockReset();
  // Default sessions response — every test gets ≥3 completed unless it
  // overrides explicitly. Tests 3 and 4 depend on this floor.
  sessionsMock.mockResolvedValue(buildSessionList(3));
  // Reset store-side cached insights so the previous test's payload
  // does not leak into the current render (HistoryPage mirrors fetched
  // insights into the Zustand store via setInsights).
  useAppStore.setState({ insights: null });
});

afterEach(() => {
  cleanup();
});

describe("HistoryPage AICoachCard integration (M3.X G2)", () => {
  it("hides AICoachCard when getUserInsights returns null (204)", async () => {
    insightsMock.mockResolvedValue(null);

    const { queryByTestId, getByTestId } = renderHistoryPage();

    // The fallback progress card renders synchronously off the initial
    // null state; waitFor here pins the assertion until the React Query
    // resolution propagates so we never assert on stale state.
    await waitFor(() => {
      expect(getByTestId("ai-coach-progress")).toBeTruthy();
    });
    expect(queryByTestId("ai-coach-card")).toBeNull();
    expect(insightsMock).toHaveBeenCalledTimes(1);
  });

  it("renders AICoachCard with headline + recurring weaknesses when status === 'ok'", async () => {
    insightsMock.mockResolvedValue(buildOkInsight());

    const { findByTestId, queryByTestId } = renderHistoryPage();

    const card = await findByTestId("ai-coach-card");
    expect(card.getAttribute("data-status")).toBe("ok");
    expect(card.textContent).toContain("继续围绕数据驱动方向做专项训练");
    expect(card.textContent).toContain("指标拆解深度不足");
    // The fallback progress card must NOT also render — the two states
    // are mutually exclusive, otherwise the user sees duplicate coach
    // surfaces stacked on top of each other.
    expect(queryByTestId("ai-coach-progress")).toBeNull();
  });

  it("shows analyzing placeholder when status === 'running' (AICoachCard hidden)", async () => {
    insightsMock.mockResolvedValue(buildPendingInsight("running"));

    const { findByTestId, queryByTestId } = renderHistoryPage();

    const progress = await findByTestId("ai-coach-progress");
    // Wait for React Query → setInsights → re-render before pinning the
    // copy assertion; the initial paint may still show the "再完成 N 场"
    // copy until insights mirrors into the store.
    await waitFor(() => {
      expect(progress.textContent).toContain("Coach 正在分析你的近三场表现");
    });
    expect(queryByTestId("ai-coach-card")).toBeNull();
  });

  it("shows failed placeholder when status === 'failed' (AICoachCard hidden)", async () => {
    insightsMock.mockResolvedValue(buildPendingInsight("failed"));

    const { findByTestId, queryByTestId } = renderHistoryPage();

    const progress = await findByTestId("ai-coach-progress");
    await waitFor(() => {
      expect(progress.textContent).toContain("本次成长洞察生成失败");
    });
    expect(queryByTestId("ai-coach-card")).toBeNull();
  });
});
