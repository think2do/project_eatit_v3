import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { putAppSetting } from "@/api/appSettings";

interface Props {
  onBack: () => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "error"; message: string };

export function StepDone({ onBack }: Props): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const handleFinish = async () => {
    setStatus({ kind: "saving" });
    try {
      const now = new Date().toISOString();
      await putAppSetting("onboarding_completed_at", now);
      queryClient.setQueryData(["app-settings", "onboarding_completed_at"], now);
      navigate("/", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存失败";
      setStatus({ kind: "error", message });
    }
  };

  const saving = status.kind === "saving";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div className="eyebrow">04 · 完成</div>
        <h1
          className="h-serif"
          style={{
            fontSize: 44,
            lineHeight: 1.05,
            fontWeight: 400,
            margin: "12px 0 8px",
            color: "var(--ink-900)",
          }}
        >
          一切就绪
        </h1>
        <p style={{ fontSize: 14.5, color: "var(--ink-500)", maxWidth: 560, margin: 0 }}>
          你可以随时在「设置」里调整 Provider、切换模型,或清空本地数据。
        </p>
      </div>

      <div
        className="ds-card"
        style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}
      >
        <div style={{ fontSize: 13.5, color: "var(--ink-700)", fontWeight: 500 }}>
          接下来你可以:
        </div>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 13.5,
            color: "var(--ink-700)",
          }}
        >
          <li>· 在「上传与解析」上传简历 + JD,让 AI 先通读一遍</li>
          <li>· 在「面试配置」选择面试风格 / 方向 / 时长</li>
          <li>· 点「开始面试」进入实时面试界面</li>
        </ul>
      </div>

      {status.kind === "error" ? (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "var(--r-md)",
            background: "var(--warn-soft)",
            color: "var(--warn)",
            border: "1px solid var(--warn)",
            fontSize: 13,
          }}
        >
          保存失败:{status.message}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 12 }}>
        <button
          type="button"
          onClick={onBack}
          disabled={saving}
          style={{
            padding: "10px 18px",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--line)",
            background: "var(--bg-elev)",
            color: "var(--ink-900)",
            fontSize: 13.5,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          返回
        </button>
        <button
          type="button"
          onClick={handleFinish}
          disabled={saving}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "11px 22px",
            borderRadius: "var(--r-md)",
            border: "none",
            background: "var(--brand)",
            color: "white",
            fontSize: 14,
            fontWeight: 500,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? <Loader2 size={14} className="spin" /> : null}
          {saving ? "保存中..." : "进入主界面"}
        </button>
      </div>
    </div>
  );
}
