import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __quotaMockInternal,
  getRemainingQuotaMock,
  incrementQuotaMock,
  readQuotaMock,
  resetQuotaMock,
} from "@/lib/quotaMock";

const { STORAGE_KEY, DEFAULT_LIMIT } = __quotaMockInternal;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("quotaMock", () => {
  it("first read returns the default 0/10 state and persists it", () => {
    const now = new Date(Date.UTC(2026, 4, 10));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    const state = readQuotaMock(now);

    expect(state.used).toBe(0);
    expect(state.limit).toBe(DEFAULT_LIMIT);
    expect(state.resetAt).toBe(new Date(Date.UTC(2026, 5, 1)).toISOString());
    // Persisted on first read so the next caller sees the same state.
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("incrementQuotaMock adds 1 and persists", () => {
    const now = new Date(Date.UTC(2026, 4, 10));

    const first = incrementQuotaMock(now);
    const second = incrementQuotaMock(now);
    const third = incrementQuotaMock(now);

    expect(first.used).toBe(1);
    expect(second.used).toBe(2);
    expect(third.used).toBe(3);
    expect(getRemainingQuotaMock(now)).toBe(DEFAULT_LIMIT - 3);
  });

  it("resetQuotaMock zeroes used and rolls resetAt forward", () => {
    const now = new Date(Date.UTC(2026, 4, 10));
    incrementQuotaMock(now);
    incrementQuotaMock(now);
    expect(readQuotaMock(now).used).toBe(2);

    const reset = resetQuotaMock(now);

    expect(reset.used).toBe(0);
    expect(reset.limit).toBe(DEFAULT_LIMIT);
    expect(reset.resetAt).toBe(new Date(Date.UTC(2026, 5, 1)).toISOString());
  });

  it("auto-zeroes when resetAt is in the past", () => {
    // Stored state with stale resetAt — simulates returning user next month.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        used: 7,
        limit: DEFAULT_LIMIT,
        resetAt: new Date(Date.UTC(2026, 4, 1)).toISOString(),
      }),
    );
    const now = new Date(Date.UTC(2026, 5, 2));

    const state = readQuotaMock(now);

    expect(state.used).toBe(0);
    expect(state.resetAt).toBe(new Date(Date.UTC(2026, 6, 1)).toISOString());
    expect(getRemainingQuotaMock(now)).toBe(DEFAULT_LIMIT);
  });

  it("getRemainingQuotaMock clamps at 0 when used exceeds limit", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        used: 99,
        limit: DEFAULT_LIMIT,
        resetAt: new Date(Date.UTC(2099, 0, 1)).toISOString(),
      }),
    );
    const now = new Date(Date.UTC(2026, 4, 10));

    expect(getRemainingQuotaMock(now)).toBe(0);
  });
});
