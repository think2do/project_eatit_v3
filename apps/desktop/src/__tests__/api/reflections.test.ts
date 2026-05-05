/**
 * api/reflections — M5.4.dev.b PR2a
 *
 * Tests the db Bridge read pattern for getReflection.
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
import { getReflection } from "@/api/reflections";

const mockQuery = vi.mocked(db.query);

beforeEach(() => {
  mockQuery.mockReset();
});

const SESSION_ID = "session-abc-123";
const VALID_PAYLOAD = JSON.stringify({ summary: "Good session", score: 88 });

describe("getReflection", () => {
  it("returns JSON.parsed payload when row exists", async () => {
    mockQuery.mockResolvedValue([{ payload: VALID_PAYLOAD }]);
    const result = await getReflection(SESSION_ID);
    expect(result).toEqual({ summary: "Good session", score: 88 });
  });

  it("returns null when no row exists (post_report_graph hasn't run)", async () => {
    mockQuery.mockResolvedValue([]);
    const result = await getReflection(SESSION_ID);
    expect(result).toBeNull();
  });

  it("re-throws when JSON.parse fails (corrupt payload)", async () => {
    mockQuery.mockResolvedValue([{ payload: "not-json{{" }]);
    await expect(getReflection(SESSION_ID)).rejects.toThrow(SyntaxError);
  });

  it("binds sessionId in the SQL query", async () => {
    mockQuery.mockResolvedValue([]);
    await getReflection(SESSION_ID);
    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT payload FROM reflection_reports WHERE session_id = ?",
      [SESSION_ID],
    );
  });
});
