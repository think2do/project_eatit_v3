/**
 * Compact dimension overview that sits next to the HeroScoreCard at the
 * top of ReportPage (replaces the previous full-width 维度分析 card).
 *
 * Each row: dimension name + horizontal bar + score number. No description
 * or evidence chips here — those are intentionally dropped so the body of
 * the page can foreground 逐题复盘 instead of competing with this block.
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
}

export function DimensionsSummaryCard({ dimensions }: Props): JSX.Element {
  return (
    <div
      className="card card-pad"
      style={{
        flex: 1,
        minWidth: 280,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div className="muted" style={{ fontSize: 11.5 }}>
        维度分析
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 2 }}>
        {dimensions.map((d) => {
          const tone =
            d.score >= 80 ? "brand" : d.score >= 65 ? "neutral" : "warn";
          const color =
            tone === "brand"
              ? "var(--brand)"
              : tone === "warn"
                ? "var(--warn)"
                : "var(--ink-700)";
          return (
            <div
              key={d.name}
              className="row"
              style={{ gap: 10, alignItems: "center" }}
            >
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: "var(--ink-900)",
                  flexShrink: 0,
                  minWidth: 88,
                }}
              >
                {d.name}
              </span>
              <div className="bar" style={{ flex: 1 }}>
                <i style={{ width: `${d.score}%`, background: color }} />
              </div>
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
          );
        })}
      </div>
    </div>
  );
}
