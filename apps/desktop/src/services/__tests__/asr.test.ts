import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import {
  asrStart,
  asrStop,
  asrStatus,
  ASRStartParamsSchema,
  ASRStartedSchema,
  ASRStoppedSchema,
  ASRStatusResultSchema,
  ASRPartialPayloadSchema,
  ASRFinalPayloadSchema,
  ASREndPayloadSchema,
} from "../asr";
import { BridgeError } from "../nativeBridge";

const UUID = "b1ccdc88-8d1a-5fg9-cc7e-7cc0ce491b22";

describe("asr service", () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).webkit = {
      messageHandlers: {
        eatit: { postMessage: vi.fn() },
      },
    };
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID as ReturnType<typeof crypto.randomUUID>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // MARK: - asrStart happy path

  it("asrStart happy path — bridge.call('asr.start') invoked with correct params; returns {streamId, started}", async () => {
    const postMessage = (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    );
    postMessage.mockResolvedValue({
      id: UUID,
      ok: true,
      data: { streamId: "stream-asr-1", started: true },
    });

    const result = await asrStart({ streamId: "stream-asr-1" });

    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "asr.start",
        params: { streamId: "stream-asr-1" },
      })
    );
    expect(result.streamId).toBe("stream-asr-1");
    expect(result.started).toBe(true);
  });

  // MARK: - asrStart propagates BridgeError on credentials-missing

  it("asrStart propagates BridgeError on credentials-missing", async () => {
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: UUID,
      ok: false,
      error: { code: "asr.credentials-missing", message: "volc-asr-credentials not configured in Keychain" },
    });

    const err = await asrStart({ streamId: "stream-asr-2" }).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("asr.credentials-missing");
  });

  // MARK: - asrStart Zod rejects malformed response (missing started field)

  it("asrStart Zod rejects malformed response — missing started field throws ZodError", async () => {
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: UUID,
      ok: true,
      data: { streamId: "stream-asr-3" },  // missing `started`
    });

    const err = await asrStart({ streamId: "stream-asr-3" }).catch((e) => e);
    expect(err).toBeInstanceOf(z.ZodError);
  });

  // MARK: - asrStop happy path

  it("asrStop happy path — bridge.call('asr.stop') invoked; returns {stopped: true}", async () => {
    const postMessage = (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    );
    postMessage.mockResolvedValue({
      id: UUID,
      ok: true,
      data: { stopped: true },
    });

    const result = await asrStop("stream-asr-4");

    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "asr.stop",
        params: { streamId: "stream-asr-4" },
      })
    );
    expect(result.stopped).toBe(true);
  });

  // MARK: - Scope check: asr module exports start / stop / status (no internal)

  it("asr module exports asrStart, asrStop, and asrStatus — no internal helpers", async () => {
    const mod = await import("../asr");
    expect(typeof mod.asrStart).toBe("function");
    expect(typeof mod.asrStop).toBe("function");
    // asrStatus now exported in M2.8.dev.c
    expect(typeof mod.asrStatus).toBe("function");
    // No internal helpers or read functions exported
    expect((mod as Record<string, unknown>).asrRead).toBeUndefined();
    expect((mod as Record<string, unknown>).asrInternal).toBeUndefined();
  });

  // MARK: - Schema validation: ASRStartParamsSchema

  it("ASRStartParamsSchema accepts {streamId} only (optional fields absent)", () => {
    const parsed = ASRStartParamsSchema.parse({ streamId: "s1" });
    expect(parsed.streamId).toBe("s1");
    expect(parsed.enableITN).toBeUndefined();
    expect(parsed.enablePunc).toBeUndefined();
  });

  it("ASRStartParamsSchema accepts all optional fields", () => {
    const parsed = ASRStartParamsSchema.parse({ streamId: "s2", enableITN: true, enablePunc: false });
    expect(parsed.enableITN).toBe(true);
    expect(parsed.enablePunc).toBe(false);
  });

  it("ASRStartParamsSchema rejects missing streamId", () => {
    expect(() => ASRStartParamsSchema.parse({})).toThrow(z.ZodError);
  });

  // MARK: - ASRStartedSchema / ASRStoppedSchema

  it("ASRStartedSchema validates {streamId, started}", () => {
    const parsed = ASRStartedSchema.parse({ streamId: "s3", started: true });
    expect(parsed.started).toBe(true);
  });

  it("ASRStartedSchema rejects missing started", () => {
    expect(() => ASRStartedSchema.parse({ streamId: "s4" })).toThrow(z.ZodError);
  });

  it("ASRStoppedSchema validates {stopped}", () => {
    const parsed = ASRStoppedSchema.parse({ stopped: true });
    expect(parsed.stopped).toBe(true);
  });

  it("ASRStoppedSchema rejects missing stopped", () => {
    expect(() => ASRStoppedSchema.parse({})).toThrow(z.ZodError);
  });

  // MARK: - ASRPartialPayloadSchema (M2.8.dev.c)

  it("ASRPartialPayloadSchema parses {text, definite: false}", () => {
    const parsed = ASRPartialPayloadSchema.parse({ text: "hello", definite: false });
    expect(parsed.text).toBe("hello");
    expect(parsed.definite).toBe(false);
  });

  it("ASRPartialPayloadSchema rejects definite: true", () => {
    expect(() => ASRPartialPayloadSchema.parse({ text: "hello", definite: true })).toThrow(z.ZodError);
  });

  it("ASRPartialPayloadSchema rejects missing text", () => {
    expect(() => ASRPartialPayloadSchema.parse({ definite: false })).toThrow(z.ZodError);
  });

  // MARK: - ASRFinalPayloadSchema (M2.8.dev.c)

  it("ASRFinalPayloadSchema parses with optional startTime/endTime", () => {
    const parsed = ASRFinalPayloadSchema.parse({
      text: "hello world",
      definite: true,
      startTime: 0,
      endTime: 1500,
    });
    expect(parsed.text).toBe("hello world");
    expect(parsed.definite).toBe(true);
    expect(parsed.startTime).toBe(0);
    expect(parsed.endTime).toBe(1500);
  });

  it("ASRFinalPayloadSchema parses without optional timing fields", () => {
    const parsed = ASRFinalPayloadSchema.parse({ text: "hello", definite: true });
    expect(parsed.startTime).toBeUndefined();
    expect(parsed.endTime).toBeUndefined();
  });

  it("ASRFinalPayloadSchema rejects definite: false", () => {
    expect(() => ASRFinalPayloadSchema.parse({ text: "hello", definite: false })).toThrow(z.ZodError);
  });

  it("ASRFinalPayloadSchema rejects missing text", () => {
    expect(() => ASRFinalPayloadSchema.parse({ definite: true })).toThrow(z.ZodError);
  });

  // MARK: - ASREndPayloadSchema (M2.8.dev.c)

  it("ASREndPayloadSchema accepts all 6 reason values", () => {
    const reasons = ["stop", "client-stop", "eof", "1011", "1006", "error"] as const;
    for (const reason of reasons) {
      const parsed = ASREndPayloadSchema.parse({ reason });
      expect(parsed.reason).toBe(reason);
    }
  });

  it("ASREndPayloadSchema rejects unknown reason", () => {
    expect(() => ASREndPayloadSchema.parse({ reason: "unknown" })).toThrow(z.ZodError);
  });

  it("ASREndPayloadSchema reason='error' with errorCode + errorMessage parses correctly", () => {
    const parsed = ASREndPayloadSchema.parse({
      reason: "error",
      errorCode: "asr.frame-unpack-failed",
      errorMessage: "header too short",
    });
    expect(parsed.reason).toBe("error");
    expect(parsed.errorCode).toBe("asr.frame-unpack-failed");
    expect(parsed.errorMessage).toBe("header too short");
  });

  it("ASREndPayloadSchema errorCode and errorMessage are optional", () => {
    const parsed = ASREndPayloadSchema.parse({ reason: "stop" });
    expect(parsed.errorCode).toBeUndefined();
    expect(parsed.errorMessage).toBeUndefined();
  });

  // MARK: - ASRStatusResultSchema (M2.8.dev.c)

  it("ASRStatusResultSchema round-trip {connected: true, streamId, retryCount}", () => {
    const parsed = ASRStatusResultSchema.parse({
      connected: true,
      streamId: "stream-x",
      retryCount: 0,
    });
    expect(parsed.connected).toBe(true);
    expect(parsed.streamId).toBe("stream-x");
    expect(parsed.retryCount).toBe(0);
  });

  it("ASRStatusResultSchema accepts connected=false without streamId", () => {
    const parsed = ASRStatusResultSchema.parse({ connected: false, retryCount: 0 });
    expect(parsed.connected).toBe(false);
    expect(parsed.streamId).toBeUndefined();
  });

  it("ASRStatusResultSchema rejects missing connected", () => {
    expect(() => ASRStatusResultSchema.parse({ retryCount: 0 })).toThrow(z.ZodError);
  });

  it("ASRStatusResultSchema rejects negative retryCount", () => {
    expect(() => ASRStatusResultSchema.parse({ connected: false, retryCount: -1 })).toThrow(z.ZodError);
  });

  // MARK: - asrStatus round-trip bridge.call (M2.8.dev.c)

  it("asrStatus() round-trips bridge.call('asr.status', {}); returns ASRStatusResult", async () => {
    const postMessage = (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    );
    postMessage.mockResolvedValue({
      id: UUID,
      ok: true,
      data: { connected: true, streamId: "stream-status-1", retryCount: 0 },
    });

    const result = await asrStatus();

    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "asr.status",
        params: {},
      })
    );
    expect(result.connected).toBe(true);
    expect(result.streamId).toBe("stream-status-1");
    expect(result.retryCount).toBe(0);
  });

  it("asrStatus() Zod rejects malformed response — missing connected field", async () => {
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: UUID,
      ok: true,
      data: { retryCount: 0 },  // missing `connected`
    });

    const err = await asrStatus().catch((e) => e);
    expect(err).toBeInstanceOf(z.ZodError);
  });
});
