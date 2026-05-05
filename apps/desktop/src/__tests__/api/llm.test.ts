/**
 * api/llm — M5.4.dev.b PR4a
 *
 * Tests testLLMConnection rewrite: axios → llmChat Bridge.
 *
 * Mocks @/services/llm so the Bridge layer is not exercised here
 * (bridge contract is covered by infra/llm.expanded.test.ts).
 *
 * §A0: no Tauri. §A0.4: api_key never passed to llmChat.
 * §K #4: no axios fallback. §K #6: no api_key crossing Bridge.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/llm", () => ({
  llmChat: vi.fn(),
}));

import { llmChat } from "@/services/llm";
import { testLLMConnection } from "@/api/llm";
import type { LLMConfig } from "@/lib/llm/config";

const llmChatMock = vi.mocked(llmChat);

beforeEach(() => {
  llmChatMock.mockReset();
});

const baseConfig: LLMConfig = {
  provider: "ark",
  model: "doubao-seed-1-6-250615",
  base_url: "https://ark.cn-beijing.volces.com/api/v3",
  api_key: "irrelevant-stub-keychain-holds-the-real-one",
};

describe("testLLMConnection (PR4a)", () => {
  it("ok=true with usage when llmChat resolves with usage", async () => {
    llmChatMock.mockResolvedValueOnce({
      content: "pong",
      finishReason: "stop",
      usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
    } as Awaited<ReturnType<typeof llmChat>>);

    const r = await testLLMConnection(baseConfig);

    expect(r.ok).toBe(true);
    expect(r.usage?.prompt_tokens).toBe(3);
    expect(r.usage?.completion_tokens).toBe(5);
    expect(r.usage?.latency_ms).toBeGreaterThanOrEqual(0);
    expect(r.error_code).toBeNull();
    expect(r.error_message).toBeNull();
  });

  it("ok=true with usage=null when llmChat returns no usage", async () => {
    llmChatMock.mockResolvedValueOnce({
      content: "pong",
      finishReason: "stop",
    } as Awaited<ReturnType<typeof llmChat>>);

    const r = await testLLMConnection(baseConfig);

    expect(r.ok).toBe(true);
    expect(r.usage).toBeNull();
  });

  it("ok=false with BridgeError code when llmChat rejects with BridgeError", async () => {
    const err = Object.assign(new Error("api key not in keychain"), {
      code: "llm.api-key-missing",
    });
    llmChatMock.mockRejectedValueOnce(err);

    const r = await testLLMConnection(baseConfig);

    expect(r.ok).toBe(false);
    expect(r.error_code).toBe("llm.api-key-missing");
    expect(r.error_message).toBe("api key not in keychain");
  });

  it("ok=false with error_code='unknown' when err has no code property", async () => {
    llmChatMock.mockRejectedValueOnce(new Error("plain error, no code"));

    const r = await testLLMConnection(baseConfig);

    expect(r.ok).toBe(false);
    expect(r.error_code).toBe("unknown");
  });

  it("error_message captures err.message for non-BridgeError", async () => {
    llmChatMock.mockRejectedValueOnce(new Error("network timeout"));

    const r = await testLLMConnection(baseConfig);

    expect(r.error_message).toBe("network timeout");
  });

  it("error_message falls back to String(err) for non-Error throws", async () => {
    llmChatMock.mockRejectedValueOnce("raw string rejection");

    const r = await testLLMConnection(baseConfig);

    expect(r.ok).toBe(false);
    expect(r.error_message).toBe("raw string rejection");
  });

  it("uses config.model in llmChat params", async () => {
    llmChatMock.mockResolvedValueOnce({
      content: "ok",
      finishReason: "stop",
    } as Awaited<ReturnType<typeof llmChat>>);

    const customConfig: LLMConfig = { ...baseConfig, model: "gpt-4o" };
    await testLLMConnection(customConfig);

    expect(llmChatMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4o" })
    );
  });

  it("sends max_tokens=10 (small probe to minimize cost)", async () => {
    llmChatMock.mockResolvedValueOnce({
      content: "ok",
      finishReason: "stop",
    } as Awaited<ReturnType<typeof llmChat>>);

    await testLLMConnection(baseConfig);

    expect(llmChatMock).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 10 })
    );
  });

  it("never passes api_key to llmChat (§A0.4 — secrets stay Swift-side)", async () => {
    llmChatMock.mockResolvedValueOnce({
      content: "ok",
      finishReason: "stop",
    } as Awaited<ReturnType<typeof llmChat>>);

    await testLLMConnection(baseConfig);

    const callArg = llmChatMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg).not.toHaveProperty("api_key");
    expect(callArg).not.toHaveProperty("apiKey");
    expect(callArg).not.toHaveProperty("Authorization");
  });
});
