import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

import {
  DEFAULT_FILTER_TAB_LABELS,
  FilterTabs,
  type FilterTab,
} from "@/pages/history/FilterTabs";

afterEach(() => {
  cleanup();
});

const baseTabs: FilterTab[] = [
  { key: "all", label: DEFAULT_FILTER_TAB_LABELS.all, count: 12 },
  { key: "completed", label: DEFAULT_FILTER_TAB_LABELS.completed, count: 7 },
  { key: "incomplete", label: DEFAULT_FILTER_TAB_LABELS.incomplete, count: 5 },
  { key: "starred", label: DEFAULT_FILTER_TAB_LABELS.starred, count: 0 },
];

describe("FilterTabs", () => {
  it("renders all four tab labels with counts", () => {
    const { container } = render(
      <FilterTabs tabs={baseTabs} activeKey="all" onSelect={() => {}} />,
    );
    for (const tab of baseTabs) {
      expect(container.textContent).toContain(tab.label);
    }
    expect(container.textContent).toContain("12");
    expect(container.textContent).toContain("7");
    expect(container.textContent).toContain("5");
  });

  it("marks the active tab via aria-selected + bold style", () => {
    const { getByTestId } = render(
      <FilterTabs tabs={baseTabs} activeKey="completed" onSelect={() => {}} />,
    );
    expect(
      getByTestId("filter-tab-completed").getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      getByTestId("filter-tab-all").getAttribute("aria-selected"),
    ).toBe("false");
  });

  it("invokes onSelect with the tab key", () => {
    const onSelect = vi.fn();
    const { getByTestId } = render(
      <FilterTabs tabs={baseTabs} activeKey="all" onSelect={onSelect} />,
    );
    fireEvent.click(getByTestId("filter-tab-incomplete"));
    expect(onSelect).toHaveBeenCalledWith("incomplete");
  });

  it("exposes role=tablist for assistive tech", () => {
    const { getByTestId } = render(
      <FilterTabs tabs={baseTabs} activeKey="all" onSelect={() => {}} />,
    );
    expect(getByTestId("filter-tabs").getAttribute("role")).toBe("tablist");
  });

  it("treats every key as switchable independently", () => {
    const onSelect = vi.fn();
    const { getByTestId } = render(
      <FilterTabs tabs={baseTabs} activeKey="all" onSelect={onSelect} />,
    );
    fireEvent.click(getByTestId("filter-tab-starred"));
    fireEvent.click(getByTestId("filter-tab-completed"));
    expect(onSelect).toHaveBeenNthCalledWith(1, "starred");
    expect(onSelect).toHaveBeenNthCalledWith(2, "completed");
  });
});
