/**
 * DimensionSidebar — M8.4
 *
 * Sticky right-hand panel showing the 5 evaluation dimensions + overall
 * score. Placed in the `aside.dimension-sidebar` slot of the report-layout
 * grid. At < 1100 px the parent grid collapses to single column and this
 * element flows naturally into the document stream.
 *
 * L0 red line: dimension names come directly from payload.dimensions[].name
 * — no i18n, no renaming.
 */
import type { Chip, DimensionName } from "@eatit/shared-types";

interface Dimension {
  name: DimensionName;
  description: string;
  score: number;
  evidence_chips: Chip[];
}

interface Props {
  dimensions: ReadonlyArray<Dimension>;
  overallScore?: number | null;
}

export function DimensionSidebar({ dimensions, overallScore }: Props): JSX.Element {
  return (
    <div
      className="dimension-sidebar"
      style={{
        position: "sticky",
        top: 24,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        className="ds-card"
        style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}
      >
        <div className="muted" style={{ fontSize: 11.5 }}>
          维度评分
        </div>

        {overallScore != null && (
          <div
            className="row"
            style={{ gap: 8, alignItems: "baseline", paddingBottom: 10, borderBottom: "1px solid var(--line)" }}
          >
            <span style={{ fontSize: 11.5, color: "var(--ink-500)" }}>总分</span>
            <span
              className="mono"
              style={{ fontSize: 22, fontWeight: 700, color: "var(--ink-900)" }}
            >
              {overallScore}
            </span>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {dimensions.map((d) => {
            const color =
              d.score >= 80
                ? "var(--brand)"
                : d.score >= 65
                  ? "var(--ink-700)"
                  : "var(--warn)";
            return (
              <div key={d.name} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div
                  className="row between"
                  style={{ gap: 8 }}
                >
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: "var(--ink-900)",
                    }}
                  >
                    {/* L0: render name directly from payload — no translation */}
                    {d.name}
                  </span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color,
                      minWidth: 26,
                      textAlign: "right",
                    }}
                  >
                    {d.score}
                  </span>
                </div>
                <div className="bar">
                  <i style={{ width: `${d.score}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
