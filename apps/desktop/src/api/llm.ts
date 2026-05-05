// §A0.4: secrets stay Swift-side. testLLMConnection probe goes through llm.chat Bridge;
// Swift LLMGateway reads Keychain (api_key never crosses Bridge).
import { llmChat } from "@/services/llm";
import type { LLMConfig } from "@/lib/llm/config";

export interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
}

export interface LLMTestResponse {
  ok: boolean;
  usage?: LLMUsage | null;
  error_code?: string | null;
  error_message?: string | null;
}

/**
 * Probe LLM connection by sending a tiny "ping" message via the Bridge.
 * Caller MUST have already invoked saveLLMConfig(config) (writes to Keychain)
 * — testLLMConnection itself does not pass api_key; Swift LLMGateway reads it
 * from Keychain. The `config` arg is kept for backward compatibility with
 * TestConnectionButton's signature; internally only `config.model` is honored.
 */
export async function testLLMConnection(config: LLMConfig): Promise<LLMTestResponse> {
  const start = performance.now();
  try {
    const result = await llmChat({
      messages: [{ role: "user", content: "ping" }],
      model: config.model,
      max_tokens: 10,
      stream: false,
    });
    const latency = Math.round(performance.now() - start);
    return {
      ok: true,
      usage: result.usage
        ? {
            prompt_tokens: result.usage.prompt_tokens,
            completion_tokens: result.usage.completion_tokens,
            latency_ms: latency,
          }
        : null,
      error_code: null,
      error_message: null,
    };
  } catch (err) {
    // BridgeError has code + message; non-Bridge fallback: Error/unknown
    const code = (err as { code?: string })?.code ?? "unknown";
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, usage: null, error_code: code, error_message: message };
  }
}
