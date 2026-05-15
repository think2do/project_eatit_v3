import { useEffect, useState } from "react";
import { ProviderSelect } from "@/pages/settings/ProviderSelect";
import { KeyInput } from "@/pages/settings/KeyInput";
import { TestConnectionButton } from "@/pages/settings/TestConnectionButton";
import {
  loadLLMConfig,
  type LLMConfig,
  type LLMProvider,
} from "@/lib/llm/config";
import { getProvider, PROVIDERS } from "@/lib/llm/providers";

interface Props {
  onNext: () => void;
  onBack: () => void;
}

const DEFAULT_PROVIDER: LLMProvider = "volcengine";

function initialConfig(): LLMConfig {
  const preset = getProvider(DEFAULT_PROVIDER);
  return {
    provider: preset.id,
    api_key: "",
    model: preset.models[0] ?? "",
    base_url: preset.baseUrl || null,
  };
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--line)",
  background: "var(--bg-elev)",
  color: "var(--ink-900)",
  fontSize: 13.5,
  fontFamily: "var(--f-sans)",
};

export function StepLLM({ onNext, onBack }: Props): JSX.Element {
  const [config, setConfig] = useState<LLMConfig>(() => initialConfig());
  const [hydrated, setHydrated] = useState(false);
  const [tested, setTested] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadLLMConfig()
      .then((existing) => {
        if (mounted && existing) setConfig(existing);
      })
      .catch(() => {
        /* keychain unavailable in dev shell — keep defaults */
      })
      .finally(() => {
        if (mounted) setHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const preset = getProvider(config.provider);
  const suggestedModels =
    PROVIDERS.find((p) => p.id === config.provider)?.models ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <div className="eyebrow">02 · LLM 配置</div>
        <h1
          className="h-serif"
          style={{
            fontSize: 36,
            lineHeight: 1.1,
            fontWeight: 400,
            margin: "12px 0 8px",
            color: "var(--ink-900)",
          }}
        >
          选择模型提供方
        </h1>
        <p style={{ fontSize: 14, color: "var(--ink-500)", maxWidth: 560, margin: 0 }}>
          填入你自己的 API Key。钥匙串保存,测试连接通过后即可进入下一步。
        </p>
      </div>

      {/* Provider / Base URL / 模型名称 三段在 onboarding UI 隐藏(后端 config
          仍照常持久化:provider=volcengine, base_url=https://ark.cn-beijing.volces.com/api/v3,
          model=doubao-seed-2-0-lite-260215 — initialConfig() 给的默认值)。
          v3.4 出站 host 白名单只 ark.cn-beijing.volces.com,普通用户没必要改。 */}

      <KeyInput
        value={config.api_key}
        onChange={(next) => setConfig((c) => ({ ...c, api_key: next }))}
      />

      <TestConnectionButton
        config={config}
        disabled={!hydrated}
        onSuccess={() => setTested(true)}
      />

      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: "10px 18px",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--line)",
            background: "var(--bg-elev)",
            color: "var(--ink-900)",
            fontSize: 13.5,
            cursor: "pointer",
          }}
        >
          返回
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!tested}
          title={tested ? undefined : "请先测试连接"}
          style={{
            padding: "10px 20px",
            borderRadius: "var(--r-md)",
            border: "none",
            background: tested ? "var(--brand)" : "var(--ink-200)",
            color: "white",
            fontSize: 13.5,
            fontWeight: 500,
            cursor: tested ? "pointer" : "not-allowed",
          }}
        >
          下一步
        </button>
      </div>
    </div>
  );
}
