import { Sparkles } from "lucide-react";

interface Props {
  text: string | null | undefined;
  fallback?: string | null;
}

export function LiveObservationCard({ text, fallback }: Props): JSX.Element {
  const display = text ?? fallback ?? null;
  return (
    <div
      className="card"
      style={{
        padding: "16px 20px",
        background: "var(--brand-softer)",
        borderColor: "var(--brand-soft)",
      }}
    >
      <div
        className="row"
        style={{ gap: 8, marginBottom: 6, color: "var(--brand-ink)" }}
      >
        <Sparkles size={13} aria-hidden />
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>AI 实时观察</span>
      </div>
      {display ? (
        <div
          style={{
            fontSize: 12.5,
            color: "var(--ink-700)",
            lineHeight: 1.6,
          }}
        >
          {display}
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 12 }}>
          AI 正在听…
        </div>
      )}
    </div>
  );
}
