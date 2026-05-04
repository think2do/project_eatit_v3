import { z } from "zod";
import { bridge } from "./nativeBridge";
import type { ChatCompletionRequest } from "./llmTypes";
import { UsageSchema, ToolCallSchema } from "./llmTypes";

// §B9 dual-end contract: LLMChatResult camelCase matches Swift struct LLMChatResult Codable.
// §C3: Authorization / apiKey NEVER appear here — injected only in Swift LLMGateway.
// §K #6 反模式: rejected — this file never touches ark-api-key or Authorization header.

// MARK: - LLMChatResult schema (Bridge boundary result, camelCase per §7)

export const LLMChatResultSchema = z.object({
  content: z.string().nullable().optional(),
  toolCalls: z.array(ToolCallSchema).optional(),
  finishReason: z.string(),
  usage: UsageSchema.optional(),
});
export type LLMChatResult = z.infer<typeof LLMChatResultSchema>;

// MARK: - Stream event payload schemas (§7.3)
// §K #6: only these three shapes are allowed in BridgeEvent payload — no PCM/PII/key.

export const StreamChunkPayloadSchema = z.object({
  content: z.string(),
  // toolCallDelta is deferred to M3.x function-calling phase
});
export type StreamChunkPayload = z.infer<typeof StreamChunkPayloadSchema>;

export const StreamEndPayloadSchema = z.object({
  finishReason: z.enum(["stop", "length", "tool_calls", "content_filter", "eof"]),
  usage: UsageSchema.optional(),
});
export type StreamEndPayload = z.infer<typeof StreamEndPayloadSchema>;

export const StreamErrorPayloadSchema = z.object({
  code: z.string(),    // BridgeError code, e.g. "llm.stream-cancelled"
  message: z.string(),
});
export type StreamErrorPayload = z.infer<typeof StreamErrorPayloadSchema>;

// MARK: - llm.chat (sync, Bridge method wrapper)

/**
 * Synchronous LLM chat. Calls `llm.chat` Bridge method.
 *
 * Throws BridgeError on:
 *   llm.api-key-missing / llm.api-key-invalid / llm.host-not-allowed /
 *   llm.rate-limited / llm.params-invalid / llm.http-4xx /
 *   llm.http-5xx-retry-exhausted / llm.network-error / llm.decode-failed
 *
 * §C3: params must NOT include apiKey field — Authorization is injected Swift-side.
 * §A0.4: Swift LLMGateway reads Keychain internally; key never crosses Bridge.
 */
export async function llmChat(
  params: ChatCompletionRequest
): Promise<LLMChatResult> {
  return bridge.call<LLMChatResult>("llm.chat", params);
}

// MARK: - llm.chatStream (SSE, Bridge method wrapper — M2.7.dev.c)

/**
 * Start a streaming LLM chat. Returns the streamId after the stream is registered.
 * Swift side pushes stream-chunk / stream-end / stream-error BridgeEvents.
 *
 * §C3: params must NOT include apiKey field.
 * §A0.4: Swift LLMGateway injects Authorization internally.
 * Deferred to M2.7.dev.d: Vercel AI SDK / createDataStream adapter / real ARK call.
 */
export async function llmChatStream(
  params: Omit<ChatCompletionRequest, "stream"> & { streamId?: string }
): Promise<{ streamId: string; started: boolean }> {
  const streamId = params.streamId ?? crypto.randomUUID();
  return bridge.call<{ streamId: string; started: boolean }>("llm.chatStream", {
    ...params,
    streamId,
    stream: true,
  });
}

// MARK: - llm.stopStream (Bridge method wrapper — M2.7.dev.c)

/**
 * Cancel an active stream by streamId.
 * Swift emits stream-error(code: "llm.stream-cancelled") after task.cancel().
 */
export async function llmStopStream(
  streamId: string
): Promise<{ stopped: boolean }> {
  return bridge.call<{ stopped: boolean }>("llm.stopStream", { streamId });
}
