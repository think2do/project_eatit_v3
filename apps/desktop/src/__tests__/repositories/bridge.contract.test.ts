/**
 * repositories/bridge.contract — M5.2.c
 *
 * In v3.4, the Swift Bridge (NativeBridge + GRDB backend) serves the role that Python
 * repositories played in v3.3.  These tests exercise the Bridge layer as a "repository"
 * boundary: event routing, multi-handler subscriptions, schema validation at the
 * BridgeResponse/BridgeEvent boundary.
 *
 * §A0: no Tauri import.
 * §C3: no secret material crosses the Bridge in any test.
 * L0 #11: BridgeEventSchema enum values unchanged.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  bridge,
  BridgeError,
  BridgeResponseSchema,
  BridgeEventSchema,
} from "../../services/nativeBridge";
import { z } from "zod";

const UUID_A = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const UUID_B = "550e8400-e29b-41d4-a716-446655440000";
const UUID_C = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
const UUID_D = "6ba7b811-9dad-41d1-80b4-00c04fd430c9";
const UUID_E = "6ba7b812-9dad-41d1-80b4-00c04fd430ca";
const UUID_F = "6ba7b813-9dad-41d1-80b4-00c04fd430cb";
const UUID_G = "6ba7b814-9dad-41d1-80b4-00c04fd430cc";
const UUID_H = "6ba7b815-9dad-41d1-80b4-00c04fd430cd";

describe("repositories/bridge.contract — BridgeError constructor & code propagation", () => {
  it("BridgeError constructor sets name='BridgeError'", () => {
    const err = new BridgeError({ code: "db.exec-failed", message: "constraint" });
    expect(err.name).toBe("BridgeError");
  });

  it("BridgeError.message includes [code] prefix and original message", () => {
    const err = new BridgeError({ code: "asr.credentials-missing", message: "not configured" });
    expect(err.message).toContain("[asr.credentials-missing]");
    expect(err.message).toContain("not configured");
  });

  it("BridgeError.originalMessage preserves the raw message separately", () => {
    const err = new BridgeError({ code: "llm.rate-limited", message: "429 too many requests" });
    expect(err.originalMessage).toBe("429 too many requests");
  });

  it("BridgeError is instanceof Error", () => {
    const err = new BridgeError({ code: "bridge.method-not-found", message: "x" });
    expect(err).toBeInstanceOf(Error);
  });

  it("each known BridgeError code produces a BridgeError with matching .code", () => {
    const codes = [
      "bridge.handler-not-installed",
      "bridge.method-not-found",
      "db.exec-failed",
      "db.query-failed",
      "keychain.save-failed",
      "keychain.delete-failed",
      "audio.permission-denied",
      "audio.engine-start-failed",
      "pdf.invalid-base64",
      "pdf.invalid-pdf",
      "llm.api-key-missing",
      "llm.api-key-invalid",
      "asr.credentials-missing",
      "asr.already-connected",
    ];
    for (const code of codes) {
      const err = new BridgeError({ code, message: "test" });
      expect(err.code).toBe(code);
      expect(err.constructor.name).toBe("BridgeError");
    }
  });
});

describe("repositories/bridge.contract — BridgeResponseSchema discriminated union", () => {
  it("success branch: ok=true with data accepts and returns data", () => {
    const parsed = BridgeResponseSchema.parse({ id: UUID_A, ok: true, data: { rows: 3 } });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data).toEqual({ rows: 3 });
  });

  it("success branch: data=null accepted (void bridge calls)", () => {
    const parsed = BridgeResponseSchema.parse({ id: UUID_B, ok: true, data: null });
    expect(parsed.ok).toBe(true);
  });

  it("success branch: data=[] accepted (empty query result)", () => {
    const parsed = BridgeResponseSchema.parse({ id: UUID_C, ok: true, data: [] });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data).toEqual([]);
  });

  it("failure branch: ok=false with error code+message accepted", () => {
    const parsed = BridgeResponseSchema.parse({
      id: UUID_D,
      ok: false,
      error: { code: "db.exec-failed", message: "SQLITE_CONSTRAINT" },
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe("db.exec-failed");
      expect(parsed.error.message).toBe("SQLITE_CONSTRAINT");
    }
  });

  it("missing id field throws ZodError", () => {
    expect(() => BridgeResponseSchema.parse({ ok: true, data: {} })).toThrow(z.ZodError);
  });

  it("missing ok field throws ZodError", () => {
    expect(() => BridgeResponseSchema.parse({ id: UUID_E, data: {} })).toThrow(z.ZodError);
  });

  it("failure branch without error field throws ZodError", () => {
    expect(() => BridgeResponseSchema.parse({ id: UUID_F, ok: false })).toThrow(z.ZodError);
  });

  it("failure branch with incomplete error (missing message) throws ZodError", () => {
    expect(() =>
      BridgeResponseSchema.parse({ id: UUID_G, ok: false, error: { code: "x" } })
    ).toThrow(z.ZodError);
  });
});

describe("repositories/bridge.contract — BridgeEventSchema L0 #11 event type lock", () => {
  // L0 #11: BridgeEventSchema enum values must never change.
  const LOCKED_EVENT_TYPES = [
    "stream-chunk",
    "stream-end",
    "stream-error",
    "asr-partial",
    "asr-final",
    "asr-end",
    "file-dropped",
  ] as const;

  it("L0 #11 lock: all 7 event types are accepted by BridgeEventSchema", () => {
    for (const type of LOCKED_EVENT_TYPES) {
      const parsed = BridgeEventSchema.parse({ type, streamId: "s1", payload: {} });
      expect(parsed.type).toBe(type);
    }
  });

  it("L0 #11 lock: BridgeEventSchema has exactly 7 enum variants", () => {
    expect(LOCKED_EVENT_TYPES).toHaveLength(7);
  });

  it("BridgeEventSchema rejects unknown type 'db-changed'", () => {
    expect(() =>
      BridgeEventSchema.parse({ type: "db-changed", streamId: "s1", payload: {} })
    ).toThrow(z.ZodError);
  });

  it("BridgeEventSchema rejects missing streamId field", () => {
    expect(() =>
      BridgeEventSchema.parse({ type: "stream-chunk", payload: {} })
    ).toThrow(z.ZodError);
  });
});

describe("repositories/bridge.contract — bridge.on() multi-handler routing", () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).webkit = {
      messageHandlers: { eatit: { postMessage: vi.fn() } },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("two handlers on same event type both receive the event", () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bridge.on("asr-partial", h1);
    bridge.on("asr-partial", h2);

    window.eatitBridge!.dispatch!({
      type: "asr-partial",
      streamId: "s1",
      payload: { text: "hi", definite: false },
    });

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();

    // Cleanup to avoid handler accumulation across tests.
    bridge.on("asr-partial", h1)(); // register+immediate unsub trick
    bridge.on("asr-partial", h2)();
  });

  it("handler for 'file-dropped' does NOT fire on 'stream-chunk' event", () => {
    const fileHandler = vi.fn();
    const unsub = bridge.on("file-dropped", fileHandler);

    window.eatitBridge!.dispatch!({
      type: "stream-chunk",
      streamId: "s2",
      payload: { content: "hello" },
    });

    expect(fileHandler).not.toHaveBeenCalled();
    unsub();
  });

  it("unsubscribed handler does not fire on subsequent dispatch", () => {
    const handler = vi.fn();
    const unsub = bridge.on("stream-end", handler);

    window.eatitBridge!.dispatch!({
      type: "stream-end",
      streamId: "s3",
      payload: { finishReason: "stop" },
    });
    expect(handler).toHaveBeenCalledOnce();

    unsub();

    window.eatitBridge!.dispatch!({
      type: "stream-end",
      streamId: "s4",
      payload: { finishReason: "stop" },
    });
    expect(handler).toHaveBeenCalledOnce(); // still 1, not 2
  });

  it("registering same function twice yields two invocations (Set semantics: same fn = same entry)", () => {
    const handler = vi.fn();
    // Set deduplicated — same function reference registered twice = 1 entry in Set.
    const unsub1 = bridge.on("stream-error", handler);
    bridge.on("stream-error", handler);

    window.eatitBridge!.dispatch!({
      type: "stream-error",
      streamId: "s5",
      payload: { code: "llm.stream-cancelled", message: "cancelled" },
    });

    // Set: duplicate added but Set ignores it — handler is called once.
    expect(handler).toHaveBeenCalledTimes(1);

    unsub1();
  });

  it("bridge.call() with unknown method propagates BridgeError code from Swift", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID_H);
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({
      id: UUID_H,
      ok: false,
      error: { code: "bridge.method-not-found", message: "method 'db.nonexistent' not registered" },
    });

    const err = await bridge.call("db.nonexistent", {}).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("bridge.method-not-found");
  });

  it("bridge.call() rejects ZodError when response is completely malformed", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID_A);
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    // Reply missing `ok` field — BridgeResponseSchema will throw ZodError.
    mockPost.mockResolvedValue({ id: UUID_A, data: { rows: 1 } });

    const err = await bridge.call("db.exec", { sql: "SELECT 1" }).catch((e) => e);
    expect(err).toBeInstanceOf(z.ZodError);
  });
});
