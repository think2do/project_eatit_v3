/**
 * F-312 V32.M1.3 — DimensionRow.
 *
 * One row of the report's "维度分析" card: 5 dimensions × 0-100 score
 * + 1-6 evidence chips. The five dimension names are an A8 L0 red
 * line; this component is the read-side: it just renders whatever
 * the backend's `normalize_dimensions` produces.
 */
import type { Chip, DimensionName } from "@eatit/shared-types";

interface DimensionRowProps {
  name: DimensionName;
  description: string;
  score: number;
  evidenceChips: Chip[];
}

export function DimensionRow({
  name,
  description,
  score,
  evidenceChips,
}: DimensionRowProps): JSX.Element {
  // Three-tone bucket mirrors the backend pass-likelihood thresholds
  // and the design-reference page-report.jsx prototype: brand for
  // strong rows, ink-700 for neutral, warn for sub-65.
  const tone = score >= 80 ? "brand" : score >= 65 ? "neutral" : "warn";
  const colorVar =
    tone === "brand"
      ? "var(--brand)"
      : tone === "warn"
        ? "var(--warn)"
        : "var(--ink-700)";

  return (
    <div style={{ padding: "14px 0", borderBottom: "1px dashed var(--line)" }}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{name}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {description}
          </div>
        </div>
        <div
          className="row"
          style={{ gap: 10, minWidth: 220, justifyContent: "flex-end" }}
        >
          <div className="bar" style={{ width: 140 }}>
            <i style={{ width: `${score}%`, background: colorVar }} />
          </div>
          <span
            className="mono"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: colorVar,
              minWidth: 26,
              textAlign: "right",
            }}
          >
            {score}
          </span>
        </div>
      </div>
      <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
        {evidenceChips.map((c, i) => (
          <span
            key={`${c.text}-${i}`}
            className={`tag ${c.good ? "tag-green" : "tag-warn"}`}
            style={{ fontSize: 10.5 }}
          >
            {c.good ? "+" : "−"} {c.text}
          </span>
        ))}
      </div>
    </div>
  );
}
