// F-322 V32.M3.2.3 — ReportPage 顶部 segment 控件,切换 [评估报告] /
// [详细复盘] 两个视图。设计系统沿用 .row + .btn 共享类的扩展风格(类似
// HistoryPage 的 FilterTabs,但容器更窄、字号更小)。
//
// 通用 2 项 segment control,值由调用方驱动。M3.2.3 的两项是
// "评估报告" + "详细复盘"。M4 若需要更多 tab,这个组件也能直接接 N 项。

import type { ReactNode } from "react";

export type SegmentTab<TValue extends string> = {
  value: TValue;
  label: ReactNode;
  // Optional badge (e.g. "新" / pending dot) drawn after the label.
  badge?: ReactNode;
};

export type SegmentTabsProps<TValue extends string> = {
  tabs: SegmentTab<TValue>[];
  active: TValue;
  onChange: (value: TValue) => void;
  ariaLabel?: string;
};

export function SegmentTabs<TValue extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
}: SegmentTabsProps<TValue>): JSX.Element {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel ?? "切换视图"}
      data-testid="segment-tabs"
      className="row"
      style={{
        gap: 4,
        padding: 4,
        background: "var(--bg-sunken)",
        borderRadius: "var(--r-md)",
        width: "fit-content",
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.value === active;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-testid={`segment-tab-${tab.value}`}
            onClick={() => onChange(tab.value)}
            style={{
              border: "1px solid transparent",
              borderRadius: "var(--r-sm)",
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              background: isActive ? "var(--bg-elev)" : "transparent",
              color: isActive ? "var(--ink-900)" : "var(--ink-500)",
              cursor: "pointer",
              borderColor: isActive ? "var(--line)" : "transparent",
              boxShadow: isActive ? "var(--shadow-xs)" : "none",
              transition: "all 120ms ease",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {tab.label}
            {tab.badge != null ? (
              <span
                aria-hidden
                style={{ fontSize: 11, color: "var(--ink-400)" }}
              >
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
