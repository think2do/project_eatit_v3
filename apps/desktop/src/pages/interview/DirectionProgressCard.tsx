// V32.M1.1.X-followup — right-rail "提问方向进度" card.
// design-reference/page-live.jsx:
//   header eyebrow + "实时" mono badge
//   per-direction row: bullet (active) + name + done/total mono + bar
//
// We don't have ground-truth per-direction completion from the backend
// (FrameworkAgent's plan groups stages, not directions). The component
// is therefore a *projection*: split the planned turn budget evenly
// across the user's selected directions, light up the first direction
// as active, and show subsequent ones as queued (done=0). This matches
// the design-ref shape without lying to the user about exact mapping.

export type DirectionRow = {
  /** v3.2 direction id (`ai-insight` etc.) — used as React key. */
  id: string;
  /** 中文 label rendered to the user. */
  label: string;
  /** Number of turns "answered" against this direction. */
  done: number;
  /** Planned turn count for this direction. */
  total: number;
  /** Whether the direction is the current focus (renders bullet). */
  active?: boolean;
};

export interface DirectionProgressCardProps {
  rows: DirectionRow[];
}

export function DirectionProgressCard({
  rows,
}: DirectionProgressCardProps): JSX.Element {
  return (
    <section
      className="card"
      data-testid="direction-progress-card"
      style={{ padding: "18px 20px" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <span className="eyebrow">提问方向进度</span>
        <span className="muted mono" style={{ fontSize: 11 }}>
          实时
        </span>
      </div>

      {rows.map((row) => {
        const pct = row.total > 0 ? (row.done / row.total) * 100 : 0;
        return (
          <div
            key={row.id}
            data-testid={`direction-progress-row-${row.id}`}
            data-active={row.active ? "true" : "false"}
            style={{ marginBottom: 10 }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: row.active ? 600 : 400,
                  color: row.active
                    ? "var(--ink-900)"
                    : "var(--ink-700)",
                }}
              >
                {row.active ? (
                  <span
                    style={{
                      color: "var(--brand)",
                      marginRight: 4,
                    }}
                    aria-hidden="true"
                  >
                    ●
                  </span>
                ) : null}
                {row.label}
              </span>
              <span
                className="mono"
                style={{ fontSize: 11, color: "var(--ink-500)" }}
              >
                {row.done}/{row.total}
              </span>
            </div>
            <div className="bar">
              <i style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
            </div>
          </div>
        );
      })}
    </section>
  );
}
