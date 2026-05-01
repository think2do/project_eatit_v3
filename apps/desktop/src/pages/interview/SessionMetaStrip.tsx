interface Props {
  jobTitle: string;
  personaName: string;
  styleLabel: string;
  currentTurn: number;
  totalTurns: number;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Three-segment meta strip: 当前岗位 / 面试官 风格+名 / 进度 X/Y + bar.
 * `divider-v` separators are 28px tall to match the eyebrow + value
 * stack height. Progress bar uses the shared `.bar` class (M0.1d).
 */
export function SessionMetaStrip({
  jobTitle,
  personaName,
  styleLabel,
  currentTurn,
  totalTurns,
}: Props): JSX.Element {
  const safeTotal = totalTurns > 0 ? totalTurns : 1;
  const progressPct = clamp01(currentTurn / safeTotal) * 100;
  return (
    <div className="row between" style={{ marginBottom: 18 }}>
      <div className="row" style={{ gap: 16 }}>
        <div>
          <div className="eyebrow">当前岗位</div>
          <div style={{ fontSize: 13.5, fontWeight: 500, marginTop: 2 }}>
            {jobTitle}
          </div>
        </div>
        <div className="divider-v" style={{ height: 28 }} />
        <div>
          <div className="eyebrow">面试官风格</div>
          <div style={{ fontSize: 13.5, fontWeight: 500, marginTop: 2 }}>
            {/* design-reference/page-live.jsx — full word "面试官", not just
                the style label. The persona name follows after a middle dot. */}
            {styleLabel}面试官 · {personaName}
          </div>
        </div>
        <div className="divider-v" style={{ height: 28 }} />
        <div>
          <div className="eyebrow">进度</div>
          <div className="row" style={{ gap: 8, marginTop: 2 }}>
            <span
              className="mono"
              style={{ fontSize: 13, fontWeight: 500 }}
            >
              {currentTurn} / {totalTurns}
            </span>
            <div className="bar" style={{ width: 80 }}>
              <i style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
