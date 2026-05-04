import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { ArkProvider } from "../arkProvider";
import { INSTRUCTOR_VALIDATION_ERROR_TEMPLATE } from "../instructor";
import { BridgeError } from "../../../services/nativeBridge";

// MARK: - Test fixtures

const UUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const STREAM_UUID = "b1ffcd00-1d1c-5fg9-cc7e-7cc0ce491b22";

const BASE_MESSAGES = [{ role: "user" as const, content: "What did I eat?" }];

const MOCK_RESULT = {
  content: "I understood your request.",
  finishReason: "stop",
  usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
};

// Small schema for generateObject tests — uses .strict() to catch extra fields
const FoodItemSchema = z
  .object({
    name: z.string(),
    calories: z.number(),
  })
  .strict();
type FoodItem = z.infer<typeof FoodItemSchema>;

// MARK: - Setup helpers

function setupBridgeMock() {
  (window as unknown as Record<string, unknown>).webkit = {
    messageHandlers: {
      eatit: { postMessage: vi.fn() },
    },
  };
  return window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
}

function mockBridgeCallSuccess(postMock: ReturnType<typeof vi.fn>, data: unknown) {
  postMock.mockResolvedValue({ id: UUID, ok: true, data });
}

function mockBridgeCallError(postMock: ReturnType<typeof vi.fn>, code: string, message: string) {
  postMock.mockResolvedValue({ id: UUID, ok: false, error: { code, message } });
}

// MARK: - Test suite

describe("ArkProvider", () => {
  let postMock: ReturnType<typeof vi.fn>;
  let provider: ArkProvider;

  beforeEach(() => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
    postMock = setupBridgeMock();
    provider = new ArkProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // MARK: - Case 1: chat() happy path round-trips bridge.call("llm.chat")

  it("chat() round-trips bridge.call('llm.chat') — request shape passed through, response returned", async () => {
    mockBridgeCallSuccess(postMock, MOCK_RESULT);

    const result = await provider.chat({
      model: "doubao-seed-1-6-250615",
      messages: BASE_MESSAGES,
    });

    expect(postMock).toHaveBeenCalledOnce();
    expect(postMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "llm.chat",
        params: expect.objectContaining({
          model: "doubao-seed-1-6-250615",
          messages: BASE_MESSAGES,
          stream: false,
        }),
      })
    );
    expect(result).toEqual(MOCK_RESULT);
  });

  // MARK: - Case 2: chat() propagates BridgeError on ok=false

  it("chat() throws BridgeError on ok=false — propagated from llmChat", async () => {
    mockBridgeCallError(postMock, "llm.api-key-missing", "ark-api-key not configured");

    const err = await provider
      .chat({ model: "doubao-seed-1-6-250615", messages: BASE_MESSAGES })
      .catch((e) => e);

    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("llm.api-key-missing");
  });

  // MARK: - Case 3: chatStream() happy path — 3 chunks + stream-end terminates

  it("chatStream() yields stream-chunk events filtered by streamId, stream-end terminates", async () => {
    // The generator calls llmChatStream (async Bridge call) before subscribing events.
    // We need to dispatch BridgeEvents only after the Bridge call resolves and the
    // generator has installed its event handlers. Strategy: use a deferred dispatch
    // that fires after the current microtask queue drains via queueMicrotask.
    mockBridgeCallSuccess(postMock, { streamId: STREAM_UUID, started: true });

    const results: import("../types").ChatChunk[] = [];

    // Start iterating — this triggers the internal llmChatStream call
    const iterPromise = (async () => {
      for await (const chunk of provider.chatStream({
        model: "doubao-seed-1-6-250615",
        messages: BASE_MESSAGES,
      })) {
        results.push(chunk);
      }
    })();

    // Yield to microtasks until the Bridge call resolves and handlers are installed
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    // Now dispatch events — handlers are subscribed
    window.eatitBridge!.dispatch!({ type: "stream-chunk", streamId: STREAM_UUID, payload: { content: "Hello" } });
    window.eatitBridge!.dispatch!({ type: "stream-chunk", streamId: STREAM_UUID, payload: { content: " world" } });
    window.eatitBridge!.dispatch!({ type: "stream-chunk", streamId: STREAM_UUID, payload: { content: "!" } });
    window.eatitBridge!.dispatch!({ type: "stream-end", streamId: STREAM_UUID, payload: { finishReason: "stop" } });

    await iterPromise;

    expect(results).toHaveLength(4);
    expect(results[0]).toEqual({ content: "Hello" });
    expect(results[1]).toEqual({ content: " world" });
    expect(results[2]).toEqual({ content: "!" });
    expect(results[3]).toEqual({ finishReason: "stop" });
  });

  // MARK: - Case 4: chatStream() throws on stream-error event

  it("chatStream() throws Error on stream-error event", async () => {
    mockBridgeCallSuccess(postMock, { streamId: STREAM_UUID, started: true });

    const errorPromise = (async () => {
      for await (const _chunk of provider.chatStream({
        model: "doubao-seed-1-6-250615",
        messages: BASE_MESSAGES,
      })) {
        // should not yield
      }
    })().catch((e) => e);

    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    window.eatitBridge!.dispatch!({
      type: "stream-error",
      streamId: STREAM_UUID,
      payload: { code: "llm.stream-cancelled", message: "user cancelled" },
    });

    const err = await errorPromise;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("llm.stream-cancelled");
    expect((err as Error).message).toContain("user cancelled");
  });

  // MARK: - Case 5: chatStream() ignores events for other streamIds

  it("chatStream() ignores events for other streamIds", async () => {
    const OTHER_STREAM = "other-stream-id-xyz";
    mockBridgeCallSuccess(postMock, { streamId: STREAM_UUID, started: true });

    const results: import("../types").ChatChunk[] = [];
    const iterPromise = (async () => {
      for await (const chunk of provider.chatStream({
        model: "doubao-seed-1-6-250615",
        messages: BASE_MESSAGES,
      })) {
        results.push(chunk);
      }
    })();

    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    // Dispatch event for OTHER stream (should be ignored)
    window.eatitBridge!.dispatch!({ type: "stream-chunk", streamId: OTHER_STREAM, payload: { content: "leak" } });
    // Then dispatch for our stream
    window.eatitBridge!.dispatch!({ type: "stream-chunk", streamId: STREAM_UUID, payload: { content: "mine" } });
    window.eatitBridge!.dispatch!({ type: "stream-end", streamId: STREAM_UUID, payload: { finishReason: "stop" } });

    await iterPromise;

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ content: "mine" });
    expect(results.some((r) => "content" in r && r.content === "leak")).toBe(false);
  });

  // MARK: - Case 6: generateObject() happy path — valid JSON returned immediately

  it("generateObject() happy path — returns typed object on first attempt", async () => {
    const validPayload: FoodItem = { name: "Apple", calories: 95 };
    mockBridgeCallSuccess(postMock, {
      content: JSON.stringify(validPayload),
      finishReason: "stop",
    });

    const result = await provider.generateObject({
      schema: FoodItemSchema,
      messages: BASE_MESSAGES,
      model: "doubao-seed-1-6-250615",
    });

    expect(postMock).toHaveBeenCalledOnce();
    expect(result).toEqual(validPayload);
    // Ensure response_format was sent
    expect(postMock).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          response_format: { type: "json_object" },
        }),
      })
    );
  });

  // MARK: - Case 7: ★ SPEC ACCEPTANCE ★ retry-on-validation-fail — 1 failure then success

  it("generateObject() retries on validation-fail — chat called twice, second call has Validation error message, returns valid object", async () => {
    // First response: extra field violates .strict() schema
    const invalidPayload = { name: "Banana", calories: 89, extraField: "bad" };
    // Second response: valid
    const validPayload: FoodItem = { name: "Banana", calories: 89 };

    postMock
      .mockResolvedValueOnce({
        id: UUID,
        ok: true,
        data: { content: JSON.stringify(invalidPayload), finishReason: "stop" },
      })
      .mockResolvedValueOnce({
        id: UUID,
        ok: true,
        data: { content: JSON.stringify(validPayload), finishReason: "stop" },
      });

    const result = await provider.generateObject({
      schema: FoodItemSchema,
      messages: BASE_MESSAGES,
      model: "doubao-seed-1-6-250615",
    });

    // chat called exactly twice
    expect(postMock).toHaveBeenCalledTimes(2);

    // Second call's messages array must include the Validation error user message
    const secondCallParams = postMock.mock.calls[1][0] as {
      params: { messages: Array<{ role: string; content: string }> };
    };
    const secondMessages = secondCallParams.params.messages;
    const validationMsg = secondMessages.find(
      (m) => m.role === "user" && m.content.includes("Validation error:")
    );
    expect(validationMsg).toBeDefined();
    expect(validationMsg!.content).toContain("Validation error:");

    // Final result is the valid object
    expect(result).toEqual(validPayload);
  });

  // MARK: - Case 8: generateObject() throws after 3 failed attempts

  it("generateObject() throws after 3 failed attempts — all calls return invalid JSON", async () => {
    const alwaysInvalid = { name: "Candy", extra: "invalid" };

    postMock.mockResolvedValue({
      id: UUID,
      ok: true,
      data: { content: JSON.stringify(alwaysInvalid), finishReason: "stop" },
    });

    const err = await provider
      .generateObject({
        schema: FoodItemSchema,
        messages: BASE_MESSAGES,
        model: "doubao-seed-1-6-250615",
      })
      .catch((e) => e);

    expect(postMock).toHaveBeenCalledTimes(3);
    expect(err).toBeInstanceOf(Error);
  });

  // MARK: - Case 9: generateObject() handles null content — throws clear error

  it("generateObject() throws clear error when LLM returns null content", async () => {
    mockBridgeCallSuccess(postMock, { content: null, finishReason: "tool_calls" });

    const err = await provider
      .generateObject({
        schema: FoodItemSchema,
        messages: BASE_MESSAGES,
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("LLM returned null content; expected JSON");
    // Should not retry — only one call made
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  // MARK: - Bonus: INSTRUCTOR_VALIDATION_ERROR_TEMPLATE format check

  it("INSTRUCTOR_VALIDATION_ERROR_TEMPLATE contains expected placeholders", () => {
    expect(INSTRUCTOR_VALIDATION_ERROR_TEMPLATE).toContain("{error}");
    expect(INSTRUCTOR_VALIDATION_ERROR_TEMPLATE).toContain("Validation error:");
    expect(INSTRUCTOR_VALIDATION_ERROR_TEMPLATE).toContain("JSON only");
  });

  // MARK: - Bonus: defaultModel is used when no model specified

  it("chat() uses defaultModel when no model provided in request", async () => {
    mockBridgeCallSuccess(postMock, MOCK_RESULT);

    await provider.chat({ messages: BASE_MESSAGES } as import("../types").ChatRequest);

    expect(postMock).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ model: "doubao-seed-1-6-250615" }),
      })
    );
  });

  // MARK: - Bonus: custom defaultModel via constructor option

  it("ArkProvider constructor accepts custom defaultModel", async () => {
    const customProvider = new ArkProvider({ defaultModel: "custom-model-v1" });
    mockBridgeCallSuccess(postMock, MOCK_RESULT);

    await customProvider.chat({ messages: BASE_MESSAGES } as import("../types").ChatRequest);

    expect(postMock).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ model: "custom-model-v1" }),
      })
    );
  });
});
