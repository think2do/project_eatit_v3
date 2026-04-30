import { describe, it, expect, vi, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";

import { TipsCarousel } from "@/components/TipsCarousel";
import type { TipsCard } from "@/lib/tips";

const mockTips: TipsCard[] = [
  { id: "1", content: "Tip 1 content", category: "开场" },
  { id: "2", content: "Tip 2 content", category: "数据" },
  { id: "3", content: "Tip 3 content", category: "决策" },
];

afterEach(() => {
  cleanup();
});

describe("TipsCarousel", () => {
  it("shows the first tip on mount", () => {
    const { getByText } = render(
      <TipsCarousel tips={mockTips} intervalMs={1000} />,
    );
    expect(getByText(/Tip 1 content/)).toBeTruthy();
  });

  it("auto-switches to next tip after intervalMs", () => {
    vi.useFakeTimers();
    try {
      const { getByText } = render(
        <TipsCarousel tips={mockTips} intervalMs={1000} />,
      );
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      expect(getByText(/Tip 2 content/)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("wraps from last tip back to first", () => {
    vi.useFakeTimers();
    try {
      const { getByText } = render(
        <TipsCarousel tips={mockTips} intervalMs={500} />,
      );
      act(() => {
        vi.advanceTimersByTime(500 * 3 + 50); // 3 ticks → back to index 0
      });
      expect(getByText(/Tip 1 content/)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders "已完成" when completing prop flips true', () => {
    const { rerender, getByText } = render(<TipsCarousel tips={mockTips} />);
    rerender(<TipsCarousel tips={mockTips} completing={true} />);
    expect(getByText(/已完成/)).toBeTruthy();
  });

  it("calls onCompleted after the transition window (~400ms)", () => {
    vi.useFakeTimers();
    try {
      const onCompleted = vi.fn();
      const { rerender } = render(<TipsCarousel tips={mockTips} />);
      rerender(
        <TipsCarousel
          tips={mockTips}
          completing={true}
          onCompleted={onCompleted}
        />,
      );
      act(() => {
        vi.advanceTimersByTime(450);
      });
      expect(onCompleted).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to hardcoded tips when handed an empty array", () => {
    const { container } = render(<TipsCarousel tips={[]} />);
    // Hardcoded fallback content includes the 自然语速 tip — assert one
    // of the literals from getFallbackTips().
    expect(container.textContent).toMatch(/保持自然语速/);
  });

  it("freezes auto-advance while completing — activeIndex stays at 0", () => {
    vi.useFakeTimers();
    try {
      const { rerender, getByText } = render(
        <TipsCarousel tips={mockTips} intervalMs={500} />,
      );
      rerender(
        <TipsCarousel tips={mockTips} intervalMs={500} completing={true} />,
      );
      // Walk past both the completion window (400ms) and several
      // would-be auto-advance ticks. After the transition the card
      // falls back to text — but it must still be Tip 1 because the
      // interval was frozen the whole time.
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(getByText(/Tip 1 content/)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
