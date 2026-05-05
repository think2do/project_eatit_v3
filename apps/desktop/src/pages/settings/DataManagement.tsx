import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteLLMConfig } from "@/lib/llm/config";

const FALLBACK_PATH = "项目 .data/";

async function resolveLocalDataDir(): Promise<string> {
  // §A0 永久排除 Tauri: @tauri-apps/api/path 已废弃。
  // macOS 沙盒容器路径由系统决定,用户视图中显示 fallback 字符串即可;
  // 真实路径由 Swift Bridge 内部使用,不需 surface 给 JS。
  // TODO M5: 若 UX 需要展示真实路径,新增 Bridge 方法 app.dataDirectory()。
  return FALLBACK_PATH;
}

type Feedback =
  | { kind: "idle" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

export function DataManagement(): JSX.Element {
  const [path, setPath] = useState<string>(FALLBACK_PATH);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });

  useEffect(() => {
    let mounted = true;
    resolveLocalDataDir().then((p) => {
      if (mounted) setPath(p);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleWipe = async () => {
    setConfirmOpen(false);
    try {
      await deleteLLMConfig();
      setFeedback({
        kind: "ok",
        message: "已清除本地钥匙串中的 LLM 配置。完整数据清空功能建设中。",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "清除失败";
      setFeedback({ kind: "error", message });
    }
  };

  return (
    <section
      className="ds-card"
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
    >
      <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2
          style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--ink-900)" }}
        >
          数据管理
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: "var(--ink-500)" }}>
          所有面试记录与解析结果都保存在你本机的 SQLite 数据库中,Eatit 不会上传。
        </p>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12, color: "var(--ink-500)" }}>本地数据目录</span>
        <code
          className="mono"
          style={{
            padding: "10px 12px",
            background: "var(--bg-sunken)",
            borderRadius: "var(--r-sm)",
            fontSize: 12.5,
            color: "var(--ink-700)",
            wordBreak: "break-all",
          }}
        >
          {path}
        </code>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled
          title="功能建设中"
          style={{
            padding: "9px 16px",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--line)",
            background: "var(--bg-elev)",
            color: "var(--ink-400)",
            fontSize: 13,
            cursor: "not-allowed",
          }}
        >
          导出(建设中)
        </button>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          style={{
            padding: "9px 16px",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--warn)",
            background: "var(--warn-softer)",
            color: "var(--warn)",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          清空本地数据
        </button>
      </div>

      {feedback.kind !== "idle" ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: "var(--r-md)",
            fontSize: 12.5,
            background:
              feedback.kind === "ok" ? "var(--brand-softer)" : "var(--warn-softer)",
            color:
              feedback.kind === "ok" ? "var(--brand-ink)" : "var(--warn)",
          }}
        >
          {feedback.message}
        </div>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确定清空?</DialogTitle>
            <DialogDescription>
              这会清除本地钥匙串中保存的 LLM 配置。面试记录清空功能仍在建设中。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter style={{ gap: 8 }}>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              style={{
                padding: "9px 16px",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--line)",
                background: "var(--bg-elev)",
                color: "var(--ink-900)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleWipe}
              style={{
                padding: "9px 16px",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--warn)",
                background: "var(--warn)",
                color: "white",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              确认清空
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
