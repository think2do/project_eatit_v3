import type { ReactNode } from "react";

// F-316 V32.M3.1.4 — Dashboard StatCard atom.
//
// Visual contract (PRD §6.4):
//   eyebrow (uppercase mono · ~11px) →
//   value   (serif · 30px · ink-900) →
//   sub     (≤14px · ink-500, optional)
//
// Composes existing shared classes (.card .card-pad .eyebrow .h-serif .muted)
// instead of inventing a new one — D3 red line. Layout helpers (.col / gap)
// keep the spacing consistent with the rest of the design system.

export type StatCardProps = {
  eyebrow: string;
  value: ReactNode;
  sub?: ReactNode;
};

export function StatCard({ eyebrow, value, sub }: StatCardProps): JSX.Element {
  return (
    <div
      className="card card-pad col"
      data-testid="stat-card"
      style={{ gap: 6 }}
    >
      <div className="eyebrow">{eyebrow}</div>
      <div
        className="h-serif"
        data-testid="stat-card-value"
        style={{ fontSize: 30, fontWeight: 400, color: "var(--ink-900)" }}
      >
        {value}
      </div>
      {sub != null ? (
        <div className="muted" style={{ fontSize: 12.5 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}
