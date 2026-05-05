/**
 * api/usersInsights — M5.4.dev.b PR2a
 *
 * Tests the db Bridge read pattern for getUserInsights.
 * Mocks @/services/db so the bridge layer is not exercised here.
 *
 * §A0: no Tauri. §B9: db mock mirrors Zod Row contract.
 * §A0.4: read-only path — no secret bind values.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/db", () => ({
  db: {
    query: vi.fn(),
  },
}));

import { db } from "@/services/db";
import { getUserInsights } from "@/api/usersInsights";

const mockQuery = vi.mocked(db.query);

beforeEach(() => {
  mockQuery.mockReset();
});

const VALID_PAYLOAD = JSON.stringify({ sessionCount: 5, topStrength: "clarity" });

describe("getUserInsights", () => {
  it('returns JSON.parsed payload when row exists with status="ok"', async () => {
    mockQuery.mockResolvedValue([{ payload: VALID_PAYLOAD, status: "ok" }]);
    const result = await getUserInsights();
    expect(result).toEqual({ sessionCount: 5, topStrength: "clarity" });
  });

  it('returns null when status="pending"', async () => {
    mockQuery.mockResolvedValue([{ payload: VALID_PAYLOAD, status: "pending" }]);
    const result = await getUserInsights();
    expect(result).toBeNull();
  });

  it('returns null when status="running"', async () => {
    mockQuery.mockResolvedValue([{ payload: VALID_PAYLOAD, status: "running" }]);
    const result = await getUserInsights();
    expect(result).toBeNull();
  });

  it('returns null when status="failed"', async () => {
    mockQuery.mockResolvedValue([{ payload: VALID_PAYLOAD, status: "failed" }]);
    const result = await getUserInsights();
    expect(result).toBeNull();
  });

  it('returns null when status="skipped"', async () => {
    mockQuery.mockResolvedValue([{ payload: VALID_PAYLOAD, status: "skipped" }]);
    const result = await getUserInsights();
    expect(result).toBeNull();
  });

  it("returns null when no row exists (Coach has never run)", async () => {
    mockQuery.mockResolvedValue([]);
    const result = await getUserInsights();
    expect(result).toBeNull();
  });

  it("re-throws when JSON.parse fails (corrupt payload)", async () => {
    mockQuery.mockResolvedValue([{ payload: "not-json{{", status: "ok" }]);
    await expect(getUserInsights()).rejects.toThrow(SyntaxError);
  });

  it('binds user_id="local" in the SQL query', async () => {
    mockQuery.mockResolvedValue([]);
    await getUserInsights();
    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT payload, status FROM user_insight_cache WHERE user_id = ?",
      ["local"],
    );
  });
});
