// §A0 永久排除 Tauri: @tauri-apps/api/core 已全量移除。
// v3.4 macOS port 使用 keychain Bridge 代替 Rust invoke。
// §C3: JS 层永远不读回 api_key — loadLLMConfig 固定返回 null。
// 非敏感元数据(provider/model/base_url)的持久化延后至 M5
// (services/db.ts 尚未提供 appSettings API)。

import { keychain } from "@/services/keychain";

export type LLMProvider =
  | "openai"
  | "anthropic"
  | "siliconflow"
  | "deepseek"
  | "dashscope"
  | "custom";

export interface LLMConfig {
  provider: LLMProvider;
  api_key: string;
  model: string;
  base_url?: string | null;
}

/**
 * Persist the API key in the macOS keychain via Bridge.
 * §C3: only the secret travels to the keychain; provider/model/base_url
 * metadata persistence is deferred to M5 (db.appSettings API not yet available).
 * TODO M5: also persist {provider, model, base_url} via db.setAppSetting("llm-meta", …).
 */
export async function saveLLMConfig(config: LLMConfig): Promise<void> {
  await keychain.save("ark-api-key", config.api_key);
}

/**
 * §C3: always returns null in v3.4.  The api_key MUST NOT be read back to JS.
 * Callers that previously consumed `cfg.api_key` (e.g. api/client.ts interceptor,
 * InterviewPage.tsx) are legacy v3.3 paths being removed in M4.2 / M5.
 *
 * TODO M5: replace callers with:
 *   const { exists } = await keychain.exists("ark-api-key");
 *   const meta = await db.getAppSetting("llm-meta");  // provider/model/base_url only
 */
export async function loadLLMConfig(): Promise<LLMConfig | null> {
  return null;
}

/** Remove the keychain entry.  Idempotent: succeeds even if no entry exists. */
export async function deleteLLMConfig(): Promise<void> {
  await keychain.delete("ark-api-key");
  // TODO M5: also delete db.deleteAppSetting("llm-meta") once db.appSettings API lands.
}

/** Base64 encoding of the config for the X-LLM-Config HTTP header. */
export function encodeForHeader(config: LLMConfig): string {
  const json = JSON.stringify(config);
  // btoa requires ASCII; apply TextEncoder for safety with non-ASCII.
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
