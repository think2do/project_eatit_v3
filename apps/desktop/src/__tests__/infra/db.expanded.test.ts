/**
 * infra/db.expanded — M5.2.c
 *
 * Augments services/__tests__/db.test.ts (8 tests) with boundary and
 * edge-case tests NOT already covered.
 *
 * Existing coverage: exec happy path (rowsAffected), query 2-row result,
 *   query empty result, tx happy path, exec BridgeError, query ZodError on
 *   malformed data, §B9 no-read/internal contract, exec sends correct envelope.
 *
 * Added here:
 *   - tx() propagates BridgeError on db.tx-failed
 *   - query() with bound params sends them correctly
 *   - exec() no-params defaults to []
 *   - DBValueSchema accepts null/boolean/number/string; rejects object
 *   - ExecResultSchema rejects float rowsAffected
 *   - RowSchema accepts null column value
 *   - db.handler-not-installed when webkit missing
 *   - query() propagates BridgeError on db.query-failed
 *   - tx() sends method='db.tx' with statements array
 *
 * §A0: no Tauri.
 * §C3: no secret values in SQL params.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db, DBValueSchema, ExecResultSchema, RowSchema } from "../../services/db";
import { BridgeError } from "../../services/nativeBridge";
import { z } from "zod";

const UUID1 = "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const UUID2 = "d50e8400-e29b-41d4-a716-446655440000";
const UUID3 = "dba7b810-9dad-41d1-80b4-00c04fd430c8";
const UUID4 = "dba7b811-9dad-41d1-80b4-00c04fd430c9";
const UUID5 = "dba7b812-9dad-41d1-80b4-00c04fd430ca";
const UUID6 = "dba7b813-9dad-41d1-80b4-00c04fd430cb";
const UUID7 = "dba7b814-9dad-41d1-80b4-00c04fd430cc";

describe("infra/db.expanded — Schema validation", () => {
  it("DBValueSchema accepts null", () => {
    expect(DBValueSchema.parse(null)).toBeNull();
  });

  it("DBValueSchema accepts boolean true/false", () => {
    expect(DBValueSchema.parse(true)).toBe(true);
    expect(DBValueSchema.parse(false)).toBe(false);
  });

  it("DBValueSchema accepts integer number", () => {
    expect(DBValueSchema.parse(42)).toBe(42);
  });

  it("DBValueSchema accepts float number", () => {
    expect(DBValueSchema.parse(3.14)).toBe(3.14);
  });

  it("DBValueSchema accepts string", () => {
    expect(DBValueSchema.parse("hello")).toBe("hello");
  });

  it("DBValueSchema rejects plain object", () => {
    expect(() => DBValueSchema.parse({ nested: true })).toThrow(z.ZodError);
  });

  it("DBValueSchema rejects array", () => {
    expect(() => DBValueSchema.parse([1, 2, 3])).toThrow(z.ZodError);
  });

  it("ExecResultSchema rejects float rowsAffected", () => {
    expect(() => ExecResultSchema.parse({ rowsAffected: 1.5 })).toThrow(z.ZodError);
  });

  it("ExecResultSchema accepts rowsAffected=0 (no rows changed)", () => {
    const parsed = ExecResultSchema.parse({ rowsAffected: 0 });
    expect(parsed.rowsAffected).toBe(0);
  });

  it("RowSchema accepts null column value (nullable column)", () => {
    const row = RowSchema.parse({ id: 1, name: null, score: 85.5, active: true });
    expect(row.name).toBeNull();
    expect(row.score).toBe(85.5);
  });

  it("RowSchema accepts mixed column types in same row", () => {
    const row = RowSchema.parse({ id: 1, label: "test", flag: false, ratio: 0.5 });
    expect(row.id).toBe(1);
    expect(row.label).toBe("test");
    expect(row.flag).toBe(false);
    expect(row.ratio).toBe(0.5);
  });

  it("RowSchema rejects nested object as column value", () => {
    expect(() => RowSchema.parse({ id: { nested: true } })).toThrow(z.ZodError);
  });
});

describe("infra/db.expanded — service error paths", () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).webkit = {
      messageHandlers: { eatit: { postMessage: vi.fn() } },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tx() propagates BridgeError on db.tx-failed", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID1);
    (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>)
      .mockResolvedValue({
        id: UUID1,
        ok: false,
        error: { code: "db.tx-failed", message: "SQLITE_CONSTRAINT: UNIQUE" },
      });

    const err = await db.tx([{ sql: "INSERT INTO t (id) VALUES (1)" }]).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("db.tx-failed");
  });

  it("query() propagates BridgeError on db.query-failed", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID2);
    (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>)
      .mockResolvedValue({
        id: UUID2,
        ok: false,
        error: { code: "db.query-failed", message: "no such table: t" },
      });

    const err = await db.query("SELECT * FROM t").catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("db.query-failed");
  });

  it("exec() propagates bridge.handler-not-installed when webkit missing", async () => {
    delete (window as unknown as Record<string, unknown>).webkit;
    const err = await db.exec("SELECT 1").catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("bridge.handler-not-installed");
  });

  it("query() sends correct method and params to bridge", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID3);
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ id: UUID3, ok: true, data: [] });

    await db.query("SELECT id FROM sessions WHERE user_id = ?", ["u-123"]);

    expect(mockPost).toHaveBeenCalledWith({
      id: UUID3,
      method: "db.query",
      params: {
        sql: "SELECT id FROM sessions WHERE user_id = ?",
        params: ["u-123"],
      },
    });
  });

  it("exec() with no params defaults to [] in bridge call", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID4);
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ id: UUID4, ok: true, data: { rowsAffected: 0 } });

    await db.exec("DELETE FROM t WHERE id < 0");

    expect(mockPost).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ params: [] }),
      })
    );
  });

  it("tx() sends method='db.tx' with statements array in envelope", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID5);
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ id: UUID5, ok: true, data: {} });

    const stmts = [
      { sql: "INSERT INTO a (x) VALUES (?)", params: [1] as number[] },
      { sql: "INSERT INTO b (x) VALUES (?)", params: [2] as number[] },
    ];
    await db.tx(stmts);

    expect(mockPost).toHaveBeenCalledWith({
      id: UUID5,
      method: "db.tx",
      params: { statements: stmts },
    });
  });

  it("query() with null param value works (nullable bind variable)", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID6);
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ id: UUID6, ok: true, data: [] });

    await db.query("SELECT * FROM t WHERE name = ?", [null]);

    expect(mockPost).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ params: [null] }),
      })
    );
  });

  it("query() with boolean param value works", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID7);
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ id: UUID7, ok: true, data: [] });

    await db.query("SELECT * FROM t WHERE active = ?", [true]);

    expect(mockPost).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ params: [true] }),
      })
    );
  });
});
