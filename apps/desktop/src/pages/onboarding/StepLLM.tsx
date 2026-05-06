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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
        }}
      >
        <ProviderSelect
          value={config.provider}
          onChange={(next) =>
            setConfig((prev) => ({
              provider: next.id,
              api_key: prev.api_key,
              model: next.models[0] ?? prev.model,
              base_url: next.baseUrl || null,
            }))
          }
        />

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-700)" }}>
            Base URL {config.provider === "custom" ? "(必填)" : "(可选覆盖)"}
          </span>
          <input
            type="text"
            value={config.base_url ?? ""}
            onChange={(e) =>
              setConfig((c) => ({ ...c, base_url: e.target.value || null }))
            }
            placeholder={preset.baseUrl || "https://api.example.com/v1"}
            style={fieldStyle}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-700)" }}>
            模型名称
          </span>
          <input
            type="text"
            list="step-llm-model-suggestions"
            value={config.model}
            onChange={(e) => setConfig((c) => ({ ...c, model: e.target.value }))}
            placeholder="例如 doubao-seed-1-6-250615"
            style={fieldStyle}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <datalist id="step-llm-model-suggestions">
            {suggestedModels.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <span style={{ fontSize: 11, color: "var(--ink-500)" }}>
            可自由输入任何已开通的模型 ID(如 doubao-1-5-pro-32k-250115)。下拉为推荐建议,非限定。
          </span>
        </label>
      </div>

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
