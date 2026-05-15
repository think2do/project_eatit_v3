// §A0 永久排除 Tauri: @tauri-apps/api/core 已全量移除。
// v3.4 macOS port 使用 keychain Bridge 代替 Rust invoke。
// §C3: JS 层永远不读回 api_key — loadLLMConfig 仅返回元数据,api_key 字段恒为空串。
// 元数据(provider/model/base_url)持久化到 app_settings.llm-meta(JSON)。

import { getAppSetting, putAppSetting } from "@/api/appSettings";
import { resetConfiguredModelCache } from "@/core/llm/configuredModel";
import { db } from "@/services/db";
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

const META_KEY = "llm-meta";

interface LLMMeta {
  provider: LLMProvider;
  model: string;
  base_url: string | null;
}

/**
 * 把 LLM 配置写入持久化层:
 *   - 元数据(provider/model/base_url)→ app_settings.llm-meta
 *   - api_key(若非空)→ macOS Keychain account="ark-api-key"
 *
 * 留空 api_key 时不会覆盖 / 删除已有 keychain 条目,允许用户只改模型名而不重输密钥。
 */
export async function saveLLMConfig(config: LLMConfig): Promise<void> {
  const meta: LLMMeta = {
    provider: config.provider,
    model: config.model,
    base_url: config.base_url ?? null,
  };
  await putAppSetting<LLMMeta>(META_KEY, meta);
  if (config.api_key.trim().length > 0) {
    await keychain.save("ark-api-key", config.api_key);
  }
  // 让 agents 在下一次调用时重读最新 model,而不是继续用旧缓存值。
  resetConfiguredModelCache();
}

/**
 * §C3: api_key 永远不读回 JS。返回的 LLMConfig.api_key 恒为空串。
 * 元数据从 app_settings.llm-meta 读出;若无记录则返回 null,调用方走默认配置。
 */
export async function loadLLMConfig(): Promise<LLMConfig | null> {
  const meta = await getAppSetting<LLMMeta>(META_KEY);
  if (!meta) return null;
  return {
    provider: meta.provider,
    api_key: "",
    model: meta.model,
    base_url: meta.base_url ?? null,
  };
}

/** 是否已配置 API Key(仅探测存在性,不读出明文)。 */
export async function hasLLMApiKey(): Promise<boolean> {
  try {
    const { exists } = await keychain.exists("ark-api-key");
    return exists;
  } catch {
    return false;
  }
}

/** 清空 keychain 中的 api_key 与 app_settings 中的元数据。Idempotent。 */
export async function deleteLLMConfig(): Promise<void> {
  await keychain.delete("ark-api-key");
  await db.exec("DELETE FROM app_settings WHERE key = ?", [META_KEY]);
  resetConfiguredModelCache();
}
