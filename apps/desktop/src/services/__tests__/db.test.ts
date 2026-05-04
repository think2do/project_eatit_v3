import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "../db";

// Valid UUID v4 used as mock IDs throughout.
const UUID1 = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const UUID2 = "550e8400-e29b-41d4-a716-446655440000";
const UUID3 = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
const UUID4 = "6ba7b811-9dad-41d1-80b4-00c04fd430c9";
const UUID5 = "6ba7b812-9dad-41d1-80b4-00c04fd430ca";
const UUID6 = "6ba7b813-9dad-41d1-80b4-00c04fd430cb";
const UUID7 = "6ba7b814-9dad-41d1-80b4-00c04fd430cc";

describe("db service", () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).webkit = {
      messageHandlers: {
        eatit: { postMessage: vi.fn() },
      },
    };
  });

  it("exec() happy path returns rowsAffected", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID1);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: UUID1, ok: true, data: { rowsAffected: 1 } });

    const result = await db.exec("INSERT INTO t (name) VALUES (?)", ["hello"]);
    expect(result).toEqual({ rowsAffected: 1 });
  });

  it("query() happy path returns 2-row array", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID2);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: UUID2,
      ok: true,
      data: [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ],
    });

    const rows = await db.query("SELECT id, name FROM t");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ id: 1, name: "Alice" });
    expect(rows[1]).toEqual({ id: 2, name: "Bob" });
  });

  it("query() empty result returns []", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID3);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: UUID3, ok: true, data: [] });

    const rows = await db.query("SELECT * FROM t WHERE id = -1");
    expect(rows).toEqual([]);
  });

  it("tx() happy path resolves void", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID4);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: UUID4, ok: true, data: {} });

    await expect(
      db.tx([
        { sql: "INSERT INTO t (name) VALUES (?)", params: ["x"] },
        { sql: "INSERT INTO t (name) VALUES (?)", params: ["y"] },
      ])
    ).resolves.not.toThrow();
  });

  it("exec() error path throws BridgeError when ok=false", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID5);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: UUID5,
      ok: false,
      error: { code: "db.exec-failed", message: "SQLITE_CONSTRAINT" },
    });

    const { BridgeError } = await import("../nativeBridge");
    const err = await db.exec("INSERT INTO t (id) VALUES (1)").catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect(err.code).toBe("db.exec-failed");
  });

  it("query() returns ZodError when data is malformed", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID6);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: UUID6,
      ok: true,
      // Array contains an object whose value is a nested object — invalid per RowSchema.
      data: [{ id: { nested: "object" } }],
    });

    const { ZodError } = await import("zod");
    const err = await db.query("SELECT id FROM t").catch((e) => e);
    expect(err).toBeInstanceOf(ZodError);
  });

  it("§B9 contract: db has no read or internal methods", () => {
    // Mirrors §C3 discipline in keychain.ts — no methods that could leak raw internal state.
    expect((db as Record<string, unknown>).read).toBeUndefined();
    expect((db as Record<string, unknown>).internal).toBeUndefined();
  });

  it("exec() sends correct method and params to bridge", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID7);
    const mockPost = window.webkit!.messageHandlers!.eatit!
      .postMessage as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ id: UUID7, ok: true, data: { rowsAffected: 0 } });

    await db.exec("CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY)", []);

    expect(mockPost).toHaveBeenCalledWith({
      id: UUID7,
      method: "db.exec",
      params: {
        sql: "CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY)",
        params: [],
      },
    });
  });
});
