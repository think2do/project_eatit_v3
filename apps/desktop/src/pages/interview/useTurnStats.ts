import { useEffect, useMemo, useState } from "react";

import { FILLER_WORDS_CN } from "@/lib/fillerWords";

export interface TurnStats {
  elapsedSeconds: number;
  // Characters per minute (the spec calls it "wpm" for legacy reasons; the
  // unit is Chinese characters / minute, not English words / minute).
  wpm: number;
  rateLabel: "slow" | "moderate" | "fast";
  fillerCount: number;
}

const SLOW_THRESHOLD = 100;
const FAST_THRESHOLD = 200;

// 100 ms tick keeps the timer visually fluid without burning CPU.
const TICK_MS = 100;

/**
 * Pure-frontend per-turn stats. Recomputes elapsed time from a wall-clock
 * delta against `recordingStartMs`; counts filler words by regex sweep
 * over `finalText`. Designed to be cheap enough to run on every keystroke
 * and every ASR partial — no LLM call, no server hop.
 *
 * Pass `recordingStartMs = null` to freeze the timer at 0 (e.g. before
 * the user starts answering, or after submit).
 */
export function useTurnStats(
  finalText: string,
  recordingStartMs: number | null,
): TurnStats {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (recordingStartMs === null) return;
    const t = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(t);
  }, [recordingStartMs]);

  const elapsedSeconds =
    recordingStartMs !== null
      ? Math.max(0, Math.floor((now - recordingStartMs) / 1000))
      : 0;

  const wordCount = finalText.length;
  const wpm =
    elapsedSeconds > 0 ? Math.round((wordCount / elapsedSeconds) * 60) : 0;

  const rateLabel: TurnStats["rateLabel"] =
    wpm > FAST_THRESHOLD
      ? "fast"
      : wpm > 0 && wpm < SLOW_THRESHOLD
        ? "slow"
        : "moderate";

  const fillerCount = useMemo(() => {
    if (!finalText) return 0;
    return FILLER_WORDS_CN.reduce((sum, word) => {
      // Escape — current list has no regex metacharacters but a future
      // L0-approved edit could.
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matches = finalText.match(new RegExp(escaped, "g"));
      return sum + (matches?.length ?? 0);
    }, 0);
  }, [finalText]);

  return { elapsedSeconds, wpm, rateLabel, fillerCount };
}
