import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import {
  llmChat,
  llmChatStream,
  llmStopStream,
  createDataStream,
  llmChatStreamAsAISDKStream,
  LLMChatResultSchema,
  StreamChunkPayloadSchema,
  StreamEndPayloadSchema,
  StreamErrorPayloadSchema,
} from "../llm";
import { BridgeError, BridgeEventSchema } from "../nativeBridge";

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

  it("§C scope check (M2.7.dev.c): llmChat + llmChatStream + llmStopStream are exported from llm.ts", async () => {
    const mod = await import("../llm");
    expect(typeof mod.llmChat).toBe("function");
    // chatStream and stopStream implemented in M2.7.dev.c
    expect(typeof mod.llmChatStream).toBe("function");
    expect(typeof mod.llmStopStream).toBe("function");
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

  // MARK: - M2.7.dev.c chatStream contract cases

  it("llmChatStream returns {streamId, started} after bridge.call('llm.chatStream') happy path", async () => {
    const streamId = "stream-abc-123";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
    const postMessageMock = (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    );
    postMessageMock.mockResolvedValue({
      id: UUID,
      ok: true,
      data: { streamId, started: true },
    });

    const result = await llmChatStream({ ...MINIMAL_PARAMS, streamId });

    expect(postMessageMock).toHaveBeenCalledOnce();
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "llm.chatStream",
        params: expect.objectContaining({ streamId, stream: true }),
      })
    );
    expect(result.streamId).toBe(streamId);
    expect(result.started).toBe(true);
  });

  it("llmChatStream generates streamId via crypto.randomUUID when none provided", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
    const postMessageMock = (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    );
    postMessageMock.mockResolvedValue({
      id: UUID,
      ok: true,
      data: { streamId: UUID, started: true },
    });

    const result = await llmChatStream(MINIMAL_PARAMS);

    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ streamId: UUID }),
      })
    );
    expect(result.streamId).toBe(UUID);
  });

  it("llmStopStream calls bridge.call('llm.stopStream', {streamId})", async () => {
    const streamId = "stream-to-stop";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
    const postMessageMock = (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    );
    postMessageMock.mockResolvedValue({
      id: UUID,
      ok: true,
      data: { stopped: true },
    });

    const result = await llmStopStream(streamId);

    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "llm.stopStream",
        params: { streamId },
      })
    );
    expect(result.stopped).toBe(true);
  });

  it("StreamChunkPayloadSchema validates {content: string}; rejects missing content", () => {
    expect(StreamChunkPayloadSchema.parse({ content: "hello" })).toEqual({ content: "hello" });
    expect(() => StreamChunkPayloadSchema.parse({})).toThrow(z.ZodError);
    expect(() => StreamChunkPayloadSchema.parse({ content: 42 })).toThrow(z.ZodError);
  });

  it("StreamEndPayloadSchema validates finishReason enum; rejects unknown reason", () => {
    expect(StreamEndPayloadSchema.parse({ finishReason: "stop" })).toMatchObject({ finishReason: "stop" });
    expect(StreamEndPayloadSchema.parse({ finishReason: "eof" })).toMatchObject({ finishReason: "eof" });
    expect(StreamEndPayloadSchema.parse({ finishReason: "length" })).toMatchObject({ finishReason: "length" });
    expect(() => StreamEndPayloadSchema.parse({ finishReason: "unknown-reason" })).toThrow(z.ZodError);
    expect(() => StreamEndPayloadSchema.parse({})).toThrow(z.ZodError);
  });

  it("StreamErrorPayloadSchema validates {code, message}; rejects malformed", () => {
    expect(StreamErrorPayloadSchema.parse({ code: "llm.stream-cancelled", message: "task cancelled" }))
      .toEqual({ code: "llm.stream-cancelled", message: "task cancelled" });
    expect(() => StreamErrorPayloadSchema.parse({ code: "llm.stream-cancelled" })).toThrow(z.ZodError);
    expect(() => StreamErrorPayloadSchema.parse({ message: "no code" })).toThrow(z.ZodError);
  });

  it("BridgeEventSchema enum accepts stream-chunk / stream-end / stream-error; rejects unknown", () => {
    const makeEvent = (type: string) => ({ type, streamId: "s1", payload: {} });
    expect(BridgeEventSchema.parse(makeEvent("stream-chunk"))).toMatchObject({ type: "stream-chunk" });
    expect(BridgeEventSchema.parse(makeEvent("stream-end"))).toMatchObject({ type: "stream-end" });
    expect(BridgeEventSchema.parse(makeEvent("stream-error"))).toMatchObject({ type: "stream-error" });
    expect(() => BridgeEventSchema.parse(makeEvent("stream-unknown"))).toThrow(z.ZodError);
    expect(() => BridgeEventSchema.parse(makeEvent("unknown-type"))).toThrow(z.ZodError);
  });
});

// MARK: - M2.7.dev.d createDataStream adapter tests

describe("createDataStream", () => {
  // The bridge singleton accumulates event handlers in its internal Map.
  // Strategy: each test creates a stream with a unique streamId, reads from it,
  // then either cancels or lets stream-end/stream-error unsubscribe automatically.
  // The bridge's dispatch hook is re-wired at module load (window.eatitBridge.dispatch);
  // we re-establish window.webkit before each test so bridge.call works for cancel path.

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

  it("emits SSE-formatted Uint8Array on stream-chunk events", async () => {
    const STREAM_ID = "ds-chunk-1";
    const stream = createDataStream(STREAM_ID);
    const reader = stream.getReader();

    window.eatitBridge!.dispatch!({
      type: "stream-chunk",
      streamId: STREAM_ID,
      payload: { content: "Hello" },
    });

    const { value, done } = await reader.read();
    expect(done).toBe(false);
    const decoded = new TextDecoder().decode(value);
    expect(decoded).toContain('"content":"Hello"');
    expect(decoded.startsWith("data: ")).toBe(true);
    expect(decoded.endsWith("\n\n")).toBe(true);

    // Cleanup: cancel to unsubscribe handlers
    reader.cancel();
  });

  it("appends [DONE] terminator on stream-end and closes the stream", async () => {
    const STREAM_ID = "ds-end-1";
    const stream = createDataStream(STREAM_ID);
    const reader = stream.getReader();

    window.eatitBridge!.dispatch!({
      type: "stream-end",
      streamId: STREAM_ID,
      payload: { finishReason: "stop" },
    });

    // First read: the finish_reason chunk
    const r1 = await reader.read();
    expect(new TextDecoder().decode(r1.value)).toContain('"finish_reason":"stop"');
    // Second read: the [DONE] sentinel
    const r2 = await reader.read();
    expect(new TextDecoder().decode(r2.value)).toBe("data: [DONE]\n\n");
    // Third read: end of stream (stream is closed)
    const r3 = await reader.read();
    expect(r3.done).toBe(true);
  });

  it("errors stream on stream-error event", async () => {
    const STREAM_ID = "ds-err-1";
    const stream = createDataStream(STREAM_ID);
    const reader = stream.getReader();

    window.eatitBridge!.dispatch!({
      type: "stream-error",
      streamId: STREAM_ID,
      payload: { code: "llm.stream-cancelled", message: "user cancelled" },
    });

    const err = await reader.read().catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("llm.stream-cancelled");
    expect((err as Error).message).toContain("user cancelled");
  });

  it("ignores events for other streamIds", async () => {
    const STREAM_ID = "ds-mine-1";
    const OTHER = "ds-other-1";
    const stream = createDataStream(STREAM_ID);
    const reader = stream.getReader();

    // Dispatch event for a different stream — should be ignored
    window.eatitBridge!.dispatch!({
      type: "stream-chunk",
      streamId: OTHER,
      payload: { content: "leak" },
    });
    // Then dispatch one for our stream
    window.eatitBridge!.dispatch!({
      type: "stream-chunk",
      streamId: STREAM_ID,
      payload: { content: "mine" },
    });

    const r1 = await reader.read();
    const decoded = new TextDecoder().decode(r1.value);
    expect(decoded).toContain('"content":"mine"');
    expect(decoded).not.toContain("leak");

    // Cleanup
    reader.cancel();
  });

  it("reader.cancel() invokes bridge.call('llm.stopStream', {streamId})", async () => {
    const STREAM_ID = "ds-cancel-1";
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ id: "any", ok: true, data: { stopped: true } });

    const stream = createDataStream(STREAM_ID);
    await stream.cancel();

    const stopCall = mockPost.mock.calls.find(
      (c) => (c[0] as { method: string }).method === "llm.stopStream"
    );
    expect(stopCall).toBeDefined();
    expect(
      (stopCall![0] as { params: { streamId: string } }).params.streamId
    ).toBe(STREAM_ID);
  });
});

// MARK: - M2.7.dev.d llmChatStreamAsAISDKStream wrapper tests

describe("llmChatStreamAsAISDKStream", () => {
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

  it("calls bridge.call('llm.chatStream') then returns ReadableStream with stream:true and a UUID streamId", async () => {
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ id: "any", ok: true, data: { streamId: "s", started: true } });

    const stream = await llmChatStreamAsAISDKStream({
      model: "doubao-seed-1-6-250615",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(stream).toBeInstanceOf(ReadableStream);

    const startCall = mockPost.mock.calls.find(
      (c) => (c[0] as { method: string }).method === "llm.chatStream"
    );
    expect(startCall).toBeDefined();
    const params = (startCall![0] as { params: { streamId: string; stream: boolean } }).params;
    expect(params.stream).toBe(true);
    expect(typeof params.streamId).toBe("string");
    expect(params.streamId.length).toBeGreaterThan(0);

    // Cleanup the returned stream
    await stream.cancel();
  });
});
