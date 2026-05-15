import { z } from "zod";
import { bridge } from "../../services/nativeBridge";
import { llmChat, llmChatStream } from "../../services/llm";
import {
  StreamChunkPayloadSchema,
  StreamEndPayloadSchema,
  StreamErrorPayloadSchema,
} from "../../services/llm";
import type { BridgeEvent } from "../../services/nativeBridge";
import type { LLMProvider, ChatRequest, ChatResponse, ChatChunk, Message } from "./types";
import { generateObjectWithRetry } from "./instructor";

// §C3 / §K #6: ArkProvider never calls bridge.call("keychain.read") or any secret-retrieval.
// ARK_API_KEY stays in Swift LLMGateway Keychain; bridge.call("llm.chat") is the only crossing.
// §K #4: no fetch() / XMLHttpRequest to ARK — only Bridge calls.
// §A0.3: host whitelist enforced Swift-side; this class makes no direct network requests.

export interface ArkProviderOptions {
  defaultModel?: string;
}

/**
 * ArkProvider — concrete LLMProvider implementation via Swift Bridge.
 *
 * Routes all LLM traffic through the Bridge (window.webkit.messageHandlers.eatit),
 * which forwards to Swift LLMGateway. The Gateway injects the ARK API key from
 * Keychain and makes the actual URLSession call to 火山 ARK.
 *
 * §C3: Authorization header is injected Swift-side; this class never sees the key.
 */
export class ArkProvider implements LLMProvider {
  private readonly defaultModel: string;

  constructor(options: ArkProviderOptions = {}) {
    this.defaultModel = options.defaultModel ?? "doubao-seed-2-0-lite-260215";
  }

  /**
   * Synchronous chat completion. Wraps llmChat() from services/llm.ts.
   * Throws BridgeError on network/auth/rate-limit failures.
   */
  async chat(req: ChatRequest): Promise<ChatResponse> {
    return llmChat({
      ...req,
      model: req.model ?? this.defaultModel,
      stream: false,
    });
  }

  /**
   * Streaming chat via Bridge BridgeEvents.
   *
   * Pattern mirrors asrStream() in services/asr.ts (M2.8.dev.e):
   *   - queue + wakeUp promise for backpressure-safe async generator
   *   - finally block unsubscribes all handlers on return/break/throw
   *   - Filters events by streamId (ignores other concurrent streams)
   *
   * Yields:
   *   - {content: string}          on stream-chunk
   *   - {finishReason: string}     on stream-end (final yield before generator returns)
   * Throws:
   *   - Error("[code] message")    on stream-error
   */
  async *chatStream(req: ChatRequest): AsyncIterableIterator<ChatChunk> {
    const { streamId } = await llmChatStream({
      ...req,
      model: req.model ?? this.defaultModel,
    });

    type QueuedItem =
      | { kind: "chunk"; value: ChatChunk }
      | { kind: "end"; value: ChatChunk }
      | { kind: "error"; error: Error };

    const queue: QueuedItem[] = [];
    let resolveNext: (() => void) | null = null;

    const wakeUp = () => {
      const r = resolveNext;
      resolveNext = null;
      r?.();
    };

    const offChunk = bridge.on("stream-chunk", (e: BridgeEvent) => {
      if (e.streamId !== streamId) return;
      const payload = StreamChunkPayloadSchema.parse(e.payload);
      queue.push({ kind: "chunk", value: { content: payload.content } });
      wakeUp();
    });

    const offEnd = bridge.on("stream-end", (e: BridgeEvent) => {
      if (e.streamId !== streamId) return;
      const payload = StreamEndPayloadSchema.parse(e.payload);
      queue.push({ kind: "end", value: { finishReason: payload.finishReason } });
      wakeUp();
    });

    const offError = bridge.on("stream-error", (e: BridgeEvent) => {
      if (e.streamId !== streamId) return;
      const payload = StreamErrorPayloadSchema.parse(e.payload);
      queue.push({ kind: "error", error: new Error(`[${payload.code}] ${payload.message}`) });
      wakeUp();
    });

    const cleanup = () => {
      offChunk();
      offEnd();
      offError();
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
            yield item.value;
            return;
          case "error":
            throw item.error;
        }
      }
    } finally {
      cleanup();
    }
  }

  /**
   * Structured output via Instructor-equivalent retry-on-validation-fail.
   * Delegates to generateObjectWithRetry() in instructor.ts.
   */
  async generateObject<T>(req: {
    schema: z.ZodSchema<T>;
    messages: Message[];
    model?: string;
  }): Promise<T> {
    return generateObjectWithRetry(this, {
      schema: req.schema,
      messages: req.messages,
      model: req.model ?? this.defaultModel,
    });
  }
}
