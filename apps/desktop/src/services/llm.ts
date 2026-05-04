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

// chatStream / stopStream: out of scope for M2.7.dev.b — see M2.7.dev.c
