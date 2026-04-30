interface Props {
  active: boolean;
}

const BAR_HEIGHTS = [6, 14, 10, 18, 8, 16, 11, 13];

/**
 * 8-bar voice activity visualization. When `active`, each bar runs
 * eatit-wave (0.9s) with a 0.08s per-bar delay so the row reads as
 * a left-to-right shimmer. When inactive, bars collapse to 4px ink-300
 * dots so the slot stays visually present without being noisy.
 */
export function WaveBars({ active }: Props): JSX.Element {
  return (
    <div
      className="row"
      aria-hidden
      style={{ gap: 2, alignItems: "flex-end", height: 20 }}
    >
      {BAR_HEIGHTS.map((h, i) => (
        <span
          key={i}
          style={{
            width: 2.5,
            height: active ? h : 4,
            background: active ? "var(--brand)" : "var(--ink-300)",
            borderRadius: 2,
            transformOrigin: "bottom",
            animation: active
              ? `eatit-wave 0.9s ${i * 0.08}s infinite ease-in-out`
              : "none",
          }}
        />
      ))}
    </div>
  );
}
