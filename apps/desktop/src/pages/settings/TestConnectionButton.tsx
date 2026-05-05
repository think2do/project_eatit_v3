import { useState } from "react";
import { Loader2 } from "lucide-react";
import { saveLLMConfig, type LLMConfig } from "@/lib/llm/config";
import { testLLMConnection, type LLMTestResponse } from "@/api/llm";

interface Props {
  config: LLMConfig;
  disabled?: boolean;
  onSuccess?: (response: LLMTestResponse) => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; data: LLMTestResponse }
  | { kind: "error"; code: string; message: string };

function resultBannerStyle(ok: boolean): React.CSSProperties {
  return {
    marginTop: 12,
    padding: "10px 14px",
    borderRadius: "var(--r-md)",
    fontSize: 13,
    background: ok ? "var(--brand-soft)" : "var(--warn-soft)",
    color: ok ? "var(--brand-ink)" : "var(--warn)",
    border: `1px solid ${ok ? "var(--brand)" : "var(--warn)"}`,
  };
}

export function TestConnectionButton({ config, disabled, onSuccess }: Props): JSX.Element {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const handleClick = async () => {
    setStatus({ kind: "running" });
    try {
      await saveLLMConfig(config);
    } catch (err) {
      setStatus({
        kind: "error",
        code: "keychain_write_failed",
        message: err instanceof Error ? err.message : "无法写入 macOS 钥匙串",
      });
      return;
    }

    try {
      const data = await testLLMConnection(config);
      if (data.ok) {
        setStatus({ kind: "ok", data });
        onSuccess?.(data);
      } else {
        setStatus({
          kind: "error",
          code: data.error_code ?? "unknown",
          message: data.error_message ?? "调用失败",
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "请求失败";
      setStatus({ kind: "error", code: "network", message });
    }
  };

  const isRunning = status.kind === "running";
  const canClick = !disabled && !isRunning && config.api_key.trim().length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={!canClick}
        style={{
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 18px",
          borderRadius: "var(--r-md)",
          border: "none",
          background: canClick ? "var(--brand)" : "var(--ink-200)",
          color: "white",
          fontSize: 13.5,
          fontWeight: 500,
          cursor: canClick ? "pointer" : "not-allowed",
          transition: "opacity 120ms ease",
        }}
      >
        {isRunning ? <Loader2 size={14} className="spin" /> : null}
        {isRunning ? "测试中..." : "测试连接"}
      </button>

      {status.kind === "ok" ? (
        <div style={resultBannerStyle(true)}>
          <strong>连接正常</strong>
          {status.data.usage ? (
            <span className="mono" style={{ marginLeft: 8 }}>
              · prompt={status.data.usage.prompt_tokens}
              {" · "}
              completion={status.data.usage.completion_tokens}
              {" · "}
              {status.data.usage.latency_ms}ms
            </span>
          ) : null}
        </div>
      ) : null}

      {status.kind === "error" ? (
        <div style={resultBannerStyle(false)}>
          <strong>连接失败</strong>
          <span className="mono" style={{ marginLeft: 8 }}>
            [{status.code}]
          </span>
          <div style={{ marginTop: 4 }}>{status.message}</div>
        </div>
      ) : null}
    </div>
  );
}
