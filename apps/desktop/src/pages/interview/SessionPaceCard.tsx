// V32.M1.1.X-followup — right-rail "本场节奏" card.
// design-reference/page-live.jsx:
//   serif 26 timer + duration progress bar +
//   2-column Metric grid (当前节奏 / 已答题数)
//
// PRD §6.3 expectations:
//   - "当前节奏" derives from per-turn speech-rate (slow/moderate/fast).
//     The page already runs `useTurnStats`; the worst-case label of the
//     active turn is what we surface here.
//   - "已答题数" is currentTurnIndex / totalTurns (0-based input).

import { formatMmSs } from "./formatTime";

export type PaceTone = "good" | "warn" | "muted";

export interface SessionPaceCardProps {
  /** Seconds elapsed since the WS opened. */
  elapsedSeconds: number;
  /** Total duration in minutes (15 / 30 / 45 / 60). */
  durationMinutes: number;
  /** "偏慢" / "适中" / "偏快" / "—". */
  rateLabel: string;
  /** Tonal cue for the rate label. */
  rateTone: PaceTone;
  /** 1-indexed; e.g. 3 means "answered 3 of N". */
  answeredTurns: number;
  /** Total planned turns. */
  totalTurns: number;
}

export function SessionPaceCard({
  elapsedSeconds,
  durationMinutes,
  rateLabel,
  rateTone,
  answeredTurns,
  totalTurns,
}: SessionPaceCardProps): JSX.Element {
  const totalSeconds = Math.max(1, durationMinutes * 60);
  const progressPct = Math.min(
    100,
    Math.max(0, (elapsedSeconds / totalSeconds) * 100),
  );
  return (
    <section
      className="card"
      data-testid="session-pace-card"
      style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div className="eyebrow">本场节奏</div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginTop: 4,
        }}
      >
        <span
          style={{
            fontFamily: "var(--f-serif)",
            fontSize: 26,
            lineHeight: 1,
            color: "var(--ink-900)",
          }}
        >
          {formatMmSs(elapsedSeconds)}
        </span>
        <span className="muted" style={{ fontSize: 12 }}>
          / {String(durationMinutes).padStart(2, "0")}:00
        </span>
      </div>

      <div className="bar">
        <i style={{ width: `${progressPct}%` }} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginTop: 6,
        }}
      >
        <Metric label="当前节奏" value={rateLabel} tone={rateTone} />
        <Metric
          label="已答题数"
          value={`${answeredTurns} / ${totalTurns}`}
          tone="muted"
        />
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: PaceTone;
}): JSX.Element {
  const color =
    tone === "warn"
      ? "var(--warn)"
      : tone === "good"
        ? "var(--brand)"
        : "var(--ink-700)";
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "var(--bg-warm)",
        borderRadius: "var(--r-sm)",
      }}
      data-testid={`session-pace-metric-${label}`}
    >
      <div className="muted" style={{ fontSize: 11 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color,
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}
