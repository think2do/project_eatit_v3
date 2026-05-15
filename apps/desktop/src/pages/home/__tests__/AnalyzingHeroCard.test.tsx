import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AnalyzingHeroCard } from "@/pages/home/AnalyzingHeroCard";
import { useSessionStatusStore } from "@/stores/sessionStatus-store";

function resetStore() {
  useSessionStatusStore.setState({
    analyzing: new Set<string>(),
    unreadReports: new Set<string>(),
  });
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  cleanup();
  resetStore();
});

describe("AnalyzingHeroCard", () => {
  it("renders nothing when analyzing.size === 0", () => {
    const { container } = render(<AnalyzingHeroCard />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the hero card when analyzing.size > 0", () => {
    useSessionStatusStore.getState().markAnalyzing("sess-1");
    const { getByText } = render(<AnalyzingHeroCard />);
    expect(getByText("上一场面试分析生成中")).toBeInTheDocument();
  });

  it("renders the description text when analyzing", () => {
    useSessionStatusStore.getState().markAnalyzing("sess-1");
    const { container } = render(<AnalyzingHeroCard />);
    expect(container.textContent).toContain("30-60 秒");
  });

  it("disappears after markReady removes all sessions", () => {
    useSessionStatusStore.getState().markAnalyzing("sess-1");
    const { container, rerender } = render(<AnalyzingHeroCard />);
    expect(container.firstChild).not.toBeNull();

    useSessionStatusStore.getState().markReady("sess-1");
    rerender(<AnalyzingHeroCard />);
    expect(container.firstChild).toBeNull();
  });

  it("stays visible when multiple sessions are analyzing and only one finishes", () => {
    useSessionStatusStore.getState().markAnalyzing("sess-1");
    useSessionStatusStore.getState().markAnalyzing("sess-2");
    const { container, rerender } = render(<AnalyzingHeroCard />);
    expect(container.firstChild).not.toBeNull();

    useSessionStatusStore.getState().markReady("sess-1");
    rerender(<AnalyzingHeroCard />);
    expect(container.firstChild).not.toBeNull();
  });
});
