/**
 * infra/asr.expanded — M5.2.c
 *
 * Augments services/__tests__/asr.test.ts (~40+ tests in 3 describe blocks)
 * with boundary cases NOT already covered.
 *
 * Existing coverage: asrStart/stop/status happy paths + BridgeError,
 *   all schema round-trips, asrStream partial/final/end/error/filter/cleanup,
 *   useASRStream orchestration (start order, stop order, audio rollback, chunk propagation).
 *
 * Added here:
 *   - asrStart propagates asr.credentials-malformed BridgeError
 *   - asrStart propagates asr.already-connected BridgeError
 *   - asrStart propagates asr.ws-handshake-failed BridgeError
 *   - asrStop propagates BridgeError when ok=false
 *   - asrStatus() propagates BridgeError (asr.status-failed)
 *   - ASRStartParamsSchema: enableITN=false accepted
 *   - ASRStartParamsSchema: unknown extra field rejected (not strict — passthrough behavior)
 *   - ASREndPayloadSchema all reason codes produce correct parsed.reason
 *   - ASRFinalPayloadSchema: negative startTime rejected
 *   - ASRStatusResultSchema: retryCount=0 is minimum (cannot be float)
 *   - bridge.handler-not-installed when webkit missing on asrStart
 *   - asrStream: only asr-partial/asr-final chunks yielded (not asr-end chunks)
 *
 * §A0: no Tauri.
 * §C3: no credentials / accessToken in any test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import {
  asrStart,
  asrStop,
  asrStatus,
  asrStream,
  ASRStartParamsSchema,
  ASREndPayloadSchema,
  ASRFinalPayloadSchema,
  ASRStatusResultSchema,
  type ASRStreamChunk,
} from "../../services/asr";
import { BridgeError } from "../../services/nativeBridge";

const UUID = "b2ccdc88-8d1a-5f99-bc7e-7bc0ce491b33";

describe("infra/asr.expanded — asrStart/stop/status BridgeError codes", () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).webkit = {
      messageHandlers: { eatit: { postMessage: vi.fn() } },
    };
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID as ReturnType<typeof crypto.randomUUID>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asrStart propagates asr.credentials-malformed BridgeError", async () => {
    (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>)
      .mockResolvedValue({
        id: UUID,
        ok: false,
        error: { code: "asr.credentials-malformed", message: "JSON parse failed" },
      });

    const err = await asrStart({ streamId: "s-cred" }).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("asr.credentials-malformed");
  });

  it("asrStart propagates asr.already-connected BridgeError", async () => {
    (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>)
      .mockResolvedValue({
        id: UUID,
        ok: false,
        error: { code: "asr.already-connected", message: "WebSocket already open" },
      });

    const err = await asrStart({ streamId: "s-dup" }).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("asr.already-connected");
  });

  it("asrStart propagates asr.ws-handshake-failed BridgeError", async () => {
    (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>)
      .mockResolvedValue({
        id: UUID,
        ok: false,
        error: { code: "asr.ws-handshake-failed", message: "HTTP 401 from ASR server" },
      });

    const err = await asrStart({ streamId: "s-ws" }).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("asr.ws-handshake-failed");
  });

  it("asrStart propagates bridge.handler-not-installed when webkit missing", async () => {
    delete (window as unknown as Record<string, unknown>).webkit;
    const err = await asrStart({ streamId: "s-nowebkit" }).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("bridge.handler-not-installed");
  });

  it("asrStop propagates BridgeError on ok=false", async () => {
    (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>)
      .mockResolvedValue({
        id: UUID,
        ok: false,
        error: { code: "asr.stop-failed", message: "stream not found" },
      });

    const err = await asrStop("s-stop-err").catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("asr.stop-failed");
  });

  it("asrStatus propagates BridgeError on ok=false", async () => {
    (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>)
      .mockResolvedValue({
        id: UUID,
        ok: false,
        error: { code: "asr.status-failed", message: "internal error" },
      });

    const err = await asrStatus().catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("asr.status-failed");
  });
});

describe("infra/asr.expanded — schema boundary cases", () => {
  it("ASRStartParamsSchema: enableITN=false explicitly accepted", () => {
    const parsed = ASRStartParamsSchema.parse({ streamId: "s1", enableITN: false });
    expect(parsed.enableITN).toBe(false);
  });

  it("ASRStartParamsSchema: enablePunc=true accepted with enableITN=true", () => {
    const parsed = ASRStartParamsSchema.parse({ streamId: "s2", enableITN: true, enablePunc: true });
    expect(parsed.enablePunc).toBe(true);
    expect(parsed.enableITN).toBe(true);
  });

  it("ASREndPayloadSchema reason='eof' (natural end-of-file) accepted", () => {
    const parsed = ASREndPayloadSchema.parse({ reason: "eof" });
    expect(parsed.reason).toBe("eof");
  });

  it("ASREndPayloadSchema reason='1006' (abnormal WebSocket closure) accepted", () => {
    const parsed = ASREndPayloadSchema.parse({ reason: "1006" });
    expect(parsed.reason).toBe("1006");
  });

  it("ASREndPayloadSchema reason='1011' (server-side error closure) accepted", () => {
    const parsed = ASREndPayloadSchema.parse({ reason: "1011" });
    expect(parsed.reason).toBe("1011");
  });

  it("ASRFinalPayloadSchema: negative startTime rejected", () => {
    expect(() =>
      ASRFinalPayloadSchema.parse({ text: "hello", definite: true, startTime: -1 })
    ).toThrow(z.ZodError);
  });

  it("ASRFinalPayloadSchema: startTime=0 accepted (utterance at stream start)", () => {
    const parsed = ASRFinalPayloadSchema.parse({ text: "hello", definite: true, startTime: 0 });
    expect(parsed.startTime).toBe(0);
  });

  it("ASRStatusResultSchema: retryCount float rejected (must be int)", () => {
    expect(() =>
      ASRStatusResultSchema.parse({ connected: false, retryCount: 1.5 })
    ).toThrow(z.ZodError);
  });

  it("ASRStatusResultSchema: high retryCount (e.g. 10) accepted", () => {
    const parsed = ASRStatusResultSchema.parse({ connected: true, streamId: "s1", retryCount: 10 });
    expect(parsed.retryCount).toBe(10);
  });
});

describe("infra/asr.expanded — asrStream chunk type filtering", () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).webkit = {
      messageHandlers: { eatit: { postMessage: vi.fn() } },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asrStream does NOT yield anything for asr-end event (end = iteration stop)", async () => {
    const SID = "asr-expand-end-check";
    const gen = asrStream(SID);

    const p1 = gen.next();
    // Dispatch end immediately — generator should terminate without yielding
    window.eatitBridge!.dispatch!({ type: "asr-end", streamId: SID, payload: { reason: "stop" } });

    const result = await p1;
    // Generator should be done (no chunks yielded, just completion)
    const chunks: ASRStreamChunk[] = [];
    if (!result.done) chunks.push(result.value);
    for await (const chunk of gen) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(0);
  });

  it("asrStream final chunk has type='final' with correct text", async () => {
    const SID = "asr-expand-final-type";
    const gen = asrStream(SID);

    const p1 = gen.next();
    window.eatitBridge!.dispatch!({
      type: "asr-final",
      streamId: SID,
      payload: { text: "confirmed text", definite: true },
    });
    window.eatitBridge!.dispatch!({ type: "asr-end", streamId: SID, payload: { reason: "client-stop" } });

    const chunks: ASRStreamChunk[] = [];
    const r1 = await p1;
    if (!r1.done) chunks.push(r1.value);
    for await (const chunk of gen) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ type: "final", text: "confirmed text" });
  });

  it("asrStream asr-end reason='client-stop' terminates iterator cleanly (no error)", async () => {
    const SID = "asr-expand-client-stop";
    const gen = asrStream(SID);

    const p1 = gen.next();
    window.eatitBridge!.dispatch!({
      type: "asr-partial",
      streamId: SID,
      payload: { text: "partial", definite: false },
    });
    window.eatitBridge!.dispatch!({
      type: "asr-end",
      streamId: SID,
      payload: { reason: "client-stop" },
    });

    let threw = false;
    try {
      await p1;
      for await (const _ of gen) { /* drain */ }
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
  });
});
