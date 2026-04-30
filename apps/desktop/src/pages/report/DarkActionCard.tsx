/**
 * F-317 V32.M1.5 — DarkActionCard.
 *
 * Ink-900 CTA card surfaced on the report page right aside when the
 * backend's `derive_preset_config` returned a non-null
 * `next_actions_v2`. Primary button kicks the user back into
 * ConfigPage with the preset already prefilled (the parent component
 * commits the preset to the app-store before navigating); secondary
 * gives the same destination but signals the user wants to review /
 * tweak the prefill before starting.
 *
 * Design-system note: this is the only place in the app that uses an
 * `--ink-900` background instead of the lighter card surface. The
 * `.card` base class is reused so the radius / shadow / border match
 * other report cards; only the background and text colours invert.
 */
interface Props {
  headline: string;
  reason: string;
  onPrimaryClick: () => void;
  onSecondaryClick: () => void;
}

export function DarkActionCard({
  headline,
  reason,
  onPrimaryClick,
  onSecondaryClick,
}: Props): JSX.Element {
  return (
    <div
      className="card"
      style={{
        padding: 20,
        background: "var(--ink-900)",
        color: "white",
        borderColor: "var(--ink-900)",
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          color: "rgba(255, 255, 255, 0.6)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        下一步
      </div>
      <div
        style={{
          fontFamily: "var(--f-serif)",
          fontSize: 22,
          lineHeight: 1.3,
          margin: "6px 0 10px",
        }}
      >
        {headline}
      </div>
      <div
        style={{
          fontSize: 12.5,
          color: "rgba(255, 255, 255, 0.7)",
          marginBottom: 16,
          lineHeight: 1.5,
        }}
      >
        {reason}
      </div>
      <button
        type="button"
        className="btn btn-brand"
        style={{ width: "100%", justifyContent: "center" }}
        onClick={onPrimaryClick}
      >
        重新面试 · 专项训练
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        style={{
          width: "100%",
          justifyContent: "center",
          marginTop: 6,
          color: "rgba(255, 255, 255, 0.75)",
        }}
        onClick={onSecondaryClick}
      >
        修改配置后再开始
      </button>
    </div>
  );
}
