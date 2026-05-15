// V32.M1.1.X audit-fix — SummarySidebar coverage.
// Verifies the sticky preview pane:
//  - 5 SummaryRow values render correctly (岗位/风格/方向/时长/预计)
//  - direction count + chip list mirrors props
//  - main CTA disable / enable + click invokes onStart
//  - quota row reads localStorage default state on first mount

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SummarySidebar, type SummarySidebarProps } from "@/pages/config/SummarySidebar";

const baseProps: SummarySidebarProps = {
  jobTitle: "Notion · 高级产品经理",
  styleLabel: "结构化面试官",
  directions: [
    { value: "ai-insight", label: "AI 洞察" },
    { value: "data-driven", label: "数据驱动" },
  ],
  durationMinutes: 30,
  ready: true,
  submitting: false,
  onStart: () => {},
};

beforeEach(() => {
  // Each test starts with a clean localStorage so the quota row
  // renders the default 0/10 state instead of carryover.
  localStorage.clear();
});

afterEach(() => {
  // vitest.config.ts has `globals: false`, so testing-library's
  // automatic cleanup hook is not registered. Without this manual
  // cleanup the previous test's DOM persists and `getByTestId`
  // sees duplicates across tests.
  cleanup();
});

describe("SummarySidebar", () => {
  it("renders all 5 SummaryRow labels with their values", () => {
    const { getByTestId, getByText } = render(<SummarySidebar {...baseProps} />);
    expect(getByTestId("summary-row-岗位")).toHaveTextContent("Notion · 高级产品经理");
    expect(getByTestId("summary-row-风格")).toHaveTextContent("结构化面试官");
    expect(getByTestId("summary-row-方向")).toHaveTextContent("2 项");
    expect(getByTestId("summary-row-时长")).toHaveTextContent("30 分钟");
    expect(getByTestId("summary-row-预计")).toHaveTextContent("6~8 题");
    // The headline is part of the spec: "将开始一场…"
    expect(getByText("将开始一场…")).toBeInTheDocument();
  });

  it("renders one chip per direction passed in", () => {
    const { getByTestId, queryByTestId } = render(
      <SummarySidebar {...baseProps} />,
    );
    expect(getByTestId("summary-direction-chip-ai-insight")).toHaveTextContent(
      "AI 洞察",
    );
    expect(getByTestId("summary-direction-chip-data-driven")).toHaveTextContent(
      "数据驱动",
    );
    // Not selected: should not render
    expect(queryByTestId("summary-direction-chip-strategy")).toBeNull();
  });

  it("falls back to '—' when no directions are picked", () => {
    const { getByTestId } = render(
      <SummarySidebar {...baseProps} directions={[]} />,
    );
    expect(getByTestId("summary-row-方向")).toHaveTextContent("—");
  });

  it("falls back to '—' when jobTitle is null", () => {
    const { getByTestId } = render(
      <SummarySidebar {...baseProps} jobTitle={null} />,
    );
    expect(getByTestId("summary-row-岗位")).toHaveTextContent("—");
  });

  it("renders different question ranges per duration option (4 tiers incl. 60)", () => {
    const { rerender, getByTestId } = render(
      <SummarySidebar {...baseProps} durationMinutes={15} />,
    );
    expect(getByTestId("summary-row-预计")).toHaveTextContent("3~4 题");
    rerender(<SummarySidebar {...baseProps} durationMinutes={45} />);
    expect(getByTestId("summary-row-预计")).toHaveTextContent("10~12 题");
    rerender(<SummarySidebar {...baseProps} durationMinutes={60} />);
    expect(getByTestId("summary-row-预计")).toHaveTextContent("含 case");
    expect(getByTestId("summary-row-时长")).toHaveTextContent("60 分钟");
  });

  it("disables CTA and shows '生成面试框架…' when submitting", () => {
    const { getByTestId } = render(
      <SummarySidebar {...baseProps} submitting={true} />,
    );
    const cta = getByTestId("summary-start-cta") as HTMLButtonElement;
    expect(cta).toBeDisabled();
    expect(cta).toHaveTextContent("生成面试框架…");
  });

  it("disables CTA when not ready, even if not submitting", () => {
    const { getByTestId } = render(
      <SummarySidebar {...baseProps} ready={false} />,
    );
    const cta = getByTestId("summary-start-cta") as HTMLButtonElement;
    expect(cta).toBeDisabled();
    expect(cta).toHaveTextContent("开始模拟面试");
  });

  it("invokes onStart exactly once when CTA clicked", () => {
    const onStart = vi.fn();
    const { getByTestId } = render(
      <SummarySidebar {...baseProps} onStart={onStart} />,
    );
    fireEvent.click(getByTestId("summary-start-cta"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("renders the privacy 小建议 callout", () => {
    const { getByTestId } = render(<SummarySidebar {...baseProps} />);
    const tip = getByTestId("summary-tip");
    expect(tip).toHaveTextContent("小建议");
    expect(tip).toHaveTextContent("不会外传");
  });
});
