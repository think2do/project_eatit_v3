// V32.M2.2.4 — overall match-score SVG dial. Score is strict 0–100; the
// surrounding ParsedPanel is responsible for not rendering the dial when
// match_score is null (LLM omitted it pre-fallback).
interface Props {
  score: number;
  level: "LOW" | "MID" | "HIGH";
}

const RADIUS = 52;
const CIRC = 2 * Math.PI * RADIUS;

export function MatchDial({ score, level }: Props): JSX.Element {
  const clamped = Math.max(0, Math.min(100, score));
  const offset = CIRC * (1 - clamped / 100);
  return (
    <div
      style={{ position: "relative", width: 160, height: 160, margin: "12px auto 4px" }}
      data-testid="match-dial"
      data-score={clamped}
      data-level={level}
    >
      <svg width="160" height="160" viewBox="0 0 140 140" aria-hidden>
        <circle
          cx="70"
          cy="70"
          r={RADIUS}
          stroke="var(--line)"
          strokeWidth="8"
          fill="none"
        />
        <circle
          cx="70"
          cy="70"
          r={RADIUS}
          stroke="var(--brand)"
          strokeWidth="8"
          fill="none"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 70 70)"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          textAlign: "center",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--f-serif)",
              fontSize: 42,
              lineHeight: 1,
              color: "var(--ink-900)",
            }}
          >
            {clamped}
            <span style={{ fontSize: 16, color: "var(--ink-500)" }}> / 100</span>
          </div>
          <div
            className="mono"
            style={{
              fontSize: 10.5,
              color: "var(--brand)",
              marginTop: 8,
              letterSpacing: "0.08em",
            }}
          >
            MATCH · {level}
          </div>
        </div>
      </div>
    </div>
  );
}
