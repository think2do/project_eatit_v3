import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  ChatMessageSchema,
  ChatCompletionRequestSchema,
  ChatCompletionResponseSchema,
  ChatChunkSchema,
  ToolCallSchema,
  ToolCallDeltaSchema,
  ToolChoiceSchema,
  UsageSchema,
  ToolDefSchema,
  ResponseFormatSchema,
  type ChatCompletionRequest,
} from "../llmTypes";

// Canonical fixture shared with Swift side (same JSON shape decoded independently on each side).
const CANONICAL_REQUEST_JSON = {
  model: "doubao-seed-1-6-250615",
  messages: [
    { role: "system" as const, content: "You are a helper" },
    { role: "user" as const, content: "hi" },
  ],
  stream: false,
  temperature: 0.7,
  top_p: 0.9,
  max_tokens: 100,
};

describe("llmTypes — Zod round-trip", () => {
  // MARK: - ChatMessage

  it("ChatMessage user happy path round-trips", () => {
    const json = { role: "user", content: "hello" };
    const parsed = ChatMessageSchema.parse(json);
    expect(parsed.role).toBe("user");
    expect(parsed.content).toBe("hello");
    const reparsed = ChatMessageSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(reparsed).toEqual(parsed);
  });

  it("ChatMessage assistant tool-call leg accepts null content", () => {
    const json = {
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "x", type: "function", function: { name: "f", arguments: "{}" } },
      ],
    };
    expect(() => ChatMessageSchema.parse(json)).not.toThrow();
    const parsed = ChatMessageSchema.parse(json);
    expect(parsed.content).toBeNull();
    expect(parsed.tool_calls).toHaveLength(1);
  });

  it("ChatMessage rejects invalid role", () => {
    const json = { role: "bot", content: "x" };
    expect(() => ChatMessageSchema.parse(json)).toThrow(z.ZodError);
  });

  it("ChatMessage tool role with tool_call_id round-trips", () => {
    const json = {
      role: "tool",
      content: "result",
      tool_call_id: "call_xyz",
    };
    const parsed = ChatMessageSchema.parse(json);
    expect(parsed.tool_call_id).toBe("call_xyz");
    const reparsed = ChatMessageSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(reparsed).toEqual(parsed);
  });

  // MARK: - ChatCompletionRequest

  it("ChatCompletionRequest snake_case fields round-trip", () => {
    const req: ChatCompletionRequest = {
      model: "doubao-seed-1-6-250615",
      messages: [{ role: "user", content: "hi" }],
      stream: false,
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 256,
    };
    const round = ChatCompletionRequestSchema.parse(JSON.parse(JSON.stringify(req)));
    expect(round.top_p).toBe(0.9);
    expect(round.max_tokens).toBe(256);
    expect(round.model).toBe("doubao-seed-1-6-250615");
  });

  it("ChatCompletionRequest canonical fixture decodes correctly", () => {
    const parsed = ChatCompletionRequestSchema.parse(CANONICAL_REQUEST_JSON);
    expect(parsed.model).toBe("doubao-seed-1-6-250615");
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.top_p).toBe(0.9);
    expect(parsed.max_tokens).toBe(100);
  });

  // MARK: - ToolChoice

  it("ToolChoice 'auto' string variant", () => {
    expect(ToolChoiceSchema.parse("auto")).toBe("auto");
  });

  it("ToolChoice 'none' string variant", () => {
    expect(ToolChoiceSchema.parse("none")).toBe("none");
  });

  it("ToolChoice function object variant round-trips", () => {
    const json = { type: "function", function: { name: "search" } };
    const parsed = ToolChoiceSchema.parse(json);
    expect(parsed).toEqual(json);
    const reparsed = ToolChoiceSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(reparsed).toEqual(json);
  });

  // MARK: - ToolDef + ResponseFormat

  it("ToolDef round-trips with JSONSchema parameters", () => {
    const json = {
      type: "function",
      function: {
        name: "get_weather",
        description: "Get weather for a city",
        parameters: { type: "object", properties: { city: { type: "string" } } },
      },
    };
    const parsed = ToolDefSchema.parse(json);
    expect(parsed.function.name).toBe("get_weather");
  });

  it("ResponseFormat text variant round-trips", () => {
    const parsed = ResponseFormatSchema.parse({ type: "text" });
    expect(parsed.type).toBe("text");
  });

  it("ResponseFormat json_object variant round-trips", () => {
    const parsed = ResponseFormatSchema.parse({ type: "json_object" });
    expect(parsed.type).toBe("json_object");
  });

  // MARK: - Usage

  it("Usage snake_case fields round-trip", () => {
    const json = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };
    const parsed = UsageSchema.parse(json);
    expect(parsed.total_tokens).toBe(15);
    const reparsed = UsageSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(reparsed).toEqual(parsed);
  });

  // MARK: - ChatCompletionResponse

  it("ChatCompletionResponse usage round-trips", () => {
    const json = {
      id: "x",
      object: "chat.completion",
      created: 1700000000,
      model: "doubao-seed-1-6-250615",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "ok" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
    const parsed = ChatCompletionResponseSchema.parse(json);
    expect(parsed.usage?.total_tokens).toBe(15);
    const reparsed = ChatCompletionResponseSchema.parse(
      JSON.parse(JSON.stringify(parsed))
    );
    expect(reparsed).toEqual(parsed);
  });

  it("ChatCompletionResponse without usage (optional)", () => {
    const json = {
      id: "y",
      object: "chat.completion",
      created: 1700000001,
      model: "m",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "hi" },
          finish_reason: "stop",
        },
      ],
    };
    const parsed = ChatCompletionResponseSchema.parse(json);
    expect(parsed.usage).toBeUndefined();
  });

  // MARK: - SSE chunk types

  it("ChatChunk SSE streaming chunk round-trips", () => {
    const json = {
      id: "abc",
      choices: [
        { index: 0, delta: { content: "Hello" }, finish_reason: null },
      ],
    };
    const parsed = ChatChunkSchema.parse(json);
    expect(parsed.choices[0].delta.content).toBe("Hello");
    const reparsed = ChatChunkSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(reparsed).toEqual(parsed);
  });

  it("ChatChunk with usage optional field", () => {
    const json = {
      id: "abc",
      choices: [{ index: 0, delta: { role: "assistant" } }],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    };
    const parsed = ChatChunkSchema.parse(json);
    expect(parsed.usage?.total_tokens).toBe(8);
  });

  it("ToolCallDelta SSE partial — all fields optional", () => {
    expect(() => ToolCallDeltaSchema.parse({})).not.toThrow();
    expect(() => ToolCallDeltaSchema.parse({ index: 0, id: "x" })).not.toThrow();
    const partial = ToolCallDeltaSchema.parse({ index: 0, function: { arguments: '{"q":' } });
    expect(partial.function?.arguments).toBe('{"q":');
  });

  it("ToolCall full variant round-trips", () => {
    const json = {
      id: "call_abc",
      type: "function",
      function: { name: "search", arguments: '{"q":"pizza"}' },
    };
    const parsed = ToolCallSchema.parse(json);
    expect(parsed.id).toBe("call_abc");
    expect(parsed.function.arguments).toBe('{"q":"pizza"}');
    const reparsed = ToolCallSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(reparsed).toEqual(parsed);
  });

  // MARK: - Cross-side canonical fixture parity
  // Same JSON decoded independently on each side (Swift XCTest + JS Vitest).

  it("canonical fixture structural parity — same model/messages/top_p/max_tokens", () => {
    const parsed = ChatCompletionRequestSchema.parse(CANONICAL_REQUEST_JSON);
    expect(parsed.model).toBe("doubao-seed-1-6-250615");
    expect(parsed.messages[0].role).toBe("system");
    expect(parsed.messages[1].content).toBe("hi");
    expect(parsed.top_p).toBe(0.9);
    expect(parsed.max_tokens).toBe(100);
  });
});
