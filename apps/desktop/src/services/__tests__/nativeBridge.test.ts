import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  bridge,
  BridgeError,
  BridgeResponseSchema,
  BridgeEventSchema,
} from "../nativeBridge";

// Valid UUID v4 values used as mock IDs throughout.
const UUID1 = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const UUID2 = "550e8400-e29b-41d4-a716-446655440000";
const UUID3 = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
const UUID4 = "6ba7b811-9dad-41d1-80b4-00c04fd430c9";

describe("nativeBridge", () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).webkit = {
      messageHandlers: {
        eatit: { postMessage: vi.fn() },
      },
    };
  });

  it("call() round-trips bridge.echo happy path", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID1);
    (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: UUID1,
      ok: true,
      data: { msg: "hi" },
    });
    const result = await bridge.call<{ msg: string }>("bridge.echo", { msg: "hi" });
    expect(result).toEqual({ msg: "hi" });
  });

  it("call() throws BridgeError on ok=false response", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID2);
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({
      id: UUID2,
      ok: false,
      error: { code: "bridge.method-not-found", message: "method 'foo.bar' not registered" },
    });
    await expect(bridge.call("foo.bar", {})).rejects.toBeInstanceOf(BridgeError);
    mockPost.mockResolvedValue({
      id: UUID2,
      ok: false,
      error: { code: "bridge.method-not-found", message: "method 'foo.bar' not registered" },
    });
    try {
      await bridge.call("foo.bar", {});
    } catch (e) {
      expect(e).toBeInstanceOf(BridgeError);
      expect((e as BridgeError).code).toBe("bridge.method-not-found");
    }
  });

  it("call() throws BridgeError when WKWebView handler not installed", async () => {
    delete (window as unknown as Record<string, unknown>).webkit;
    const err = await bridge.call("bridge.echo", { msg: "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("bridge.handler-not-installed");
  });

  it("BridgeResponse schema parses success discriminated union", () => {
    const ok = BridgeResponseSchema.parse({
      id: UUID3,
      ok: true,
      data: { x: 1 },
    });
    expect(ok.ok).toBe(true);
  });

  it("BridgeResponse schema parses failure discriminated union", () => {
    const err = BridgeResponseSchema.parse({
      id: UUID4,
      ok: false,
      error: { code: "test.err", message: "x" },
    });
    expect(err.ok).toBe(false);
    if (!err.ok) {
      expect(err.error.code).toBe("test.err");
    }
  });

  it("BridgeEvent schema accepts known type values", () => {
    const e = BridgeEventSchema.parse({
      type: "stream-chunk",
      streamId: "s1",
      payload: { delta: "x" },
    });
    expect(e.type).toBe("stream-chunk");
  });

  it("BridgeEvent schema rejects unknown type values", () => {
    expect(() =>
      BridgeEventSchema.parse({
        type: "unknown-type",
        streamId: "s1",
        payload: {},
      })
    ).toThrow();
  });

  it("on() returns an unsubscribe function that removes the handler", () => {
    const handler = vi.fn();
    const unsub = bridge.on("stream-chunk", handler);
    // Access private field for assertion
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((bridge as any).eventHandlers.get("stream-chunk")?.size).toBe(1);
    unsub();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((bridge as any).eventHandlers.get("stream-chunk")?.size).toBe(0);
  });
});
