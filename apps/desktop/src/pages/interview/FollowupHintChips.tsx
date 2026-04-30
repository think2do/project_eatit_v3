/**
 * F-319 V32.M1.4 — FollowupHintChips.
 *
 * Renders the 2–3 follow-up clue chips beneath the current question
 * card. The backend's `field_validator` guarantees the array is
 * either empty (graceful degradation) or 2–3 items each ≤ 8 chars,
 * so this component just iterates and trusts the data — no length
 * guard inside the map.
 *
 * Empty array → render nothing (the parent already lays out spacing
 * around the question card and the empty-state should be invisible).
 */
interface Props {
  hints: string[] | undefined | null;
}

export function FollowupHintChips({ hints }: Props): JSX.Element | null {
  if (!hints || hints.length === 0) return null;
  return (
    <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
      {hints.map((h, i) => (
        <span
          key={`${h}-${i}`}
          className="tag tag-info"
          style={{ fontSize: 11 }}
        >
          追问线索 · {h}
        </span>
      ))}
    </div>
  );
}
