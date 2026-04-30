import { describe, it, expect, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import type { InterviewFocus } from "@eatit/shared-types";

import { FocusCard } from "@/pages/upload/FocusCard";
import { useAppStore } from "@/stores/app-store";

const FOCUS_HIGH: InterviewFocus = {
  direction_id: "ai-insight",
  priority: "high",
  title: "AI 洞察",
  description: "考察对 AI 趋势的判断与边界感。",
};

const FOCUS_MID: InterviewFocus = {
  direction_id: "data-driven",
  priority: "mid",
  title: "数据驱动",
  description: "指标体系、AB 实验、归因。",
};

const FOCUS_LOW: InterviewFocus = {
  direction_id: "user-research",
  priority: "low",
  title: "用户洞察",
  description: "调研方法、客户分层。",
};

afterEach(() => {
  cleanup();
  // Reset store between tests so toggle-state assertions stay isolated.
  useAppStore.getState().resetSelectedFocusIds();
});

describe("FocusCard", () => {
  it("renders title, description, and priority label", () => {
    const { getByText } = render(
      <FocusCard focus={FOCUS_HIGH} selected={false} onToggle={() => {}} />,
    );
    expect(getByText("AI 洞察")).toBeTruthy();
    expect(getByText(/AI 趋势的判断/)).toBeTruthy();
    expect(getByText("高优先级")).toBeTruthy();
  });

  it("calls onToggle when clicked", () => {
    const onToggle = vi.fn();
    const { getByTestId } = render(
      <FocusCard focus={FOCUS_HIGH} selected={false} onToggle={onToggle} />,
    );
    fireEvent.click(getByTestId("focus-card"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("reflects selected state via aria-pressed", () => {
    const { getByTestId } = render(
      <FocusCard focus={FOCUS_HIGH} selected onToggle={() => {}} />,
    );
    expect(getByTestId("focus-card").getAttribute("aria-pressed")).toBe("true");
  });

  it("uses tag-warn class for high priority and tag-line for mid/low", () => {
    const { container, rerender } = render(
      <FocusCard focus={FOCUS_HIGH} selected={false} onToggle={() => {}} />,
    );
    expect(container.querySelector(".tag.tag-warn")).toBeTruthy();
    rerender(<FocusCard focus={FOCUS_MID} selected={false} onToggle={() => {}} />);
    expect(container.querySelector(".tag.tag-line")).toBeTruthy();
    rerender(<FocusCard focus={FOCUS_LOW} selected={false} onToggle={() => {}} />);
    expect(container.querySelector(".tag.tag-line")).toBeTruthy();
  });

  it("integrates with the store via toggleSelectedFocusId", () => {
    // Smoke test for the store wiring that ParsedPanel will use in M2.2.4.
    const store = useAppStore.getState();
    expect(store.selectedFocusIds).toEqual([]);
    store.toggleSelectedFocusId("ai-insight");
    expect(useAppStore.getState().selectedFocusIds).toEqual(["ai-insight"]);
    store.toggleSelectedFocusId("data-driven");
    expect(useAppStore.getState().selectedFocusIds).toEqual([
      "ai-insight",
      "data-driven",
    ]);
    store.toggleSelectedFocusId("ai-insight");
    expect(useAppStore.getState().selectedFocusIds).toEqual(["data-driven"]);
  });
});
