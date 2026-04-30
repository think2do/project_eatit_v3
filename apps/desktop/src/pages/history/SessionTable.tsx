import { ChevronRight } from "lucide-react";

// F-316 V32.M3.1.4 — Dashboard session table. PRD §6.4:
// 6 列 grid:岗位·风格 / 日期 / 时长 / 评分 / 弱项 / 操作
//
// The columns are layout-driven (not <table>) so the design system's
// hover / focus rings stay consistent with .tile / .card. Each row is a
// keyboard-accessible button that routes to the per-session report.

export type SessionTableRow = {
  id: string;
  // ``岗位·风格`` — pre-formatted by the page so this component stays
  // ignorant of config_snapshot shape evolution.
  jobAndStyle: string;
  // ISO timestamp; rendered as "M月D日 HH:mm" via the page's formatter
  // and handed in pre-formatted to keep this component pure.
  dateLabel: string;
  // "30 分钟" / "—"
  durationLabel: string;
  // 0-100 or null (report not ready). Rendered as "—" when null.
  overallScore: number | null;
  // ≤ 2 weakness chips; the page slices to keep the row tidy.
  weaknesses: string[];
  // Status-driven badge text ("报告就绪" / "报告生成中" / etc.).
  statusLabel: string;
  // ``starred`` lights the row's right edge so users can scan pinned
  // sessions at a glance. Pin action lands in M4.
  starred: boolean;
};

export type SessionTableProps = {
  rows: SessionTableRow[];
  onOpenRow: (id: string) => void;
  // Empty-state message when the active filter tab has zero rows.
  emptyMessage?: string;
};

const COLUMN_TEMPLATE =
  "minmax(180px, 1.5fr) 120px 80px 80px minmax(160px, 1fr) 36px";

export function SessionTable({
  rows,
  onOpenRow,
  emptyMessage = "当前筛选下没有面试记录",
}: SessionTableProps): JSX.Element {
  return (
    <div
      className="card"
      data-testid="session-table"
      style={{ padding: 0, overflow: "hidden" }}
    >
      <div
        role="row"
        aria-label="表头"
        style={{
          display: "grid",
          gridTemplateColumns: COLUMN_TEMPLATE,
          gap: 12,
          padding: "12px 18px",
          borderBottom: "1px solid var(--line)",
          background: "var(--bg-sunken)",
        }}
      >
        <HeaderCell>岗位 · 风格</HeaderCell>
        <HeaderCell>日期</HeaderCell>
        <HeaderCell>时长</HeaderCell>
        <HeaderCell>评分</HeaderCell>
        <HeaderCell>弱项</HeaderCell>
        <HeaderCell aria-label="操作" />
      </div>

      {rows.length === 0 ? (
        <div
          data-testid="session-table-empty"
          className="muted"
          style={{
            padding: "28px 18px",
            textAlign: "center",
            fontSize: 13,
          }}
        >
          {emptyMessage}
        </div>
      ) : (
        rows.map((row) => (
          <div
            key={row.id}
            role="button"
            tabIndex={0}
            data-testid={`session-row-${row.id}`}
            data-starred={row.starred ? "true" : "false"}
            onClick={() => onOpenRow(row.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenRow(row.id);
              }
            }}
            style={{
              display: "grid",
              gridTemplateColumns: COLUMN_TEMPLATE,
              gap: 12,
              padding: "14px 18px",
              alignItems: "center",
              cursor: "pointer",
              borderBottom: "1px solid var(--line)",
              borderLeft: row.starred
                ? "3px solid var(--brand)"
                : "3px solid transparent",
              background: "var(--bg-elev)",
              transition: "background 120ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-sunken)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--bg-elev)";
            }}
          >
            <div
              className="col"
              style={{ gap: 4, minWidth: 0 }}
            >
              <span
                style={{
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: "var(--ink-900)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={row.jobAndStyle}
              >
                {row.jobAndStyle}
              </span>
              <span className="muted" style={{ fontSize: 11.5 }}>
                {row.statusLabel}
              </span>
            </div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {row.dateLabel}
            </div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {row.durationLabel}
            </div>
            <div
              data-testid={`session-row-${row.id}-score`}
              style={{
                fontFamily: "var(--f-serif)",
                fontSize: 18,
                color:
                  row.overallScore == null
                    ? "var(--ink-400)"
                    : "var(--ink-900)",
              }}
            >
              {row.overallScore == null ? "—" : row.overallScore}
            </div>
            <div className="row wrap" style={{ gap: 4 }}>
              {row.weaknesses.length === 0 ? (
                <span className="muted" style={{ fontSize: 12 }}>—</span>
              ) : (
                row.weaknesses.slice(0, 2).map((w) => (
                  <span key={w} className="tag tag-warn">
                    {w}
                  </span>
                ))
              )}
            </div>
            <ChevronRight size={16} color="var(--ink-400)" />
          </div>
        ))
      )}
    </div>
  );
}

function HeaderCell({
  children,
  ...rest
}: {
  children?: React.ReactNode;
  "aria-label"?: string;
}): JSX.Element {
  return (
    <div
      className="eyebrow"
      style={{ fontSize: 10.5 }}
      {...rest}
    >
      {children}
    </div>
  );
}
