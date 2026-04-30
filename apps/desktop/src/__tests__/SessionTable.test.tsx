import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

import {
  SessionTable,
  type SessionTableRow,
} from "@/pages/history/SessionTable";

afterEach(() => {
  cleanup();
});

const baseRow: SessionTableRow = {
  id: "s-1",
  jobAndStyle: "高级产品经理 · 高压追问",
  dateLabel: "04-30 14:32",
  durationLabel: "30 分钟",
  overallScore: 72,
  weaknesses: ["指标拆解", "STAR 收尾"],
  statusLabel: "报告就绪",
  starred: false,
};

describe("SessionTable", () => {
  it("renders all six headers", () => {
    const { container } = render(
      <SessionTable rows={[baseRow]} onOpenRow={() => {}} />,
    );
    for (const label of ["岗位 · 风格", "日期", "时长", "评分", "弱项"]) {
      expect(container.textContent).toContain(label);
    }
  });

  it("renders a row's score and a slice of weaknesses (max 2 chips)", () => {
    const tooMany = {
      ...baseRow,
      weaknesses: ["a", "b", "c", "d"],
    };
    const { getByTestId, container } = render(
      <SessionTable rows={[tooMany]} onOpenRow={() => {}} />,
    );
    expect(getByTestId("session-row-s-1-score").textContent).toBe("72");
    // Only first 2 chips render.
    expect(container.textContent).toContain("a");
    expect(container.textContent).toContain("b");
    expect(container.textContent).not.toContain("d");
  });

  it("shows '—' when the report has no overall_score yet", () => {
    const noScore = { ...baseRow, overallScore: null };
    const { getByTestId } = render(
      <SessionTable rows={[noScore]} onOpenRow={() => {}} />,
    );
    expect(getByTestId("session-row-s-1-score").textContent).toBe("—");
  });

  it("invokes onOpenRow with the row id on click", () => {
    const onOpen = vi.fn();
    const { getByTestId } = render(
      <SessionTable rows={[baseRow]} onOpenRow={onOpen} />,
    );
    fireEvent.click(getByTestId("session-row-s-1"));
    expect(onOpen).toHaveBeenCalledWith("s-1");
  });

  it("renders empty-state copy when no rows match the active filter", () => {
    const { getByTestId } = render(
      <SessionTable
        rows={[]}
        onOpenRow={() => {}}
        emptyMessage="尚无记录"
      />,
    );
    expect(getByTestId("session-table-empty").textContent).toContain(
      "尚无记录",
    );
  });

  it("marks starred rows via data-starred attribute (left rail accent)", () => {
    const starred = { ...baseRow, starred: true };
    const { getByTestId } = render(
      <SessionTable rows={[starred]} onOpenRow={() => {}} />,
    );
    expect(
      getByTestId("session-row-s-1").getAttribute("data-starred"),
    ).toBe("true");
  });
});
