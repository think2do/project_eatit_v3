import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { llmChat, LLMChatResultSchema } from "../llm";
import { BridgeError } from "../nativeBridge";

const UUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

const MINIMAL_PARAMS = {
  model: "doubao-seed-1-6-250615",
  messages: [{ role: "user" as const, content: "hello" }],
  stream: false as const,
};

const MOCK_RESULT = {
  content: "Hi there!",
  toolCalls: undefined,
  finishReason: "stop",
  usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
};

describe("llm service", () => {
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

  // MARK: - §10.2 Case 1: happy path

  it("llmChat happy path — bridge.call invoked once, result transparent", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
    const postMessageMock = (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    );
    postMessageMock.mockResolvedValue({
      id: UUID,
      ok: true,
      data: MOCK_RESULT,
    });

    const result = await llmChat(MINIMAL_PARAMS);

    expect(postMessageMock).toHaveBeenCalledOnce();
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "llm.chat",
        params: MINIMAL_PARAMS,
      })
    );
    expect(result).toEqual(MOCK_RESULT);
  });

  // MARK: - §10.2 Case 2: BridgeError propagated

  it("llmChat propagates BridgeError — same code re-thrown", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: UUID,
      ok: false,
      error: { code: "llm.api-key-missing", message: "ark-api-key not configured" },
    });

    const err = await llmChat(MINIMAL_PARAMS).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("llm.api-key-missing");
  });

  // MARK: - Contract checks

  it("LLMChatResultSchema validates camelCase output (content/finishReason/usage)", () => {
    const data = {
      content: "answer",
      finishReason: "stop",
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    };
    const parsed = LLMChatResultSchema.parse(data);
    expect(parsed.content).toBe("answer");
    expect(parsed.finishReason).toBe("stop");
    expect(parsed.usage?.total_tokens).toBe(3);
  });

  it("LLMChatResultSchema accepts null content (tool-call leg)", () => {
    const data = {
      content: null,
      finishReason: "tool_calls",
      toolCalls: [
        { id: "c1", type: "function", function: { name: "search", arguments: "{}" } },
      ],
    };
    const parsed = LLMChatResultSchema.parse(data);
    expect(parsed.content).toBeNull();
    expect(parsed.toolCalls).toHaveLength(1);
  });

  it("LLMChatResultSchema rejects missing finishReason", () => {
    const data = { content: "hi" };
    expect(() => LLMChatResultSchema.parse(data)).toThrow(z.ZodError);
  });

  it("§C scope check: llmChat is exported, chatStream and stopStream are NOT exported from llm.ts", async () => {
    const mod = await import("../llm");
    expect(typeof mod.llmChat).toBe("function");
    // chatStream belongs to M2.7.dev.c — must not be present yet
    expect((mod as Record<string, unknown>).llmChatStream).toBeUndefined();
    expect((mod as Record<string, unknown>).llmStopStream).toBeUndefined();
  });

  it("llmChat propagates BridgeError for llm.api-key-invalid (401 upstream)", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: UUID,
      ok: false,
      error: { code: "llm.api-key-invalid", message: "401 auth failed" },
    });

    const err = await llmChat(MINIMAL_PARAMS).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("llm.api-key-invalid");
  });

  it("llmChat propagates BridgeError for llm.http-5xx-retry-exhausted", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: UUID,
      ok: false,
      error: { code: "llm.http-5xx-retry-exhausted", message: "500 retry exhausted" },
    });

    const err = await llmChat(MINIMAL_PARAMS).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("llm.http-5xx-retry-exhausted");
  });
});
