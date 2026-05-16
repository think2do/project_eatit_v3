import { AlertCircle } from "lucide-react";

import { Spinner } from "@/components/Spinner";
import { TipsCarousel } from "@/components/TipsCarousel";
import { selectTips } from "@/lib/tips";

interface Props {
  stage: 1 | 2 | 3;
  error?: string | null;
  onBack?: () => void;
}

const STAGES = [
  { id: 1, active: "正在生成面试框架…", done: "面试框架已就绪" },
  { id: 2, active: "正在准备开场问题…", done: "开场问题已就绪" },
  { id: 3, active: "正在预热参考答案…", done: "参考答案已接通" },
] as const;

const tips = selectTips("parsing", 0);

export function WarmupOverlay({ stage, error, onBack }: Props): JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="预热界面"
      data-testid="warmup-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "rgba(15, 23, 42, 0.42)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: "var(--bg-elev)",
          borderRadius: "var(--r-lg)",
          border: "1px solid var(--line)",
          boxShadow: "var(--shadow-lg)",
          padding: 28,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-900)" }}>
            正在为你准备这场面试…
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 4 }}>
            通常 30~90 秒，请稍候。
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {STAGES.map((s) => {
            if (s.id < stage) {
              return (
                <div
                  key={s.id}
                  data-testid={`warmup-stage-${s.id}`}
                  data-state="done"
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <span
                    aria-hidden
                    style={{ color: "var(--brand)", fontWeight: 700, fontSize: 15 }}
                  >
                    ✓
                  </span>
                  <span style={{ fontSize: 13.5, color: "var(--ink-900)" }}>
                    {s.done}
                  </span>
                </div>
              );
            }

            if (s.id === stage) {
              if (error) {
                return (
                  <div
                    key={s.id}
                    data-testid={`warmup-stage-${s.id}`}
                    data-state="error"
                    style={{ display: "flex", alignItems: "flex-start", gap: 8 }}
                  >
                    <AlertCircle
                      size={16}
                      aria-hidden
                      style={{ color: "var(--brand)", flexShrink: 0, marginTop: 2 }}
                    />
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={{ fontSize: 13.5, color: "var(--ink-900)" }}>
                        {error}
                      </span>
                      {onBack && (
                        <button className="btn" onClick={onBack}>
                          返回配置
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={s.id}
                  data-testid={`warmup-stage-${s.id}`}
                  data-state="active"
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <Spinner size={16} />
                  <span style={{ fontSize: 13.5, color: "var(--ink-900)" }}>
                    {s.active}
                  </span>
                </div>
              );
            }

            // s.id > stage — pending
            return (
              <div
                key={s.id}
                data-testid={`warmup-stage-${s.id}`}
                data-state="pending"
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--ink-200)",
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 13.5, color: "var(--ink-500)" }}>
                  {s.active}
                </span>
              </div>
            );
          })}
        </div>

        <TipsCarousel tips={tips} size="full" />
      </div>
    </div>
  );
}
