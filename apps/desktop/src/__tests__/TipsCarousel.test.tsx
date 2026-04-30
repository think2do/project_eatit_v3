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

  // G5 fix (2026-04-30 audit) — onCompleted lower bound. The original
  // test only verified onCompleted *did* fire after 450ms (upper). If
  // someone shrinks the transition window to 50ms (UX regression — the
  // 已完成 ✓ plate would be near-invisible), the upper test still
  // passes but the lower bound catches it.
  it("does NOT call onCompleted before the ~400ms transition window", () => {
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
      // 350ms < 400ms transition window — onCompleted must still be pending.
      act(() => {
        vi.advanceTimersByTime(350);
      });
      expect(onCompleted).not.toHaveBeenCalled();
      // Walk past the window — now it should fire (cross-check this
      // assertion is consistent with the upper-bound test above).
      act(() => {
        vi.advanceTimersByTime(100); // total 450ms
      });
      expect(onCompleted).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // G6 fix (2026-04-30 audit) — default intervalMs is the spec's "4-5s"
  // requirement (PRD v3.2 §6.1.5). The other auto-advance tests use a
  // small intervalMs to keep the test fast; this one uses the default
  // so a regression to e.g. 1500ms or 8000ms fails CI.
  it("uses default ~4500ms interval (spec '4-5s') when intervalMs not provided", () => {
    vi.useFakeTimers();
    try {
      const { getByText } = render(<TipsCarousel tips={mockTips} />);
      // At 3.5s, still on the first tip (default is > 3.5s).
      act(() => {
        vi.advanceTimersByTime(3500);
      });
      expect(getByText(/Tip 1 content/)).toBeTruthy();
      // By 4.6s total, must have advanced (default ≤ 4.6s).
      act(() => {
        vi.advanceTimersByTime(1100); // total 4600ms
      });
      expect(getByText(/Tip 2 content/)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
