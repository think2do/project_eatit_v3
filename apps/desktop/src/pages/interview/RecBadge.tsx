interface Props {
  recording: boolean;
  elapsedSeconds: number;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Topbar REC badge — pulsing red dot + mm:ss running clock.
 * `recording=false` freezes the dot (no animation) so the badge can
 * still display the elapsed time when the user is between turns.
 */
export function RecBadge({ recording, elapsedSeconds }: Props): JSX.Element {
  const mm = pad(Math.max(0, Math.floor(elapsedSeconds / 60)));
  const ss = pad(Math.max(0, elapsedSeconds) % 60);
  return (
    <span
      className="tag tag-dot"
      style={{
        color: "var(--warn)",
        background: "var(--warn-softer)",
        borderColor: "var(--warn)",
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 7,
          height: 7,
          background: "var(--warn)",
          borderRadius: "50%",
          marginRight: 6,
          animation: recording ? "eatit-pulse 1.4s infinite" : "none",
        }}
      />
      REC {mm}:{ss}
    </span>
  );
}
