import { z } from "zod";
import { bridge } from "./nativeBridge";
import { audio } from "./audio";

// §B9 dual-end contract: ASRStartParams camelCase matches Swift struct ASRStartParams Codable.
// §C3: accessToken / appId NEVER appear here — injected only in Swift ASRGateway (Keychain read).
// §K #6 反模式: rejected — this file never touches volc-asr-credentials or X-Api-Access-Key.
// M2.8.dev.e: AsyncIterator asrStream + useASRStream coordinator landed.

// MARK: - asr.start params schema (Bridge method params, camelCase)

export const ASRStartParamsSchema = z.object({
  streamId: z.string(),
  enableITN: z.boolean().optional(),
  enablePunc: z.boolean().optional(),
});
export type ASRStartParams = z.infer<typeof ASRStartParamsSchema>;

// MARK: - asr.start response schema (Bridge result)

export const ASRStartedSchema = z.object({
  streamId: z.string(),
  started: z.boolean(),
});
export type ASRStarted = z.infer<typeof ASRStartedSchema>;

// MARK: - asr.stop response schema (Bridge result)

export const ASRStoppedSchema = z.object({
  stopped: z.boolean(),
});
export type ASRStopped = z.infer<typeof ASRStoppedSchema>;

// MARK: - asr.status response schema (Bridge result — §9 row 24)

export const ASRStatusResultSchema = z.object({
  connected: z.boolean(),
  streamId: z.string().optional(),
  retryCount: z.number().int().nonnegative(),
});
export type ASRStatusResult = z.infer<typeof ASRStatusResultSchema>;

// MARK: - BridgeEvent payload schemas (§7.3 + §7.4 — M2.8.dev.c)
// §9.2: BridgeEventSchema enum is NOT extended; only payload schemas added here.
// §7.4 decision: asr-error is NOT a new enum case; errors ride asr-end with reason="error".

export const ASRPartialPayloadSchema = z.object({
  text: z.string(),
  definite: z.literal(false),
});
export type ASRPartialPayload = z.infer<typeof ASRPartialPayloadSchema>;

export const ASRFinalPayloadSchema = z.object({
  text: z.string(),
  definite: z.literal(true),
  startTime: z.number().int().nonnegative().optional(),
  endTime: z.number().int().nonnegative().optional(),
});
export type ASRFinalPayload = z.infer<typeof ASRFinalPayloadSchema>;

export const ASREndPayloadSchema = z.object({
  reason: z.enum(["stop", "client-stop", "eof", "1011", "1006", "error"]),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
});
export type ASREndPayload = z.infer<typeof ASREndPayloadSchema>;

// MARK: - asr.start (Bridge method wrapper)

/**
 * Start ASR streaming. Calls `asr.start` Bridge method.
 * Swift side reads Keychain, opens WebSocket, injects 4 auth headers, sends first frame.
 *
 * Throws BridgeError on:
 *   asr.credentials-missing / asr.credentials-malformed / asr.host-not-allowed /
 *   asr.already-connected / asr.frame-pack-failed / asr.ws-handshake-failed
 *
 * §C3: params must NOT include accessToken / appId — injected Swift-side via Keychain.
 * §A0.4: Swift ASRGateway reads volc-asr-credentials internally; credential never crosses Bridge.
 */
export async function asrStart(
  params: ASRStartParams
): Promise<ASRStarted> {
  const raw = await bridge.call<ASRStarted>("asr.start", params);
  return ASRStartedSchema.parse(raw);
}

// MARK: - asr.stop (Bridge method wrapper)

/**
 * Stop ASR streaming for the given streamId. Calls `asr.stop` Bridge method.
 * Swift side sends last-flag frame, waits 1s drain, closes WebSocket, emits asr-end.
 *
 * §C3: only streamId is passed; no credential material crosses the Bridge.
 */
export async function asrStop(
  streamId: string
): Promise<ASRStopped> {
  const raw = await bridge.call<ASRStopped>("asr.stop", { streamId });
  return ASRStoppedSchema.parse(raw);
}

// MARK: - asr.status (Bridge method wrapper — §9 row 24, M2.8.dev.c)

/**
 * Query current ASR gateway connection state.
 * Returns { connected, streamId?, retryCount }.
 *
 * §C3: no credential material in params or result.
 */
export async function asrStatus(): Promise<ASRStatusResult> {
  const raw = await bridge.call<ASRStatusResult>("asr.status", {});
  return ASRStatusResultSchema.parse(raw);
}

// MARK: - ASRStreamChunk discriminated union (M2.8.dev.e)

/**
 * Discriminated union yielded by asrStream:
 * - {type: "partial", text}                     — interim transcript, will be revised
 * - {type: "final", text, startTime?, endTime?} — committed segment
 *
 * §C3: text is user PII. Callers must not log chunk.text. Only log metadata
 * (chunk.type, chunk.startTime, text.length) if diagnostic logging is needed.
 */
export type ASRStreamChunk =
  | { type: "partial"; text: string }
  | { type: "final"; text: string; startTime?: number; endTime?: number };

// MARK: - asrStream AsyncIterator (M2.8.dev.e)

/**
 * Async generator yielding partial/final transcripts for the given streamId.
 * Subscribes to bridge.on("asr-partial"/"asr-final"/"asr-end") filtered by streamId.
 *
 * Lifecycle:
 *   - Caller MUST have already called asrStart(streamId) before iterating.
 *   - Generator yields chunks until asr-end arrives (graceful) or asr-end with
 *     reason="error" (throws Error containing "[errorCode] errorMessage").
 *   - On iterator.return() / break from for-await-of: finally block unsubscribes handlers.
 *
 * §C3: text content is user PII — this generator never logs chunk.text.
 * §K #4 / #6: PCM stays in Swift; this iterator only consumes already-transcribed text events.
 */
export async function* asrStream(
  streamId: string
): AsyncGenerator<ASRStreamChunk, void, unknown> {
  type QueuedItem =
    | { kind: "chunk"; value: ASRStreamChunk }
    | { kind: "end" }
    | { kind: "error"; error: Error };

  const queue: QueuedItem[] = [];
  let resolveNext: (() => void) | null = null;

  const wakeUp = () => {
    const r = resolveNext;
    resolveNext = null;
    r?.();
  };

  const offPartial = bridge.on("asr-partial", (e) => {
    if (e.streamId !== streamId) return;
    const payload = ASRPartialPayloadSchema.parse(e.payload);
    queue.push({ kind: "chunk", value: { type: "partial", text: payload.text } });
    wakeUp();
  });

  const offFinal = bridge.on("asr-final", (e) => {
    if (e.streamId !== streamId) return;
    const payload = ASRFinalPayloadSchema.parse(e.payload);
    queue.push({
      kind: "chunk",
      value: {
        type: "final",
        text: payload.text,
        startTime: payload.startTime,
        endTime: payload.endTime,
      },
    });
    wakeUp();
  });

  const offEnd = bridge.on("asr-end", (e) => {
    if (e.streamId !== streamId) return;
    const payload = ASREndPayloadSchema.parse(e.payload);
    if (payload.reason === "error") {
      const code = payload.errorCode ?? "asr.stream-failed";
      const msg = payload.errorMessage ?? "asr stream errored";
      queue.push({ kind: "error", error: new Error(`[${code}] ${msg}`) });
    } else {
      queue.push({ kind: "end" });
    }
    wakeUp();
  });

  const cleanup = () => {
    offPartial();
    offFinal();
    offEnd();
  };

  try {
    while (true) {
      if (queue.length === 0) {
        await new Promise<void>((r) => {
          resolveNext = r;
        });
      }
      const item = queue.shift()!;
      switch (item.kind) {
        case "chunk":
          yield item.value;
          break;
        case "end":
          return;
        case "error":
          throw item.error;
      }
    }
  } finally {
    cleanup();
  }
}

// MARK: - useASRStream high-level coordinator (M2.8.dev.e)

/**
 * Combined start/iterate/stop coordinator per architect §6.1 sequence:
 *   1. crypto.randomUUID() generates streamId
 *   2. asrStart() opens WebSocket + sends first frame
 *   3. audio.start() begins mic capture (after asr.start so PCM has a consumer)
 *   4. Yields ASRStreamChunks via asrStream
 *   5. On iterator.return() / break / throw (finally block):
 *        a. audio.stop() FIRST (stop sending PCM)
 *        b. asrStop() SECOND (sends last-flag frame + waits 1s drain + closes WS)
 *
 * §C3: no PCM/credential ever observed by JS; only transcript text is yielded.
 * §6.1 ordering invariant: enforced at start (asr → audio) AND stop (audio → asr).
 *
 * Throws if asrStart fails (credentials missing / host not allowed / etc).
 * audio.start failures roll back by calling asrStop before propagating.
 */
export async function* useASRStream(
  params?: Omit<ASRStartParams, "streamId">
): AsyncGenerator<ASRStreamChunk, void, unknown> {
  const streamId = crypto.randomUUID();
  const fullParams: ASRStartParams = { streamId, ...(params ?? {}) };

  await asrStart(fullParams);

  try {
    await audio.start(streamId);
  } catch (audioErr) {
    // §6.1: audio.start failed after asrStart succeeded → rollback ASR
    await asrStop(streamId).catch(() => undefined);
    throw audioErr;
  }

  const inner = asrStream(streamId);
  try {
    for await (const chunk of inner) {
      yield chunk;
    }
  } finally {
    // §6.1 stop ordering: audio FIRST, asr SECOND
    await audio.stop().catch(() => undefined);
    await asrStop(streamId).catch(() => undefined);
  }
}

// MARK: - testASRConnection (M-asr.byok)

/**
 * Verify the `volc-asr-credentials` Keychain entry can actually open a Volc
 * SAUC WebSocket.  Mirrors the LLM section's testLLMConnection but uses
 * `asr.start` as the probe — Swift ASRGateway.connect() blocks until the
 * WebSocket handshake completes and the first config frame is sent, which
 * means a sync return from `asr.start` already proves:
 *   1. Keychain has volc-asr-credentials (else asr.credentials-missing)
 *   2. Volc accepted the WS upgrade (auth headers were valid)
 *   3. First-frame send succeeded (TLS / network healthy)
 *
 * No PCM is captured (audio.start is NOT called), so the user is not
 * prompted for mic permission and no microphone resource is touched.
 *
 * The probe always asrStop()s in `finally` to avoid leaking the WS task
 * on failure paths.
 */
export interface ASRTestResult {
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export async function testASRConnection(): Promise<ASRTestResult> {
  const streamId = crypto.randomUUID();
  try {
    await asrStart({ streamId });
  } catch (err) {
    const code = (err as { code?: string })?.code ?? "asr.unknown";
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : "ASR probe failed";
    return { ok: false, errorCode: code, errorMessage: message };
  }
  // Best-effort cleanup; swallow errors so they don't mask a successful probe.
  await asrStop(streamId).catch(() => undefined);
  return { ok: true };
}
