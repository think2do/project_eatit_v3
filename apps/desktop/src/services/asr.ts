import { z } from "zod";
import { bridge } from "./nativeBridge";

// §B9 dual-end contract: ASRStartParams camelCase matches Swift struct ASRStartParams Codable.
// §C3: accessToken / appId NEVER appear here — injected only in Swift ASRGateway (Keychain read).
// §K #6 反模式: rejected — this file never touches volc-asr-credentials or X-Api-Access-Key.
// Note: AsyncIterator (asr-partial/final/end event consumption) deferred to M2.8.dev.e.
// Note: asr.status Bridge method deferred to M2.8.dev.c.

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
 * Swift side cancels the WebSocket task and clears state.
 *
 * §C3: only streamId is passed; no credential material crosses the Bridge.
 */
export async function asrStop(
  streamId: string
): Promise<ASRStopped> {
  const raw = await bridge.call<ASRStopped>("asr.stop", { streamId });
  return ASRStoppedSchema.parse(raw);
}

// Note: asrStatus deferred to M2.8.dev.c (depends on receive loop + state machine).
// Note: event payload schemas (ASRPartialPayloadSchema / ASRFinalPayloadSchema / ASREndPayloadSchema)
// deferred to M2.8.dev.c when partial/final dispatch lands.
// Note: AsyncIterator / useASRStream hook deferred to M2.8.dev.e.
