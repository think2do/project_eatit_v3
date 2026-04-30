import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { formatRelativeTime } from "@/lib/relativeTime";

const NOW_FIXED = new Date("2026-04-30T12:00:00Z").getTime();

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_FIXED);
});

afterAll(() => {
  vi.useRealTimers();
});

const past = (secAgo: number): Date => new Date(NOW_FIXED - secAgo * 1000);

describe("formatRelativeTime", () => {
  it("returns '刚刚' at exactly 0 seconds ago", () => {
    expect(formatRelativeTime(past(0))).toBe("刚刚");
  });

  it("returns '刚刚' at the just-under-5-second boundary", () => {
    expect(formatRelativeTime(past(4))).toBe("刚刚");
  });

  it("returns '5 秒前' at the 5-second crossover", () => {
    expect(formatRelativeTime(past(5))).toBe("5 秒前");
  });

  it("returns '30 秒前' at 30 seconds ago", () => {
    expect(formatRelativeTime(past(30))).toBe("30 秒前");
  });

  it("returns '1 分钟前' at exactly 60 seconds ago", () => {
    expect(formatRelativeTime(past(60))).toBe("1 分钟前");
  });

  it("returns '1 小时前' at exactly 3600 seconds ago", () => {
    expect(formatRelativeTime(past(3600))).toBe("1 小时前");
  });

  it("returns '1 天前' at exactly 86400 seconds ago", () => {
    expect(formatRelativeTime(past(86400))).toBe("1 天前");
  });

  it("clamps future timestamps to '刚刚' (negative diff)", () => {
    expect(formatRelativeTime(new Date(NOW_FIXED + 60_000))).toBe("刚刚");
  });

  it("accepts ISO string and numeric epoch input", () => {
    expect(formatRelativeTime(new Date(NOW_FIXED - 30_000).toISOString())).toBe("30 秒前");
    expect(formatRelativeTime(NOW_FIXED - 30_000)).toBe("30 秒前");
  });
});
