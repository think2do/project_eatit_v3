// M9.4 — History list generating-state badge (F-510).
//
// Verifies that SessionTable renders the "生成中" badge (with Spinner) when
// sessionStatus-store.analyzing contains the session id, and the "新" badge
// when sessionStatus-store.unreadReports contains it, and neither when the
// store has no entry for that session.
//
// Strategy: render SessionTable directly with explicit `generating` / `unread`
// fields (those are set by HistoryPage via toTableRows). This keeps the test
// fast and free of QueryClient / router setup while still exercising the
// badge rendering path that M9.4 added.

import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";

import {
  SessionTable,
  type SessionTableRow,
} from "@/pages/history/SessionTable";
import { useSessionStatusStore } from "@/stores/sessionStatus-store";

afterEach(() => {
  cleanup();
  // Reset store state between tests to prevent leakage.
  useSessionStatusStore.setState({
    analyzing: new Set<string>(),
    unreadReports: new Set<string>(),
  });
});

const baseRow: SessionTableRow = {
  id: "s-gen-1",
  jobAndStyle: "高级产品经理 · 结构化",
  dateLabel: "05-10 14:00",
  durationLabel: "30 分钟",
  overallScore: null,
  weaknesses: [],
  statusLabel: "报告生成中",
  starred: false,
};

describe("M9.4 — SessionTable generating-state badge", () => {
  it("renders '生成中' chip when generating=true", () => {
    const row: SessionTableRow = { ...baseRow, generating: true };
    const { getByTestId } = render(
      <SessionTable rows={[row]} onOpenRow={() => {}} />,
    );
    const badge = getByTestId("session-row-s-gen-1-generating");
    expect(badge.textContent).toContain("生成中");
  });

  it("'生成中' chip is absent when generating is falsy", () => {
    const row: SessionTableRow = { ...baseRow, generating: false };
    const { queryByTestId } = render(
      <SessionTable rows={[row]} onOpenRow={() => {}} />,
    );
    expect(queryByTestId("session-row-s-gen-1-generating")).toBeNull();
  });

  it("renders '新' chip when unread=true and generating is falsy", () => {
    const row: SessionTableRow = { ...baseRow, unread: true };
    const { getByTestId } = render(
      <SessionTable rows={[row]} onOpenRow={() => {}} />,
    );
    const badge = getByTestId("session-row-s-gen-1-unread");
    expect(badge.textContent).toContain("新");
  });

  it("'新' chip is absent when unread is falsy", () => {
    const row: SessionTableRow = { ...baseRow, unread: false };
    const { queryByTestId } = render(
      <SessionTable rows={[row]} onOpenRow={() => {}} />,
    );
    expect(queryByTestId("session-row-s-gen-1-unread")).toBeNull();
  });

  it("generating takes priority over unread when both are true", () => {
    const row: SessionTableRow = { ...baseRow, generating: true, unread: true };
    const { getByTestId, queryByTestId } = render(
      <SessionTable rows={[row]} onOpenRow={() => {}} />,
    );
    expect(getByTestId("session-row-s-gen-1-generating")).toBeTruthy();
    expect(queryByTestId("session-row-s-gen-1-unread")).toBeNull();
  });

  it("no badge rendered when neither generating nor unread", () => {
    const row: SessionTableRow = { ...baseRow };
    const { queryByTestId } = render(
      <SessionTable rows={[row]} onOpenRow={() => {}} />,
    );
    expect(queryByTestId("session-row-s-gen-1-generating")).toBeNull();
    expect(queryByTestId("session-row-s-gen-1-unread")).toBeNull();
  });

  it("store markAnalyzing → generating field propagation (store shape contract)", () => {
    // Validate that markAnalyzing produces a new Set containing the id,
    // which HistoryPage's toTableRows can detect via .has().
    useSessionStatusStore.getState().markAnalyzing("s-gen-1");
    const analyzing = useSessionStatusStore.getState().analyzing;
    expect(analyzing.has("s-gen-1")).toBe(true);
    expect(analyzing.has("s-other")).toBe(false);
  });

  it("store markReady → id moves from analyzing to unreadReports", () => {
    useSessionStatusStore.getState().markAnalyzing("s-gen-1");
    useSessionStatusStore.getState().markReady("s-gen-1");
    const { analyzing, unreadReports } = useSessionStatusStore.getState();
    expect(analyzing.has("s-gen-1")).toBe(false);
    expect(unreadReports.has("s-gen-1")).toBe(true);
  });
});
