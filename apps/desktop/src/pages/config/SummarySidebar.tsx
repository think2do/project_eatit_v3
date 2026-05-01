// V32.M1.1.X audit-fix — sticky right pane on ConfigPage.
// PRD F-307 §M1.1 spec called for SummaryRow×5 + 小建议 + 主 CTA + 配额提示;
// the original M1.1 commit (11b134a) shipped the 3 left-side Sections only.
// This sidebar closes the gap.

import { Mic } from "lucide-react";
import type { InterviewDirectionV32, InterviewDurationV32 } from "@eatit/shared-types";
import { getRemainingQuotaMock, readQuotaMock } from "@/lib/quotaMock";

export interface SummarySidebarProps {
  /** "Notion · 高级产品经理" — derived from JD parse; falls back to "—". */
  jobTitle: string | null;
  /** Pre-resolved style label (e.g. "结构化面试官"). */
  styleLabel: string;
  /** Direction chips, in user-pick order. Empty array shows "—". */
  directions: { value: InterviewDirectionV32; label: string }[];
  /** 15 / 30 / 45. */
  durationMinutes: InterviewDurationV32;
  /** Aggregate validity gate (asset uploaded + parse succeeded + 1≤dirs≤3). */
  ready: boolean;
  /** Whether a createSession request is in-flight. */
  submitting: boolean;
  /** Click handler for the main CTA. */
  onStart: () => void;
}

const QUESTION_RANGES: Record<InterviewDurationV32, string> = {
  15: "3~4 题",
  30: "6~8 题",
  45: "10~12 题",
  60: "含 case · 12+ 题",
};

export function SummarySidebar({
  jobTitle,
  styleLabel,
  directions,
  durationMinutes,
  ready,
  submitting,
  onStart,
}: SummarySidebarProps): JSX.Element {
  const quota = readQuotaMock();
  const remaining = getRemainingQuotaMock();

  return (
    <aside
      data-testid="config-summary-sidebar"
      style={{
        position: "sticky",
        top: 24,
        alignSelf: "flex-start",
        width: 320,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: 20,
        background: "#fff",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <header>
        <div className="eyebrow">面试预览</div>
        <h2
          className="h2"
          style={{ margin: "4px 0 0", fontSize: 22, lineHeight: 1.3 }}
        >
          将开始一场…
        </h2>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <SummaryRow label="岗位" value={jobTitle ?? "—"} />
        <SummaryRow label="风格" value={styleLabel} />
        <SummaryRow
          label="方向"
          value={
            directions.length === 0 ? (
              "—"
            ) : (
              <div data-testid="summary-directions">
                <div style={{ color: "var(--ink-900)" }}>{directions.length} 项</div>
                <div
                  style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}
                >
                  {directions.map((d) => (
                    <span
                      key={d.value}
                      className="tag tag-info"
                      data-testid={`summary-direction-chip-${d.value}`}
                    >
                      {d.label}
                    </span>
                  ))}
                </div>
              </div>
            )
          }
        />
        <SummaryRow label="时长" value={`${durationMinutes} 分钟`} />
        <SummaryRow label="预计" value={QUESTION_RANGES[durationMinutes]} />
      </div>

      <div
        style={{
          padding: "10px 12px",
          borderRadius: "var(--r-md)",
          background: "var(--brand-softer)",
          border: "1px solid var(--brand)",
          color: "var(--ink-900)",
          fontSize: 12.5,
          lineHeight: 1.55,
        }}
        data-testid="summary-tip"
      >
        💡 <strong>小建议</strong>
        <div style={{ marginTop: 4 }}>
          找一个不会被打扰的环境,准备好麦克风。Eatit 会录制语音用于分析,但不会外传。
        </div>
      </div>

      <button
        type="button"
        className={ready && !submitting ? "btn btn-brand btn-lg" : "btn btn-lg"}
        onClick={onStart}
        disabled={!ready || submitting}
        data-testid="summary-start-cta"
        style={{
          width: "100%",
          justifyContent: "center",
          ...(!ready || submitting ? { opacity: 0.5, cursor: "not-allowed" } : {}),
        }}
      >
        <Mic size={14} />
        {submitting ? "生成面试框架…" : "开始模拟面试"}
      </button>

      <div
        className="muted"
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
        }}
        data-testid="summary-quota-row"
      >
        <span>开始后会扣除 1 次额度</span>
        <span style={{ fontFamily: "var(--f-mono)" }}>
          剩余 {remaining}/{quota.limit}
        </span>
      </div>
    </aside>
  );
}

interface SummaryRowProps {
  label: string;
  value: React.ReactNode;
}

function SummaryRow({ label, value }: SummaryRowProps): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 12,
        fontSize: 13,
        borderBottom: "1px solid var(--line)",
        paddingBottom: 8,
      }}
      data-testid={`summary-row-${label}`}
    >
      <span style={{ color: "var(--ink-500)", flexShrink: 0 }}>{label}</span>
      <span
        style={{
          color: "var(--ink-900)",
          textAlign: "right",
          fontWeight: 500,
        }}
      >
        {value}
      </span>
    </div>
  );
}
