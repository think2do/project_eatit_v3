/**
 * HeroScoreCard — F-314 L0 ethical guardrail UI.
 *
 * Replaces the old `PassProbabilityRing` (a 0–100 numeric ring with
 * tier labels including "不匹配"). The hero now surfaces only the
 * 3-tier "通过可能性" enum coming from the backend (中上 / 中 / 中下)
 * and an optional 0–100 `overall_score` for the side card. Numbers
 * never appear in the "通过可能性" card itself.
 *
 * Backend invariants this component relies on:
 *   - `pass_likelihood` is one of {"中上", "中", "中下"} or null
 *   - `app.domain.reports.service.coerce_pass_likelihood` force-overrides
 *     anything else with WARN log
 */

type Tier = "中上" | "中" | "中下";

interface Props {
  overallScore: number | null;
  passLikelihood: Tier | null;
  scoreDelta?: number;
}

export function HeroScoreCard({
  overallScore,
  passLikelihood,
  scoreDelta,
}: Props): JSX.Element {
  return (
    <div className="row" style={{ gap: 16 }}>
      {overallScore !== null && (
        <div className="card card-pad" style={{ minWidth: 180 }}>
          <div className="muted" style={{ fontSize: 11.5 }}>总分</div>
          <div
            className="row"
            style={{ gap: 8, alignItems: "baseline", marginTop: 4 }}
          >
            <span style={{ fontFamily: "var(--f-serif)", fontSize: 40 }}>
              {overallScore}
            </span>
            {scoreDelta !== undefined && (
              <span
                className="mono"
                style={{
                  fontSize: 11,
                  color: scoreDelta > 0 ? "var(--brand)" : "var(--ink-500)",
                }}
              >
                {scoreDelta > 0 ? "+" : ""}
                {scoreDelta} vs. 上一场
              </span>
            )}
          </div>
        </div>
      )}
      {passLikelihood && (
        <div className="card card-pad" style={{ minWidth: 180 }}>
          <div className="muted" style={{ fontSize: 11.5 }}>通过可能性</div>
          {/* L0 invariant: only the 3-tier string. NEVER render a
              percentage, NEVER render any negative-tier label. */}
          <div
            style={{
              fontFamily: "var(--f-serif)",
              fontSize: 40,
              marginTop: 4,
            }}
          >
            {passLikelihood}
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
            基于岗位 JD 的匹配度评估
          </div>
        </div>
      )}
    </div>
  );
}
