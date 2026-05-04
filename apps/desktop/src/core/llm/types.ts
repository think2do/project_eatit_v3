import { z } from "zod";
import type { ChatCompletionRequest, ChatMessage } from "../../services/llmTypes";
import type { LLMChatResult } from "../../services/llm";

// §C3 / §A0.4: This abstraction layer never touches ARK_API_KEY.
// ARK_API_KEY stays in Swift LLMGateway Keychain; the Bridge call is the only crossing.
// §K #6: getApiKey() or any key-retrieval method is REJECTED at this boundary.

// MARK: - Re-exported type aliases (single source of truth from services/)

/**
 * ChatRequest strips the `stream` field from ChatCompletionRequest.
 * LLMProvider.chat() controls streaming internally; callers do not set `stream`.
 */
export type ChatRequest = Omit<ChatCompletionRequest, "stream">;

/**
 * ChatResponse is the result returned by llm.chat Bridge call.
 * content may be null for tool-call legs (M2.7.dev.a).
 */
export type ChatResponse = LLMChatResult;

/**
 * ChatChunk is yielded by chatStream() — content delta or stream-end marker.
 */
export type ChatChunk =
  | { content: string; finishReason?: undefined }
  | { content?: undefined; finishReason: string };

/**
 * Message is the per-turn message shape used in generateObject params.
 * Alias of ChatMessage from services/llmTypes.ts.
 */
export type Message = ChatMessage;

// MARK: - LLMProvider interface

/**
 * LLMProvider — abstraction boundary between the LangGraph.js / Agent layer
 * and the concrete LLM transport (currently ArkProvider via Swift Bridge).
 *
 * Design rationale:
 *   - Agent code (M3.1.3+) depends only on this interface, never on bridge.call().
 *   - Multi-provider support (OpenAI BYOK, etc.) can be added without touching Agent graphs.
 *   - generateObject() is the Instructor-equivalent: structured output with retry-on-validation.
 *
 * §C3 / §K #6: implementations MUST NOT expose getApiKey() or any secret-retrieval surface.
 * §A0.4: API keys stay in Swift Keychain; Bridge.call() is the only crossing point.
 */
export interface LLMProvider {
  /**
   * Synchronous chat completion via Bridge.
   * Throws BridgeError on network/auth/rate-limit failures.
   */
  chat(req: ChatRequest): Promise<ChatResponse>;

  /**
   * Streaming chat via Bridge BridgeEvents.
   * Yields ChatChunk objects — content deltas until finishReason is emitted.
   * Unsubscribes bridge handlers on iterator.return() / break / throw.
   */
  chatStream(req: ChatRequest): AsyncIterableIterator<ChatChunk>;

  /**
   * Structured output with Instructor-equivalent retry-on-validation-fail.
   * Uses response_format: {type: "json_object"} + Zod safeParse.
   * Retries up to maxAttempts (default 3) by feeding ZodError back as user message.
   */
  generateObject<T>(req: {
    schema: z.ZodSchema<T>;
    messages: Message[];
    model?: string;
  }): Promise<T>;
}
