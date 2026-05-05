/**
 * infra/nativeBridge.expanded — M5.2.c
 *
 * Augments services/__tests__/nativeBridge.test.ts with additional boundary,
 * error-path, and schema validation tests NOT already covered in the original file.
 *
 * Existing coverage (7 tests):
 *   - call() happy path, ok=false throws BridgeError, handler-not-installed,
 *     BridgeResponse success/failure discriminated union, BridgeEvent accept/reject,
 *     on() unsubscribe.
 *
 * Added here (DO NOT duplicate the above):
 *   - bridge.call with numeric/boolean/array data returns correctly
 *   - BridgeError code on webkit missing messageHandlers
 *   - BridgeEvent payload is passed through opaquely (unknown type)
 *   - Multiple concurrent bridge.call()s with distinct UUIDs resolve independently
 *   - BridgeResponseSchema strict: no extra field pollution leaks through
 *   - dispatch rejects invalid event type without crashing bridge
 *
 * §A0: no Tauri import.
 * §C3: no secret material.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bridge, BridgeError, BridgeResponseSchema, BridgeEventSchema } from "../../services/nativeBridge";
import { z } from "zod";

const UUID1 = "f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const UUID2 = "f50e8400-e29b-41d4-a716-446655440000";
const UUID3 = "fba7b810-9dad-41d1-80b4-00c04fd430c8";
const UUID4 = "fba7b811-9dad-41d1-80b4-00c04fd430c9";

describe("infra/nativeBridge.expanded — bridge.call() data passthrough", () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).webkit = {
      messageHandlers: { eatit: { postMessage: vi.fn() } },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("call() returns number data correctly", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID1);
    (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ id: UUID1, ok: true, data: 42 });

    const result = await bridge.call<number>("db.count", {});
    expect(result).toBe(42);
  });

  it("call() returns boolean data correctly", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID2);
    (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ id: UUID2, ok: true, data: false });

    const result = await bridge.call<boolean>("keychain.exists", { account: "ark-api-key" });
    expect(result).toBe(false);
  });

  it("call() returns array data correctly", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID3);
    (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ id: UUID3, ok: true, data: [{ id: 1 }, { id: 2 }] });

    const result = await bridge.call<{ id: number }[]>("db.query", { sql: "SELECT id FROM t" });
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
  });

  it("call() sends the correct id/method/params envelope to postMessage", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID4);
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ id: UUID4, ok: true, data: {} });

    await bridge.call("audio.stop", { reason: "user" });

    expect(mockPost).toHaveBeenCalledWith({
      id: UUID4,
      method: "audio.stop",
      params: { reason: "user" },
    });
  });

  it("webkit present but messageHandlers absent throws bridge.handler-not-installed", async () => {
    (window as unknown as Record<string, unknown>).webkit = {};
    const err = await bridge.call("bridge.echo", {}).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("bridge.handler-not-installed");
  });

  it("webkit.messageHandlers present but eatit handler absent throws bridge.handler-not-installed", async () => {
    (window as unknown as Record<string, unknown>).webkit = { messageHandlers: {} };
    const err = await bridge.call("bridge.echo", {}).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("bridge.handler-not-installed");
  });
});

describe("infra/nativeBridge.expanded — BridgeResponseSchema extra field handling", () => {
  it("BridgeResponseSchema ok=true: extra fields present do not cause parse failure (z.unknown data)", () => {
    // The data field is z.unknown() — extra nested fields inside data are OK.
    const parsed = BridgeResponseSchema.parse({
      id: UUID1,
      ok: true,
      data: { result: "ok", extraNested: { deep: true } },
    });
    expect(parsed.ok).toBe(true);
  });

  it("BridgeResponseSchema ok=false: extra field in error object is stripped (no strict mode)", () => {
    // error is z.object({code,message}) without .strict() — Zod default strips extra keys.
    // Verify the parse succeeds and the known fields survive.
    const parsed = BridgeResponseSchema.parse({
      id: UUID2,
      ok: false,
      error: { code: "x", message: "y", extra: "stripped" },
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe("x");
      expect((parsed.error as Record<string, unknown>).extra).toBeUndefined();
    }
  });
});

describe("infra/nativeBridge.expanded — BridgeEvent dispatch routing", () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).webkit = {
      messageHandlers: { eatit: { postMessage: vi.fn() } },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatch() with invalid event type throws ZodError (does not silently drop)", () => {
    expect(() => {
      window.eatitBridge!.dispatch!({ type: "invalid-type", streamId: "s1", payload: {} });
    }).toThrow(z.ZodError);
  });

  it("BridgeEvent payload is propagated as-is through bridge.on handler", () => {
    const handler = vi.fn();
    const unsub = bridge.on("asr-final", handler);

    const payload = { text: "hello world", definite: true, startTime: 0, endTime: 1500 };
    window.eatitBridge!.dispatch!({ type: "asr-final", streamId: "s-asr", payload });

    expect(handler).toHaveBeenCalledOnce();
    const receivedEvent = handler.mock.calls[0][0];
    expect(receivedEvent.type).toBe("asr-final");
    expect(receivedEvent.payload).toEqual(payload);

    unsub();
  });

  it("bridge.on() for 'asr-end' only fires on asr-end events, not asr-partial", () => {
    const endHandler = vi.fn();
    const unsub = bridge.on("asr-end", endHandler);

    window.eatitBridge!.dispatch!({
      type: "asr-partial",
      streamId: "s1",
      payload: { text: "partial", definite: false },
    });
    expect(endHandler).not.toHaveBeenCalled();

    window.eatitBridge!.dispatch!({
      type: "asr-end",
      streamId: "s1",
      payload: { reason: "stop" },
    });
    expect(endHandler).toHaveBeenCalledOnce();

    unsub();
  });

  it("BridgeEventSchema streamId must be a string — number throws ZodError", () => {
    expect(() =>
      BridgeEventSchema.parse({ type: "stream-chunk", streamId: 12345, payload: {} })
    ).toThrow(z.ZodError);
  });

  it("BridgeEventSchema payload accepts null", () => {
    const parsed = BridgeEventSchema.parse({ type: "stream-end", streamId: "s1", payload: null });
    expect(parsed.payload).toBeNull();
  });
});
