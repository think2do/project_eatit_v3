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

  // G4 fix (2026-04-30 audit) — exact boundary cases at the rate
  // thresholds. The rate label rules are:
  //   wpm > 200          → 'fast'
  //   wpm > 0 && wpm < 100 → 'slow'
  //   else (incl. 0 / 100 / 200) → 'moderate'
  // Without these tests, drift like ">=" instead of ">" or shifting
  // the threshold to 90 would not fail any existing case.
  it("rate label is moderate at exactly wpm=100 (lower boundary, not <100)", () => {
    // 100 chars / 60s = 100 wpm — must NOT be 'slow' (rule is wpm < 100).
    const text = "a".repeat(100);
    const start = Date.now() - 60100; // small buffer so floor(elapsed)=60
    const { result } = renderHook(() => useTurnStats(text, start));
    expect(result.current.wpm).toBe(100);
    expect(result.current.rateLabel).toBe("moderate");
  });

  it("rate label is slow just below wpm=100 (99 wpm)", () => {
    // 99 chars / 60s = 99 wpm — strictly < 100 → 'slow'.
    const text = "a".repeat(99);
    const start = Date.now() - 60100;
    const { result } = renderHook(() => useTurnStats(text, start));
    expect(result.current.wpm).toBe(99);
    expect(result.current.rateLabel).toBe("slow");
  });

  it("rate label is moderate at exactly wpm=200 (upper boundary, not >200)", () => {
    // 200 chars / 60s = 200 wpm — must NOT be 'fast' (rule is wpm > 200).
    const text = "a".repeat(200);
    const start = Date.now() - 60100;
    const { result } = renderHook(() => useTurnStats(text, start));
    expect(result.current.wpm).toBe(200);
    expect(result.current.rateLabel).toBe("moderate");
  });

  it("rate label is fast just above wpm=200 (201 wpm)", () => {
    // 201 chars / 60s = 201 wpm — strictly > 200 → 'fast'.
    const text = "a".repeat(201);
    const start = Date.now() - 60100;
    const { result } = renderHook(() => useTurnStats(text, start));
    expect(result.current.wpm).toBe(201);
    expect(result.current.rateLabel).toBe("fast");
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
