/**
 * api/appSettings — M5.4.dev.b PR1/4
 *
 * Tests the db Bridge CRUD pattern for getAppSetting / putAppSetting.
 * Mocks @/services/db so the bridge layer is not exercised here
 * (bridge contract is covered by infra/db.expanded.test.ts).
 *
 * §A0: no Tauri. §B9: db mock mirrors Zod Row contract.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/db", () => ({
  db: {
    query: vi.fn(),
    exec: vi.fn(),
  },
}));

import { db } from "@/services/db";
import { getAppSetting, putAppSetting } from "@/api/appSettings";

const mockQuery = vi.mocked(db.query);
const mockExec = vi.mocked(db.exec);

beforeEach(() => {
  mockQuery.mockReset();
  mockExec.mockReset();
});

describe("getAppSetting", () => {
  it("returns JSON.parsed value when row exists", async () => {
    mockQuery.mockResolvedValue([{ value: "true" }]);
    const result = await getAppSetting<boolean>("interviewer_tts_enabled");
    expect(result).toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT value FROM app_settings WHERE key = ?",
      ["interviewer_tts_enabled"],
    );
  });

  it("returns null when no row exists (404-equivalent)", async () => {
    mockQuery.mockResolvedValue([]);
    const result = await getAppSetting("observer_panel_enabled");
    expect(result).toBeNull();
  });

  it("returns a string value correctly", async () => {
    mockQuery.mockResolvedValue([{ value: '"interview"' }]);
    const result = await getAppSetting<string>("interview_input_mode");
    expect(result).toBe("interview");
  });

  it("returns a number value correctly", async () => {
    mockQuery.mockResolvedValue([{ value: "42" }]);
    const result = await getAppSetting<number>("some_count");
    expect(result).toBe(42);
  });

  it("re-throws when JSON.parse fails (corrupt row)", async () => {
    mockQuery.mockResolvedValue([{ value: "not-json{{" }]);
    await expect(getAppSetting("bad_key")).rejects.toThrow(SyntaxError);
  });

  it("re-throws db errors without swallowing them", async () => {
    mockQuery.mockRejectedValue(new Error("db.query-failed"));
    await expect(getAppSetting("any_key")).rejects.toThrow("db.query-failed");
  });
});

describe("putAppSetting", () => {
  beforeEach(() => {
    mockExec.mockResolvedValue({ rowsAffected: 1 });
  });

  it("returns the written value on success", async () => {
    const result = await putAppSetting("observer_panel_enabled", true);
    expect(result).toBe(true);
  });

  it("calls db.exec with ON CONFLICT upsert SQL", async () => {
    await putAppSetting("interviewer_tts_enabled", false);
    const [sql] = mockExec.mock.calls[0];
    expect(sql).toMatch(/ON CONFLICT\(key\) DO UPDATE/i);
  });

  it("JSON.stringifies the value before storing", async () => {
    await putAppSetting("interview_input_mode", "voice");
    const params = mockExec.mock.calls[0][1]!;
    // params[0]=key, params[1]=JSON value, params[2]=timestamp
    expect(params[1]).toBe('"voice"');
  });

  it("JSON.stringifies boolean false correctly", async () => {
    await putAppSetting("observer_panel_enabled", false);
    const params = mockExec.mock.calls[0][1]!;
    expect(params[1]).toBe("false");
  });

  it("uses the correct key as first SQL param", async () => {
    await putAppSetting("my_setting_key", "value");
    const params = mockExec.mock.calls[0][1]!;
    expect(params[0]).toBe("my_setting_key");
  });

  it("includes an ISO timestamp as third SQL param", async () => {
    await putAppSetting("ts_check", 1);
    const params = mockExec.mock.calls[0][1]!;
    expect(typeof params[2]).toBe("string");
    expect(new Date(params[2] as string).toISOString()).toBe(params[2]);
  });

  it("re-throws db errors without swallowing them", async () => {
    mockExec.mockRejectedValue(new Error("SQLITE_CONSTRAINT"));
    await expect(putAppSetting("key", "val")).rejects.toThrow("SQLITE_CONSTRAINT");
  });
});
