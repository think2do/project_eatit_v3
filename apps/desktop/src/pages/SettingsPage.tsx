import { useEffect, useMemo, useState } from "react";
import { getAppSetting, putAppSetting } from "@/api/appSettings";
// §A0 v3.4: ASR availability surfaced via ASRGateway errors at runtime; no health probe.
import {
  getResearchOptIn,
  setResearchOptIn as putResearchOptIn,
} from "@/api/settingsResearch";
import { Loader2 } from "lucide-react";
import { PrivacyOptInDialog } from "@/components/PrivacyOptInDialog";
import { ProviderSelect } from "@/pages/settings/ProviderSelect";
import { KeyInput } from "@/pages/settings/KeyInput";
import {
  resultBannerStyle,
  useLLMTest,
} from "@/pages/settings/TestConnectionButton";
import { DataManagement } from "@/pages/settings/DataManagement";
import {
  hasLLMApiKey,
  loadLLMConfig,
  saveLLMConfig,
  type LLMConfig,
  type LLMProvider,
} from "@/lib/llm/config";
import { getProvider, PROVIDERS } from "@/lib/llm/providers";
import {
  hasASRCredentials,
  saveASRCredentials,
} from "@/lib/asr/credentials";
import { testASRConnection } from "@/services/asr";
import { useAppStore } from "@/stores/app-store";

type InterviewInputMode = "voice" | "text";

const DEFAULT_PROVIDER: LLMProvider = "siliconflow";

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

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

export function SettingsPage(): JSX.Element {
  const [config, setConfig] = useState<LLMConfig>(() => initialConfig());
  const [hydrated, setHydrated] = useState(false);
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: "idle" });
  const {
    status: testStatus,
    run: runTest,
    reset: resetTest,
  } = useLLMTest(config, () => {
    // Successful test == authoritative save: keychain has been written and the
    // user has just verified it works.  Mirror handleSave's post-save UX so
    // the "已配置" hint appears and the input doesn't keep echoing the secret.
    if (config.api_key.trim().length > 0) {
      setKeyConfigured(true);
      setConfig((c) => ({ ...c, api_key: "" }));
    }
    setSaveStatus({ kind: "idle" });
  });
  const preset = useMemo(() => getProvider(config.provider), [config.provider]);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      loadLLMConfig().catch(() => null),
      hasLLMApiKey().catch(() => false),
    ])
      .then(([existing, hasKey]) => {
        if (!mounted) return;
        if (existing) setConfig(existing);
        setKeyConfigured(hasKey);
      })
      .finally(() => {
        if (mounted) setHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // 任何字段改动都会让上一次的「已保存」/「连接正常」反馈过期 → 回到 idle,
  // 避免用户以为新值已保存或仍然连得通(尤其是改了模型名以后)。
  const markDirty = () => {
    setSaveStatus((prev) => (prev.kind === "saved" ? { kind: "idle" } : prev));
    if (testStatus.kind !== "running") {
      resetTest();
    }
  };

  const handleSave = async () => {
    setSaveStatus({ kind: "saving" });
    try {
      await saveLLMConfig(config);
      if (config.api_key.trim().length > 0) {
        setKeyConfigured(true);
        // 写完后清空输入框,既避免用户以为下次进来还会看到明文,
        // 也让「已配置 API Key」提示更明确。
        setConfig((c) => ({ ...c, api_key: "" }));
      }
      setSaveStatus({ kind: "saved" });
    } catch (err) {
      setSaveStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "保存失败",
      });
    }
  };

  const handleProviderChange = (next: typeof preset) => {
    markDirty();
    setConfig((prev) => ({
      provider: next.id,
      api_key: prev.api_key,
      model: next.models[0] ?? prev.model,
      base_url: next.baseUrl || null,
    }));
  };

  const suggestedModels = PROVIDERS.find((p) => p.id === config.provider)?.models ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div>
        <div className="eyebrow">07 · 设置</div>
        <h1
          className="h-serif"
          style={{
            fontSize: 42,
            lineHeight: 1.1,
            fontWeight: 400,
            margin: "10px 0 6px",
            color: "var(--ink-900)",
          }}
        >
          LLM 配置 · 数据管理
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--ink-500)",
            maxWidth: 620,
            lineHeight: 1.6,
          }}
        >
          所有调用都通过本地后端中转,你的 API Key 只会保存在 macOS
          钥匙串中,不会写入日志或同步到任何服务器。
        </p>
      </div>

      <section
        className="ds-card"
        style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}
      >
        <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h2
            style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--ink-900)" }}
          >
            BYOK · 模型提供方
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--ink-500)" }}>
            自带 API Key(Bring Your Own Key)。选择 Provider 并测试连接后即可开始使用。
          </p>
        </header>

        {/* Provider / Base URL / 模型名称 三段在 UI 上隐藏 — 用户决策(2026-05-09):
            BYOK 默认走火山方舟 Doubao + 内置 baseUrl + doubao-seed-2-0-lite-260215,
            不让普通用户改。后台仍保留这三个字段(getDefaultLLMConfig 给默认值,
            handleProviderChange / setConfig 没人调,但 config.provider/base_url/model
            照常持久化、照常被 LLMGateway 读取),所以"后台不变"。 */}

        <KeyInput
          value={config.api_key}
          onChange={(next) => {
            markDirty();
            setConfig((c) => ({ ...c, api_key: next }));
          }}
          placeholder={keyConfigured ? "已配置(留空保留现有密钥)" : "sk-..."}
        />
        {keyConfigured && config.api_key.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
            ✓ 已在 macOS 钥匙串中配置 API Key。无需重输,只改其它字段也可保存。
          </div>
        ) : null}

        {preset.registerUrl ? (
          <div style={{ fontSize: 12.5, color: "var(--ink-500)", display: "flex", flexDirection: "column", gap: 4 }}>
            <div>
              没有密钥?前往{" "}
              <a
                href={preset.registerUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--brand)", textDecoration: "underline" }}
              >
                {preset.label}
              </a>{" "}
              注册。{preset.hint}
            </div>
            <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-400)" }}>
              点不开?复制此链接到浏览器:{preset.registerUrl}
            </div>
          </div>
        ) : preset.hint ? (
          <div style={{ fontSize: 12.5, color: "var(--ink-500)" }}>{preset.hint}</div>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 12,
            }}
          >
            <button
              type="button"
              onClick={handleSave}
              disabled={!hydrated || saveStatus.kind === "saving"}
              style={{
                padding: "10px 18px",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--line)",
                background: "var(--bg-elev)",
                color: "var(--ink-900)",
                fontSize: 13.5,
                fontWeight: 500,
                cursor:
                  !hydrated || saveStatus.kind === "saving"
                    ? "not-allowed"
                    : "pointer",
                opacity: !hydrated || saveStatus.kind === "saving" ? 0.6 : 1,
              }}
            >
              {saveStatus.kind === "saving" ? "保存中..." : "保存"}
            </button>

            {(() => {
              const isRunning = testStatus.kind === "running";
              const canTest =
                hydrated &&
                !isRunning &&
                (config.api_key.trim().length > 0 || keyConfigured);
              return (
                <button
                  type="button"
                  onClick={runTest}
                  disabled={!canTest}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 18px",
                    borderRadius: "var(--r-md)",
                    border: "none",
                    background: canTest ? "var(--brand)" : "var(--ink-200)",
                    color: "white",
                    fontSize: 13.5,
                    fontWeight: 500,
                    cursor: canTest ? "pointer" : "not-allowed",
                  }}
                >
                  {isRunning ? <Loader2 size={14} className="spin" /> : null}
                  {isRunning ? "测试中..." : "测试连接"}
                </button>
              );
            })()}
          </div>

          {/* 反馈区:已保存 / 保存错误 / 连接 banner 都统一在按钮行下方。
              测试一旦出 banner 就接管反馈,避免「✓ 已保存」与「连接正常」并存。 */}
          {saveStatus.kind === "saved" && testStatus.kind === "idle" ? (
            <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--brand)" }}>
              ✓ 已保存
            </div>
          ) : null}
          {saveStatus.kind === "error" && testStatus.kind === "idle" ? (
            <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--warn)" }}>
              {saveStatus.message}
            </div>
          ) : null}
          {testStatus.kind === "ok" ? (
            <div style={resultBannerStyle(true)}>
              <strong>连接正常</strong>
              {testStatus.data.usage ? (
                <span className="mono" style={{ marginLeft: 8 }}>
                  · prompt={testStatus.data.usage.prompt_tokens}
                  {" · "}
                  completion={testStatus.data.usage.completion_tokens}
                  {" · "}
                  {testStatus.data.usage.latency_ms}ms
                </span>
              ) : null}
            </div>
          ) : null}
          {testStatus.kind === "error" ? (
            <div style={resultBannerStyle(false)}>
              <strong>连接失败</strong>
              <span className="mono" style={{ marginLeft: 8 }}>
                [{testStatus.code}]
              </span>
              <div style={{ marginTop: 4 }}>{testStatus.message}</div>
            </div>
          ) : null}
        </div>
      </section>

      <ASRCredentialsSection />

      <InterviewExperienceSection />

      <ResearchOptInSection />

      <DataManagement />
    </div>
  );
}

// ASR · 火山引擎 SAUC 凭证 (M-asr.byok)
//
// LLMGateway 的 ARK Key 与 ASRGateway 的 SAUC App ID + Access Token 是两套
// 互不通用的凭证。早期版本只在 BYOK · LLM 一栏让用户填 ARK Key,导致面试
// 录音时 Swift ASRGateway 因 Keychain 缺 `volc-asr-credentials` 抛
// asr.credentials-missing,但因 XState user_answering 此前未接 WS_ERROR,
// 错误被吞,UI 假装在录音 → 1+ 分钟无任何转写。
//
// 这一节复刻 BYOK · LLM 的交互模式:已配置时输入框显占位,留空保存不会
// 覆盖现有凭证,JSON 序列化后写入 Keychain account="volc-asr-credentials"。
type ASRTestStatus =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok" }
  | { kind: "error"; code: string; message: string };

function ASRCredentialsSection(): JSX.Element {
  const [apiKey, setApiKey] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [endpointPath, setEndpointPath] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [testStatus, setTestStatus] = useState<ASRTestStatus>({ kind: "idle" });

  useEffect(() => {
    let mounted = true;
    hasASRCredentials()
      .then((exists) => {
        if (mounted) setConfigured(exists);
      })
      .catch(() => {
        /* keychain probe failed — leave configured=false */
      })
      .finally(() => {
        if (mounted) setHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const markDirty = () => {
    setStatus((prev) => (prev.kind === "saved" ? { kind: "idle" } : prev));
    // The previous probe was for whatever creds were saved BEFORE the user
    // edited the inputs — its outcome no longer applies, reset it.
    setTestStatus((prev) => (prev.kind === "idle" ? prev : { kind: "idle" }));
  };

  const handleSave = async (): Promise<boolean> => {
    // 任何一次显式保存点击都把上一次测试 banner 关掉,反馈才能渲染出来
    // (saved / error 的渲染条件本来要求 testStatus.kind === "idle")。
    setTestStatus({ kind: "idle" });
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      // 输入为空 + 已配置 = 幂等成功(用户多半在测试后又点了一下保存);
      // 输入为空 + 未配置 = 真的什么都没填,报错。
      if (configured) {
        setStatus({ kind: "saved" });
        return true;
      }
      setStatus({
        kind: "error",
        message: "API Key 不能为空",
      });
      return false;
    }
    setStatus({ kind: "saving" });
    try {
      await saveASRCredentials({
        apiKey: trimmedKey,
        // Empty advanced fields reach the helper as undefined so it strips
        // them from the keychain JSON, letting Swift fall back to defaults.
        resourceId: resourceId.trim() || undefined,
        endpointPath: endpointPath.trim() || undefined,
      });
      setConfigured(true);
      // Clear the primary input so the next render re-shows the "已配置" hint
      // and doesn't echo the secret back at the user. Advanced fields are
      // not secrets — keep them visible so the user sees what's persisted.
      setApiKey("");
      setStatus({ kind: "saved" });
      return true;
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "保存失败",
      });
      return false;
    }
  };

  const handleTest = async () => {
    // If user has typed a new key, save it first so the probe tests the
    // value they're trying to use, not whatever stale entry sits in keychain.
    // If the input is empty, fall through to test the existing keychain
    // entry — that's the typical "I saved earlier, just verify it works" path.
    const hasInputCreds = apiKey.trim().length > 0;
    if (hasInputCreds) {
      const saved = await handleSave();
      if (!saved) return;
    } else if (!configured) {
      setTestStatus({
        kind: "error",
        code: "asr.credentials-missing",
        message: "请先填入 API Key 并保存",
      });
      return;
    }
    setTestStatus({ kind: "running" });
    const result = await testASRConnection();
    if (result.ok) {
      setTestStatus({ kind: "ok" });
    } else {
      setTestStatus({
        kind: "error",
        code: result.errorCode ?? "asr.unknown",
        message: result.errorMessage ?? "ASR 探测失败",
      });
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 40,
    padding: "0 12px",
    borderRadius: "var(--r-md)",
    border: "1px solid var(--line)",
    background: "var(--bg-elev)",
    color: "var(--ink-900)",
    fontSize: 13.5,
    fontFamily: "var(--f-mono)",
  };

  return (
    <section
      className="ds-card"
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}
    >
      <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--ink-900)" }}>
          ASR · 火山引擎语音识别凭证
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: "var(--ink-500)" }}>
          面试语音模式需要这把 key 调用火山语音(ASR 转写 + TTS 面试官音色合成)。
          与上方 LLM 的 ARK Key 互不通用,缺这把将无法语音录入,面试官也只能用系统默认女声。
        </p>
      </header>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-700)" }}>
          API Key
        </span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => {
            markDirty();
            setApiKey(e.target.value);
          }}
          placeholder={configured ? "已配置(留空保留现有凭证)" : "火山新版控制台的 X-Api-Key"}
          style={inputStyle}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
        />
      </label>

      {configured && !apiKey ? (
        <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
          ✓ 已在 macOS 钥匙串中配置 ASR / TTS API Key。
        </div>
      ) : null}

      <details
        open={advancedOpen}
        onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
        style={{
          padding: "10px 12px",
          borderRadius: "var(--r-md)",
          border: "1px solid var(--line)",
          background: "var(--bg-sunken)",
        }}
      >
        <summary
          style={{
            cursor: "pointer",
            fontSize: 12.5,
            fontWeight: 500,
            color: "var(--ink-700)",
            userSelect: "none",
          }}
        >
          高级 · Resource ID / Endpoint 覆盖(选填)
        </summary>
        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 12,
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-700)" }}>
              Resource ID
            </span>
            <input
              type="text"
              value={resourceId}
              onChange={(e) => {
                markDirty();
                setResourceId(e.target.value);
              }}
              placeholder="留空 → volc.seedasr.sauc.duration"
              style={{
                width: "100%",
                height: 36,
                padding: "0 12px",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--line)",
                background: "var(--bg-elev)",
                color: "var(--ink-900)",
                fontSize: 13,
                fontFamily: "var(--f-mono)",
              }}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-700)" }}>
              Endpoint 路径
            </span>
            <input
              type="text"
              value={endpointPath}
              onChange={(e) => {
                markDirty();
                setEndpointPath(e.target.value);
              }}
              placeholder="留空 → /api/v3/sauc/bigmodel_async"
              style={{
                width: "100%",
                height: 36,
                padding: "0 12px",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--line)",
                background: "var(--bg-elev)",
                color: "var(--ink-900)",
                fontSize: 13,
                fontFamily: "var(--f-mono)",
              }}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
        </div>
        <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--ink-500)", lineHeight: 1.6 }}>
          只在火山控制台显示的 Resource ID 与代码默认不同时才需要填。
          host 仍受 §A0.3 白名单约束(`openspeech.bytedance.com`),仅 path 可改。
          <br />
          ⚠️ 钥匙串里的 API Key 不会被读回 JS,
          要更新这里的高级字段,需要同时**重新粘贴一次** API Key 后保存。
        </div>
      </details>

      <div style={{ fontSize: 12.5, color: "var(--ink-500)", display: "flex", flexDirection: "column", gap: 4 }}>
        <div>
          没有 API Key?前往{" "}
          <a
            href="https://console.volcengine.com/speech/new/setting/apikeys"
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--brand)", textDecoration: "underline" }}
          >
            火山引擎新版控制台 · API Key 管理
          </a>{" "}
          创建一把 key,记得在「项目」里开通流式 ASR 与 TTS 服务。
        </div>
        <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-400)" }}>
          点不开?复制此链接到浏览器:https://console.volcengine.com/speech/new/setting/apikeys
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={() => { void handleSave(); }}
            disabled={!hydrated || status.kind === "saving" || testStatus.kind === "running"}
            style={{
              padding: "10px 18px",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--line)",
              background: "var(--bg-elev)",
              color: "var(--ink-900)",
              fontSize: 13.5,
              fontWeight: 500,
              cursor:
                !hydrated || status.kind === "saving" || testStatus.kind === "running"
                  ? "not-allowed"
                  : "pointer",
              opacity:
                !hydrated || status.kind === "saving" || testStatus.kind === "running"
                  ? 0.6
                  : 1,
            }}
          >
            {status.kind === "saving" ? "保存中..." : "保存"}
          </button>

          {(() => {
            const hasInputCreds = apiKey.trim().length > 0;
            const isRunning = testStatus.kind === "running";
            const canTest =
              hydrated &&
              !isRunning &&
              status.kind !== "saving" &&
              (hasInputCreds || configured);
            return (
              <button
                type="button"
                onClick={() => { void handleTest(); }}
                disabled={!canTest}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 18px",
                  borderRadius: "var(--r-md)",
                  border: "none",
                  background: canTest ? "var(--brand)" : "var(--ink-200)",
                  color: "white",
                  fontSize: 13.5,
                  fontWeight: 500,
                  cursor: canTest ? "pointer" : "not-allowed",
                }}
              >
                {isRunning ? <Loader2 size={14} className="spin" /> : null}
                {isRunning ? "测试中..." : "测试连接"}
              </button>
            );
          })()}
        </div>

        {/* 反馈区:已保存 / 保存错误 / 测试 banner 一并放按钮行下方;
            测试一旦出 banner 就接管反馈,避免「✓ 已保存」与「连接正常」并存。 */}
        {status.kind === "saved" && testStatus.kind === "idle" ? (
          <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--brand)" }}>
            ✓ 已保存
          </div>
        ) : null}
        {status.kind === "error" && testStatus.kind === "idle" ? (
          <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--warn)" }}>
            {status.message}
          </div>
        ) : null}
        {testStatus.kind === "ok" ? (
          <div style={resultBannerStyle(true)}>
            <strong>连接正常</strong>
            <span className="mono" style={{ marginLeft: 8 }}>
              · 已通过 SAUC WebSocket 握手
            </span>
          </div>
        ) : null}
        {testStatus.kind === "error" ? (
          <div style={resultBannerStyle(false)}>
            <strong>连接失败</strong>
            <span className="mono" style={{ marginLeft: 8 }}>
              [{testStatus.code}]
            </span>
            <div style={{ marginTop: 4 }}>{testStatus.message}</div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function InterviewExperienceSection(): JSX.Element {
  const [observerEnabled, setObserverEnabled] = useState<boolean>(true);
  const [observerHydrated, setObserverHydrated] = useState(false);
  const [observerSaving, setObserverSaving] = useState(false);
  const [observerError, setObserverError] = useState<string | null>(null);

  const [ttsEnabled, setTtsEnabled] = useState<boolean>(true);
  const [ttsHydrated, setTtsHydrated] = useState(false);
  const [ttsSaving, setTtsSaving] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);

  const [inputMode, setInputMode] = useState<InterviewInputMode>("voice");
  const [modeHydrated, setModeHydrated] = useState(false);
  const [modeSaving, setModeSaving] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);
  const [asrAvailable] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    getAppSetting<boolean>("observer_panel_enabled")
      .then((value) => {
        if (!mounted) return;
        setObserverEnabled(value === null || value === undefined ? true : Boolean(value));
      })
      .catch(() => {
        /* backend unavailable — default to on */
      })
      .finally(() => {
        if (mounted) setObserverHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    getAppSetting<boolean>("interviewer_tts_enabled")
      .then((value) => {
        if (!mounted) return;
        setTtsEnabled(value === null || value === undefined ? true : Boolean(value));
      })
      .catch(() => {
        /* backend unavailable — default to on */
      })
      .finally(() => {
        if (mounted) setTtsHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    getAppSetting<InterviewInputMode>("interview_input_mode")
      .then((value) => {
        if (!mounted) return;
        setInputMode(value === "text" ? "text" : "voice");
      })
      .catch(() => {
        /* backend unavailable — default to voice */
      })
      .finally(() => {
        if (mounted) setModeHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleObserverToggle = async () => {
    const next = !observerEnabled;
    setObserverEnabled(next);
    setObserverError(null);
    setObserverSaving(true);
    try {
      await putAppSetting<boolean>("observer_panel_enabled", next);
    } catch (err) {
      setObserverEnabled(!next);
      setObserverError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setObserverSaving(false);
    }
  };

  const handleTtsToggle = async () => {
    const next = !ttsEnabled;
    setTtsEnabled(next);
    setTtsError(null);
    setTtsSaving(true);
    try {
      await putAppSetting<boolean>("interviewer_tts_enabled", next);
    } catch (err) {
      setTtsEnabled(!next);
      setTtsError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setTtsSaving(false);
    }
  };

  const handleModeChange = async (next: InterviewInputMode) => {
    if (next === inputMode) return;
    const prev = inputMode;
    setInputMode(next);
    setModeError(null);
    setModeSaving(true);
    try {
      await putAppSetting<InterviewInputMode>("interview_input_mode", next);
    } catch (err) {
      setInputMode(prev);
      setModeError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setModeSaving(false);
    }
  };

  const voiceDisabledByBackend = asrAvailable === false;

  return (
    <section
      className="ds-card"
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}
    >
      <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2
          style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--ink-900)" }}
        >
          面试体验
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: "var(--ink-500)" }}>
          控制实时面试页的附加提示。这些开关只影响 UI,不改变面试评估本身。
        </p>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink-900)" }}>
            面试语音模式
          </span>
          <span style={{ fontSize: 12, color: "var(--ink-500)", lineHeight: 1.6 }}>
            语音模式下,点击「开始录音」开始,再次点击停止。AI 会实时显示字幕并自动生成答案。
            文字模式则沿用文本框输入。
          </span>
        </div>
        <div
          role="radiogroup"
          aria-label="面试语音模式"
          style={{
            display: "inline-flex",
            alignSelf: "flex-start",
            padding: 3,
            gap: 2,
            borderRadius: "var(--r-pill)",
            background: "var(--bg-sunken)",
            border: "1px solid var(--line)",
            opacity: modeHydrated && !modeSaving ? 1 : 0.7,
          }}
        >
          {(["voice", "text"] as const).map((value) => {
            const selected = inputMode === value;
            const optionDisabled =
              value === "voice" ? voiceDisabledByBackend : false;
            const effectiveDisabled =
              !modeHydrated || modeSaving || (optionDisabled && !selected);
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={effectiveDisabled}
                onClick={() => {
                  void handleModeChange(value);
                }}
                style={{
                  padding: "6px 14px",
                  borderRadius: "var(--r-pill)",
                  border: "none",
                  background: selected ? "var(--bg-elev)" : "transparent",
                  color: selected ? "var(--ink-900)" : "var(--ink-500)",
                  fontSize: 12.5,
                  fontWeight: selected ? 500 : 400,
                  cursor: effectiveDisabled ? "not-allowed" : "pointer",
                  boxShadow: selected ? "var(--shadow-xs)" : "none",
                }}
              >
                {value === "voice" ? "语音" : "文字"}
              </button>
            );
          })}
        </div>

        {voiceDisabledByBackend ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--warn)",
              background: "var(--warn-softer)",
              border: "1px solid var(--warn)",
              padding: "8px 12px",
              borderRadius: "var(--r-sm)",
              lineHeight: 1.6,
            }}
          >
            ⚠️ 服务端未配置 Azure Speech,语音模式不可用。请参考 README 在
            <span className="mono"> .env </span>中补上
            <span className="mono"> AZURE_SPEECH_KEY </span>
            和
            <span className="mono"> AZURE_SPEECH_REGION </span>
            后重启后端。
          </div>
        ) : null}

        {modeError ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--warn)",
              background: "var(--warn-soft)",
              padding: "8px 12px",
              borderRadius: "var(--r-sm)",
            }}
          >
            {modeError}
          </div>
        ) : null}
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "10px 0",
          cursor: ttsHydrated && !ttsSaving ? "pointer" : "not-allowed",
        }}
      >
        <input
          type="checkbox"
          role="switch"
          checked={ttsEnabled}
          disabled={!ttsHydrated || ttsSaving}
          onChange={handleTtsToggle}
          style={{ width: 18, height: 18, cursor: "inherit" }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink-900)" }}>
            面试官语音播报
          </span>
          <span style={{ fontSize: 12, color: "var(--ink-500)", lineHeight: 1.6 }}>
            新问题出现时用系统中文语音朗读,增强临场感。开始录音会自动停止朗读。
          </span>
        </div>
      </label>

      {ttsError ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--warn)",
            background: "var(--warn-soft)",
            padding: "8px 12px",
            borderRadius: "var(--r-sm)",
          }}
        >
          {ttsError}
        </div>
      ) : null}

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "10px 0",
          cursor: observerHydrated && !observerSaving ? "pointer" : "not-allowed",
        }}
      >
        <input
          type="checkbox"
          role="switch"
          checked={observerEnabled}
          disabled={!observerHydrated || observerSaving}
          onChange={handleObserverToggle}
          style={{ width: 18, height: 18, cursor: "inherit" }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink-900)" }}>
            AI 观察侧栏
          </span>
          <span style={{ fontSize: 12, color: "var(--ink-500)", lineHeight: 1.6 }}>
            每轮作答完,AI 会在右侧给一句 ≤ 60 字的轻量反馈。关掉则不显示侧栏。
          </span>
        </div>
      </label>

      {observerError ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--warn)",
            background: "var(--warn-soft)",
            padding: "8px 12px",
            borderRadius: "var(--r-sm)",
          }}
        >
          {observerError}
        </div>
      ) : null}
    </section>
  );
}


// V32.M2.3.5 (F-320) — Research opt-in toggle.
//
// Hydrates from Bridge → DatabaseService on mount and mirrors into the
// Zustand store so ParsedPanel can react instantly without re-fetching.
// The first time the user flips the toggle ON we open PrivacyOptInDialog;
// only after they confirm does the PUT fire. Flipping OFF is a one-step
// write (no confirmation) — disabling a network feature is always safe
// to make easy.
export function ResearchOptInSection(): JSX.Element {
  const researchOptIn = useAppStore((s) => s.researchOptIn);
  const setStoreOptIn = useAppStore((s) => s.setResearchOptIn);

  const [hydrated, setHydrated] = useState(false);
  const [pendingEnable, setPendingEnable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    // Mount-time reset: an `error` left over from a transient PUT
    // failure (HMR window, router restart) shouldn't stick across
    // page navigations or hot-edits. The next genuine save will
    // re-set it; until then we render a clean section.
    setError(null);
    getResearchOptIn()
      .then(({ enabled }) => {
        if (!mounted) return;
        setStoreOptIn(enabled);
      })
      .catch(() => {
        /* backend unavailable — default-off */
      })
      .finally(() => {
        if (mounted) setHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, [setStoreOptIn]);

  const persist = async (next: boolean) => {
    setSaving(true);
    setError(null);
    try {
      await putResearchOptIn(next);
      setStoreOptIn(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (next: boolean) => {
    // Any new user interaction supersedes a stale error from a prior
    // attempt (HMR window, transient backend reload, etc.). Without
    // this, an old "Request failed" inline error sticks forever even
    // after the user opens the modal again or toggles back.
    setError(null);
    if (next && !researchOptIn) {
      // Flipping ON requires the privacy modal to surface the L0 A11
      // contract and the user's explicit confirmation.
      setPendingEnable(true);
      return;
    }
    void persist(next);
  };

  return (
    <section
      className="card card-pad"
      data-testid="research-opt-in-section"
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <header>
        <div className="eyebrow">联网情报检索</div>
        <h2 className="h3" style={{ margin: "4px 0 0" }}>
          公司 / 行业洞察(opt-in)
        </h2>
      </header>

      <p
        className="muted"
        style={{ fontSize: 13, lineHeight: 1.55, margin: 0 }}
      >
        启用后,Eatit 会在解析阶段把 JD 中的公司名 / 岗位名 / 行业关键词
        发送给你的大模型,触发联网搜索。结果会在解析页加 3 块卡(公司洞察 /
        行业洞察 / 预测题库)。简历内容与 PII 永远不出本地。
      </p>

      <label
        className="row"
        style={{
          gap: 12,
          alignItems: "center",
          marginTop: 4,
          cursor: hydrated && !saving ? "pointer" : "wait",
        }}
      >
        <input
          type="checkbox"
          checked={researchOptIn}
          disabled={!hydrated || saving}
          onChange={(e) => handleChange(e.target.checked)}
          data-testid="research-opt-in-toggle"
        />
        <span style={{ fontSize: 13.5, color: "var(--ink-900)" }}>
          {researchOptIn ? "已启用" : "未启用"}
        </span>
        {saving ? (
          <span className="muted" style={{ fontSize: 12 }}>
            保存中…
          </span>
        ) : null}
      </label>

      {error ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--warn)",
            background: "var(--warn-soft)",
            padding: "8px 12px",
            borderRadius: "var(--r-sm)",
          }}
        >
          {error}
        </div>
      ) : null}

      <PrivacyOptInDialog
        open={pendingEnable}
        onConfirm={() => {
          setPendingEnable(false);
          void persist(true);
        }}
        onCancel={() => setPendingEnable(false)}
      />
    </section>
  );
}
