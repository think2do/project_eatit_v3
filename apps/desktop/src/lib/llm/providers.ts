import type { LLMProvider } from "@/lib/llm/config";

export interface ProviderPreset {
  id: LLMProvider;
  label: string;
  registerUrl: string;
  baseUrl: string;
  models: readonly string[];
  hint?: string;
}

/**
 * v3.4 收敛:LLM 只支持火山方舟 ARK 一家。
 *
 * 红线依据:
 *   - PRD v3.4 §2.3 / §4.5.1:LLM Provider 收敛火山方舟
 *   - constraints §A0.3:出站 host 白名单仅 ark.cn-beijing.volces.com
 *   - Info.plist NSAppTransportSecurity:仅 ark.cn-beijing.volces.com + openspeech.bytedance.com
 *   - LLMGateway.swift hardcoded baseURL + allowedHost = ark.cn-beijing.volces.com
 *
 * 因此 UI 只显示一个 provider(火山方舟),不再让用户选 OpenAI / DeepSeek /
 * SiliconFlow / Anthropic / 自定义 — 选了也跑不通(host 不在白名单 + LLMGateway
 * 忽略 baseURL)。
 *
 * 历史 v3.3 的 6 provider preset 已在本节点移除(M5.X.audit-fix UI 收敛)。
 */
export const PROVIDERS: readonly ProviderPreset[] = [
  {
    id: "volcengine",
    label: "火山方舟 (Doubao)",
    registerUrl: "https://www.volcengine.com/product/ark",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    models: [
      "doubao-seed-2-0-lite-260215",
      "doubao-seed-1-6-250615",
      "doubao-seed-1-6-flash-250615",
      "doubao-seed-1-6-thinking-250715",
    ],
    hint:
      "v3.4 唯一支持的 LLM Provider。请在火山方舟控制台创建 API Key 后填入。" +
      "出站 host 严格白名单(constraints §A0.3),无法切到 OpenAI / DeepSeek / OpenRouter 等。",
  },
] as const;

export function getProvider(id: LLMProvider): ProviderPreset {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}
