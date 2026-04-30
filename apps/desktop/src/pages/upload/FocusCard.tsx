// F-302 V32.M2.2.3 — single InterviewFocus card that toggles selection.
// Selected state lifts to the store via onToggle; visuals are local.
import type { InterviewFocus } from "@eatit/shared-types";

interface Props {
  focus: InterviewFocus;
  selected: boolean;
  onToggle: () => void;
}

const PRIORITY_LABEL: Record<InterviewFocus["priority"], string> = {
  high: "高优先级",
  mid: "中优先级",
  low: "低优先级",
};

export function FocusCard({ focus, selected, onToggle }: Props): JSX.Element {
  const priorityClass = focus.priority === "high" ? "tag tag-warn" : "tag tag-line";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      data-testid="focus-card"
      className={`card ${selected ? "selected" : ""}`}
      style={{
        padding: "14px 16px",
        borderColor: selected ? "var(--brand)" : "var(--line)",
        background: selected ? "var(--brand-softer)" : "var(--bg-warm)",
        borderRadius: "var(--r-md)",
        textAlign: "left",
        cursor: "pointer",
        width: "100%",
      }}
    >
      <div className="row between" style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{focus.title}</span>
        <span className={priorityClass} style={{ fontSize: 10.5 }}>
          {PRIORITY_LABEL[focus.priority]}
        </span>
      </div>
      <div className="muted" style={{ fontSize: 12.5 }}>
        {focus.description}
      </div>
    </button>
  );
}
