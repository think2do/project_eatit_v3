// §A0 永久排除 Tauri: @tauri-apps/api/core 已全量移除。
// v3.4 macOS port 使用 keychain Bridge 代替 Rust invoke。
// §C3: JS 层永远不读回 api_key — loadLLMConfig 固定返回 null。
// 非敏感元数据(provider/model/base_url)的持久化延后至 M5
// (services/db.ts 尚未提供 appSettings API)。

import { keychain } from "@/services/keychain";

/**
 * v3.4 收敛:LLM Provider 仅 "volcengine"(火山方舟 ARK / Doubao)。
 * 历史 v3.3 union(openai / anthropic / siliconflow / deepseek / dashscope /
 * custom)在 M5.X.audit-fix UI 收敛节点移除。原因见 lib/llm/providers.ts。
 *
 * 旧 union 字面量保留为 "legacy-only" 类型(只读取老 keychain meta 时用),
 * 不再被 UI / saveLLMConfig 写入。新 user 仅能选 volcengine。
 */
export type LLMProvider =
  | "volcengine"
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
