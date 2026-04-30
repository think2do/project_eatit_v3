import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";

import { useTurnStats } from "@/pages/interview/useTurnStats";

afterEach(() => {
  cleanup();
});

describe("useTurnStats", () => {
  it("returns 0 wpm and 0 elapsed when not recording", () => {
    const { result } = renderHook(() => useTurnStats("", null));
    expect(result.current.wpm).toBe(0);
    expect(result.current.elapsedSeconds).toBe(0);
    expect(result.current.rateLabel).toBe("moderate");
    expect(result.current.fillerCount).toBe(0);
  });

  it("counts filler words from final text (multi-occurrence each)", () => {
    const text = "嗯,我觉得这个项目就是要,反正先把,那个核心做出来";
    const { result } = renderHook(() => useTurnStats(text, Date.now()));
    // Hits: 嗯(1) + 这个(1) + 就是(1) + 反正(1) + 那个(1) = 5
    expect(result.current.fillerCount).toBeGreaterThanOrEqual(4);
  });

  it("ignores filler text when finalText is empty", () => {
    const { result } = renderHook(() => useTurnStats("", Date.now()));
    expect(result.current.fillerCount).toBe(0);
  });

  it("rate label is moderate around ~150 wpm (50 chars / 20s)", () => {
    const text = "a".repeat(50);
    const start = Date.now() - 20000;
    const { result } = renderHook(() => useTurnStats(text, start));
    expect(result.current.rateLabel).toBe("moderate");
    // 50 / 20 * 60 = 150
    expect(result.current.wpm).toBeGreaterThanOrEqual(140);
    expect(result.current.wpm).toBeLessThanOrEqual(160);
  });

  it("rate label is fast above 200 wpm (300 chars / 30s = 600 wpm)", () => {
    const text = "a".repeat(300);
    const start = Date.now() - 30000;
    const { result } = renderHook(() => useTurnStats(text, start));
    expect(result.current.rateLabel).toBe("fast");
  });

  it("rate label is slow when 0 < wpm < 100 (10 chars / 30s = 20 wpm)", () => {
    const text = "a".repeat(10);
    const start = Date.now() - 30000;
    const { result } = renderHook(() => useTurnStats(text, start));
    expect(result.current.rateLabel).toBe("slow");
  });

  it("ticks elapsed seconds forward via setInterval (100ms cadence)", () => {
    vi.useFakeTimers();
    try {
      const start = Date.now();
      const { result } = renderHook(() => useTurnStats("", start));
      expect(result.current.elapsedSeconds).toBe(0);
      act(() => {
        vi.advanceTimersByTime(2500);
      });
      expect(result.current.elapsedSeconds).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
