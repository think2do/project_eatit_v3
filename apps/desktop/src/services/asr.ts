import { z } from "zod";
import { bridge } from "./nativeBridge";

// §B9 dual-end contract: ASRStartParams camelCase matches Swift struct ASRStartParams Codable.
// §C3: accessToken / appId NEVER appear here — injected only in Swift ASRGateway (Keychain read).
// §K #6 反模式: rejected — this file never touches volc-asr-credentials or X-Api-Access-Key.
// Note: AsyncIterator (asr-partial/final/end event consumption) deferred to M2.8.dev.e.
// M2.8.dev.c: asr.status wrapper + payload Zod schemas landed.

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

// Note: AsyncIterator / useASRStream hook deferred to M2.8.dev.e.
