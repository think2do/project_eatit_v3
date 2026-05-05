/**
 * infra/llm.expanded — M5.2.c
 *
 * Augments services/__tests__/llm.test.ts with boundary and error-path tests
 * NOT already covered (the original has ~30 tests across 4 describe blocks).
 *
 * Added boundary/error cases:
 *   - llmChat propagates llm.host-not-allowed BridgeError
 *   - llmChat propagates llm.network-error BridgeError
 *   - llmChat propagates llm.params-invalid BridgeError
 *   - llmChatStream propagates BridgeError on ok=false
 *   - llmStopStream propagates BridgeError on ok=false
 *   - LLMChatResultSchema: usage all-zero values accepted
 *   - LLMChatResultSchema: toolCalls empty array accepted
 *   - LLMChatResultSchema: finishReason 'length' accepted
 *   - LLMChatResultSchema: finishReason 'content_filter' accepted
 *   - LLMChatResultSchema: usage prompt_tokens negative rejected
 *   - ChatCompletionRequestSchema: max_tokens=0 rejected (positive constraint)
 *   - ChatCompletionRequestSchema: stream=true accepted
 *   - §C3 contract: llm module has no apiKey or Authorization property
 *
 * §A0: no Tauri.
 * §C3: no apiKey or Authorization in any test payload.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import {
  llmChat,
  llmChatStream,
  llmStopStream,
  LLMChatResultSchema,
  StreamEndPayloadSchema,
} from "../../services/llm";
import {
  ChatCompletionRequestSchema,
  UsageSchema,
} from "../../services/llmTypes";
import { BridgeError } from "../../services/nativeBridge";

const UUID = "a1eebc99-9c0b-4ef8-bb6d-6bb9bd380b22";

const MINIMAL_PARAMS = {
  model: "doubao-seed-1-6-250615",
  messages: [{ role: "user" as const, content: "hello" }],
  stream: false as const,
};

describe("infra/llm.expanded — llmChat BridgeError codes", () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).webkit = {
      messageHandlers: { eatit: { postMessage: vi.fn() } },
    };
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("llmChat propagates llm.host-not-allowed BridgeError", async () => {
    (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>)
      .mockResolvedValue({
        id: UUID,
        ok: false,
        error: { code: "llm.host-not-allowed", message: "hostname blocked" },
      });

    const err = await llmChat(MINIMAL_PARAMS).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("llm.host-not-allowed");
  });

  it("llmChat propagates llm.network-error BridgeError", async () => {
    (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>)
      .mockResolvedValue({
        id: UUID,
        ok: false,
        error: { code: "llm.network-error", message: "URLSessionError: -1009" },
      });

    const err = await llmChat(MINIMAL_PARAMS).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("llm.network-error");
  });

  it("llmChat propagates llm.params-invalid BridgeError", async () => {
    (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>)
      .mockResolvedValue({
        id: UUID,
        ok: false,
        error: { code: "llm.params-invalid", message: "model field required" },
      });

    const err = await llmChat(MINIMAL_PARAMS).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("llm.params-invalid");
  });

  it("llmChatStream propagates BridgeError on ok=false (llm.api-key-missing)", async () => {
    (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>)
      .mockResolvedValue({
        id: UUID,
        ok: false,
        error: { code: "llm.api-key-missing", message: "ark-api-key not set" },
      });

    const err = await llmChatStream(MINIMAL_PARAMS).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("llm.api-key-missing");
  });

  it("llmStopStream propagates BridgeError on ok=false (llm.stream-not-found)", async () => {
    (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>)
      .mockResolvedValue({
        id: UUID,
        ok: false,
        error: { code: "llm.stream-not-found", message: "no stream with id 'gone'" },
      });

    const err = await llmStopStream("gone").catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("llm.stream-not-found");
  });
});

describe("infra/llm.expanded — LLMChatResultSchema edge cases", () => {
  it("usage all-zero tokens accepted", () => {
    const data = {
      content: "ok",
      finishReason: "stop",
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
    const parsed = LLMChatResultSchema.parse(data);
    expect(parsed.usage?.total_tokens).toBe(0);
  });

  it("toolCalls empty array accepted", () => {
    const data = { content: "ok", finishReason: "stop", toolCalls: [] };
    const parsed = LLMChatResultSchema.parse(data);
    expect(parsed.toolCalls).toHaveLength(0);
  });

  it("finishReason 'length' accepted (token limit hit)", () => {
    const data = { content: "truncated...", finishReason: "length" };
    const parsed = LLMChatResultSchema.parse(data);
    expect(parsed.finishReason).toBe("length");
  });

  it("finishReason 'content_filter' accepted (safety filter)", () => {
    const data = { content: null, finishReason: "content_filter" };
    const parsed = LLMChatResultSchema.parse(data);
    expect(parsed.finishReason).toBe("content_filter");
  });

  it("finishReason 'tool_calls' accepted (function-calling leg)", () => {
    const data = {
      content: null,
      finishReason: "tool_calls",
      toolCalls: [{ id: "c1", type: "function", function: { name: "search", arguments: "{}" } }],
    };
    const parsed = LLMChatResultSchema.parse(data);
    expect(parsed.finishReason).toBe("tool_calls");
  });

  it("UsageSchema rejects negative prompt_tokens", () => {
    expect(() =>
      UsageSchema.parse({ prompt_tokens: -1, completion_tokens: 0, total_tokens: 0 })
    ).toThrow(z.ZodError);
  });

  it("UsageSchema rejects float completion_tokens", () => {
    expect(() =>
      UsageSchema.parse({ prompt_tokens: 5, completion_tokens: 3.2, total_tokens: 8 })
    ).toThrow(z.ZodError);
  });

  it("StreamEndPayloadSchema all 5 finishReason values accepted", () => {
    const reasons = ["stop", "length", "tool_calls", "content_filter", "eof"] as const;
    for (const finishReason of reasons) {
      expect(() => StreamEndPayloadSchema.parse({ finishReason })).not.toThrow();
    }
  });
});

describe("infra/llm.expanded — ChatCompletionRequestSchema boundaries", () => {
  it("max_tokens=0 rejected (must be positive)", () => {
    const data = { ...MINIMAL_PARAMS, max_tokens: 0 };
    expect(() => ChatCompletionRequestSchema.parse(data)).toThrow(z.ZodError);
  });

  it("max_tokens=1 accepted (minimum positive)", () => {
    const data = { ...MINIMAL_PARAMS, max_tokens: 1 };
    expect(() => ChatCompletionRequestSchema.parse(data)).not.toThrow();
  });

  it("max_tokens as float rejected (must be integer)", () => {
    const data = { ...MINIMAL_PARAMS, max_tokens: 100.5 };
    expect(() => ChatCompletionRequestSchema.parse(data)).toThrow(z.ZodError);
  });

  it("stream=true accepted (streaming mode)", () => {
    const data = { ...MINIMAL_PARAMS, stream: true };
    const parsed = ChatCompletionRequestSchema.parse(data);
    expect(parsed.stream).toBe(true);
  });

  it("model is required — missing model throws ZodError", () => {
    const { model: _m, ...noModel } = MINIMAL_PARAMS;
    expect(() => ChatCompletionRequestSchema.parse(noModel)).toThrow(z.ZodError);
  });

  it("§C3 contract: llm module has no apiKey or Authorization property", async () => {
    const mod = await import("../../services/llm");
    expect((mod as Record<string, unknown>).apiKey).toBeUndefined();
    expect((mod as Record<string, unknown>).Authorization).toBeUndefined();
    expect((mod as Record<string, unknown>).getApiKey).toBeUndefined();
  });
});
