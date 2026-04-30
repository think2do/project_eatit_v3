// V32.M2.2.4 — two-column strength/gap renderer. Tint controls the
// background palette: green for advantages, warn for gaps. Items follow
// the v3.2 schema { label, tag, evidence }.
import type { Gap, MatchAdvantage } from "@eatit/shared-types";

type Tint = "green" | "warn";

interface Props {
  title: string;
  items: MatchAdvantage[] | Gap[];
  tint: Tint;
}

const ROW_BG: Record<Tint, string> = {
  green: "var(--brand-softer)",
  warn: "var(--warn-softer)",
};

const TAG_CLASS: Record<Tint, string> = {
  green: "tag tag-green",
  warn: "tag tag-warn",
};

export function StrengthGapList({ title, items, tint }: Props): JSX.Element {
  const empty = items.length === 0;
  return (
    <section
      data-testid={`strength-gap-${tint}`}
      style={{ display: "flex", flexDirection: "column", gap: 10 }}
    >
      <h4
        className="eyebrow"
        style={{ margin: 0 }}
      >
        {title}
      </h4>
      {empty ? (
        <div className="muted" style={{ fontSize: 12.5 }}>
          AI 暂未识别。
        </div>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {items.map((it) => (
            <li
              key={it.label}
              style={{
                background: ROW_BG[tint],
                borderRadius: "var(--r-md)",
                padding: "10px 12px",
              }}
              data-testid={`row-${tint}`}
            >
              <div className="row between" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {it.label}
                </span>
                <span className={TAG_CLASS[tint]} style={{ fontSize: 10.5 }}>
                  {it.tag}
                </span>
              </div>
              <div
                className="muted"
                style={{ fontSize: 12.5, lineHeight: 1.5 }}
              >
                {it.evidence}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
