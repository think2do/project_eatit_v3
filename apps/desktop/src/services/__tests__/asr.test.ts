import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import {
  asrStart,
  asrStop,
  ASRStartParamsSchema,
  ASRStartedSchema,
  ASRStoppedSchema,
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

  // MARK: - Scope check: asr module exports only start / stop (no status / read / internal)

  it("asr module exports only asrStart and asrStop — no asrStatus, no read, no internal", async () => {
    const mod = await import("../asr");
    expect(typeof mod.asrStart).toBe("function");
    expect(typeof mod.asrStop).toBe("function");
    // asrStatus is deferred to M2.8.dev.c — must NOT be exported yet
    expect((mod as Record<string, unknown>).asrStatus).toBeUndefined();
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
});
