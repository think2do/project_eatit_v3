import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import {
  asrStart,
  asrStop,
  asrStatus,
  asrStream,
  useASRStream,
  ASRStartParamsSchema,
  ASRStartedSchema,
  ASRStoppedSchema,
  ASRStatusResultSchema,
  ASRPartialPayloadSchema,
  ASRFinalPayloadSchema,
  ASREndPayloadSchema,
  type ASRStreamChunk,
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

// MARK: - asrStream AsyncIterator (M2.8.dev.e)

describe("asrStream", () => {
  // Each test uses a unique streamId so bridge event handlers don't cross-contaminate.
  // Pattern: call gen.next() first (registers handlers synchronously), then dispatch events.

  beforeEach(() => {
    (window as unknown as Record<string, unknown>).webkit = {
      messageHandlers: {
        eatit: { postMessage: vi.fn() },
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("yields partial chunks then final chunk, then exits gracefully on asr-end", async () => {
    const SID = "asr-stream-test-1";
    const gen = asrStream(SID);

    // Start the generator (registers bridge.on handlers synchronously, suspends at first await)
    const p1 = gen.next();
    // Dispatch 2 partials + 1 final + 1 end — handlers are now registered
    window.eatitBridge!.dispatch!({ type: "asr-partial", streamId: SID, payload: { text: "hel", definite: false } });
    window.eatitBridge!.dispatch!({ type: "asr-partial", streamId: SID, payload: { text: "hello", definite: false } });
    window.eatitBridge!.dispatch!({ type: "asr-final", streamId: SID, payload: { text: "hello world", definite: true, startTime: 0, endTime: 1200 } });
    window.eatitBridge!.dispatch!({ type: "asr-end", streamId: SID, payload: { reason: "client-stop" } });

    const chunks: ASRStreamChunk[] = [];
    const r1 = await p1;
    if (!r1.done) chunks.push(r1.value);
    for await (const chunk of gen) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual({ type: "partial", text: "hel" });
    expect(chunks[1]).toEqual({ type: "partial", text: "hello" });
    expect(chunks[2]).toEqual({ type: "final", text: "hello world", startTime: 0, endTime: 1200 });
  });

  it("filters events for other streamIds — only yields chunks for the subscribed streamId", async () => {
    const MINE = "asr-stream-mine";
    const OTHER = "asr-stream-other";
    const gen = asrStream(MINE);

    // Start the generator to register handlers
    const p1 = gen.next();

    // Dispatch event for OTHER stream — should be ignored
    window.eatitBridge!.dispatch!({ type: "asr-partial", streamId: OTHER, payload: { text: "leaked", definite: false } });
    // Then dispatch for MINE + end
    window.eatitBridge!.dispatch!({ type: "asr-partial", streamId: MINE, payload: { text: "mine-text", definite: false } });
    window.eatitBridge!.dispatch!({ type: "asr-end", streamId: MINE, payload: { reason: "stop" } });

    const chunks: ASRStreamChunk[] = [];
    const r1 = await p1;
    if (!r1.done) chunks.push(r1.value);
    for await (const chunk of gen) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ type: "partial", text: "mine-text" });
  });

  it("throws Error on asr-end with reason='error', message contains [errorCode] errorMessage", async () => {
    const SID = "asr-stream-err";
    const gen = asrStream(SID);

    // Start the generator to register handlers
    const p1 = gen.next();

    window.eatitBridge!.dispatch!({
      type: "asr-end",
      streamId: SID,
      payload: { reason: "error", errorCode: "asr.frame-unpack-failed", errorMessage: "header too short" },
    });

    const err = await p1.catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("[asr.frame-unpack-failed]");
    expect((err as Error).message).toContain("header too short");
  });

  it("uses default errorCode/errorMessage when asr-end reason='error' omits them", async () => {
    const SID = "asr-stream-err-default";
    const gen = asrStream(SID);

    const p1 = gen.next();

    window.eatitBridge!.dispatch!({
      type: "asr-end",
      streamId: SID,
      payload: { reason: "error" },
    });

    const err = await p1.catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("[asr.stream-failed]");
    expect((err as Error).message).toContain("asr stream errored");
  });

  it("cleanup unsubscribes handlers on iterator.return() — generator is done after break", async () => {
    const SID = "asr-stream-cleanup";
    const gen = asrStream(SID);

    // Start the generator to register handlers
    const p1 = gen.next();
    // Queue one chunk then trigger end
    window.eatitBridge!.dispatch!({ type: "asr-partial", streamId: SID, payload: { text: "first", definite: false } });

    const chunks: ASRStreamChunk[] = [];
    const r1 = await p1;
    if (!r1.done) {
      chunks.push(r1.value);
    }
    // Break immediately after first item — triggers iterator.return() and finally cleanup
    // (we already consumed it via p1, so we just verify the generator is done)
    await gen.return(undefined); // explicit return to ensure cleanup

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ type: "partial", text: "first" });

    // Generator should be done — next() returns {done: true}
    const next = await gen.next();
    expect(next.done).toBe(true);
  });
});

// MARK: - useASRStream coordinator (M2.8.dev.e)

describe("useASRStream", () => {
  const STREAM_UUID = "c2dddc99-1234-5678-ab12-9cc0ce491baa";

  // Drain the microtask queue fully — needed because useASRStream awaits asrStart + audio.start
  // (two bridge.call round-trips) before the inner asrStream generator registers its handlers.
  const drainMicrotasks = () => new Promise<void>((r) => setTimeout(r, 0));

  beforeEach(() => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(STREAM_UUID as ReturnType<typeof crypto.randomUUID>);
    (window as unknown as Record<string, unknown>).webkit = {
      messageHandlers: {
        eatit: { postMessage: vi.fn() },
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls asr.start then audio.start in correct order (asr before audio)", async () => {
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    // asr.start resolves OK
    mockPost.mockResolvedValueOnce({ id: STREAM_UUID, ok: true, data: { streamId: STREAM_UUID, started: true } });
    // audio.start resolves OK
    mockPost.mockResolvedValueOnce({ id: STREAM_UUID, ok: true, data: undefined });
    // remaining calls (audio.stop, asr.stop cleanup)
    mockPost.mockResolvedValue({ id: STREAM_UUID, ok: true, data: { stopped: true } });

    const gen = useASRStream();

    // Start the generator — it will execute asrStart → audio.start → register asrStream handlers
    const p1 = gen.next();
    // Drain macrotask to let asrStart + audio.start awaits complete and asrStream handlers register
    await drainMicrotasks();

    // Dispatch asr-end to let the generator exit gracefully (handlers are now registered)
    window.eatitBridge!.dispatch!({ type: "asr-end", streamId: STREAM_UUID, payload: { reason: "client-stop" } });

    await p1;
    for await (const _ of gen) { /* drain remaining */ }
    await drainMicrotasks(); // allow finally cleanup to settle

    const callMethods = mockPost.mock.calls.map((c) => (c[0] as { method: string }).method);
    const asrStartIdx = callMethods.indexOf("asr.start");
    const audioStartIdx = callMethods.indexOf("audio.start");
    expect(asrStartIdx).toBeGreaterThanOrEqual(0);
    expect(audioStartIdx).toBeGreaterThan(asrStartIdx);
  });

  it("cleanup calls audio.stop then asr.stop in correct order (audio before asr)", async () => {
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ id: STREAM_UUID, ok: true, data: { streamId: STREAM_UUID, started: true, stopped: true } });

    const gen = useASRStream();

    const p1 = gen.next();
    await drainMicrotasks();

    // Dispatch asr-end — triggers finally block with audio.stop → asr.stop
    window.eatitBridge!.dispatch!({ type: "asr-end", streamId: STREAM_UUID, payload: { reason: "client-stop" } });
    await p1;
    for await (const _ of gen) { /* drain */ }
    await drainMicrotasks(); // allow finally cleanup (audio.stop + asr.stop) to settle

    const callMethods = mockPost.mock.calls.map((c) => (c[0] as { method: string }).method);
    const audioStopIdx = callMethods.lastIndexOf("audio.stop");
    const asrStopIdx = callMethods.lastIndexOf("asr.stop");
    expect(audioStopIdx).toBeGreaterThanOrEqual(0);
    expect(asrStopIdx).toBeGreaterThan(audioStopIdx);
  });

  it("audio.start failure rolls back: invokes asrStop, then propagates audio error", async () => {
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    // asr.start succeeds
    mockPost.mockResolvedValueOnce({ id: STREAM_UUID, ok: true, data: { streamId: STREAM_UUID, started: true } });
    // audio.start fails
    mockPost.mockResolvedValueOnce({
      id: STREAM_UUID,
      ok: false,
      error: { code: "audio.permission-denied", message: "mic denied" },
    });
    // asr.stop (rollback) succeeds
    mockPost.mockResolvedValue({ id: STREAM_UUID, ok: true, data: { stopped: true } });

    const gen = useASRStream();
    const err = await gen.next().catch((e) => e);
    await drainMicrotasks(); // allow rollback asrStop to settle

    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("audio.permission-denied");

    const callMethods = mockPost.mock.calls.map((c) => (c[0] as { method: string }).method);
    expect(callMethods).toContain("asr.start");
    expect(callMethods).toContain("audio.start");
    expect(callMethods).toContain("asr.stop");
    // audio.stop should NOT be called (audio never started successfully)
    expect(callMethods).not.toContain("audio.stop");
  });

  it("propagates partial/final chunks dispatched with the generated streamId", async () => {
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ id: STREAM_UUID, ok: true, data: { streamId: STREAM_UUID, started: true, stopped: true } });

    const gen = useASRStream();

    const p1 = gen.next();
    // Allow asrStart + audio.start to complete and inner asrStream handlers to register
    await drainMicrotasks();

    // Dispatch using the UUID that crypto.randomUUID() returns (deterministic via spy)
    window.eatitBridge!.dispatch!({ type: "asr-partial", streamId: STREAM_UUID, payload: { text: "world", definite: false } });
    window.eatitBridge!.dispatch!({ type: "asr-final", streamId: STREAM_UUID, payload: { text: "hello world", definite: true } });
    window.eatitBridge!.dispatch!({ type: "asr-end", streamId: STREAM_UUID, payload: { reason: "client-stop" } });

    const chunks: ASRStreamChunk[] = [];
    const r1 = await p1;
    if (!r1.done) chunks.push(r1.value);
    for await (const chunk of gen) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ type: "partial", text: "world" });
    expect(chunks[1]).toMatchObject({ type: "final", text: "hello world" });
  });
});
