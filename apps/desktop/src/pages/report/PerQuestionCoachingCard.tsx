import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { PerQuestionCoaching } from "@eatit/shared-types";

// F-322 V32.M3.2.3 — Reflection 逐题教练卡。折叠态显示 question + 一句
// diagnosis 摘要,展开后显示完整诊断 / 模板要点 / 应用关键词 / 改进建议。
//
// Defaults to expanded for the first card and collapsed for the rest;
// the caller decides via ``defaultExpanded`` so longer reflections can
// stay scannable.

export type PerQuestionCoachingCardProps = {
  coaching: PerQuestionCoaching;
  defaultExpanded?: boolean;
};

export function PerQuestionCoachingCard({
  coaching,
  defaultExpanded = false,
}: PerQuestionCoachingCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <article
      data-testid={`per-question-card-${coaching.turn_index}`}
      data-expanded={expanded ? "true" : "false"}
      className="card"
      style={{ overflow: "hidden" }}
    >
      <button
        type="button"
        data-testid={`per-question-card-toggle-${coaching.turn_index}`}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "14px 18px",
          width: "100%",
          background: "transparent",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-grid",
            placeItems: "center",
            width: 22,
            height: 22,
            borderRadius: "var(--r-sm)",
            background: "var(--bg-sunken)",
            color: "var(--ink-500)",
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <div className="col grow" style={{ gap: 4, minWidth: 0 }}>
          <div
            className="eyebrow"
            style={{ fontSize: 10.5 }}
          >
            第 {coaching.turn_index + 1} 题
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--ink-900)",
              whiteSpace: expanded ? "normal" : "nowrap",
              overflow: expanded ? "visible" : "hidden",
              textOverflow: expanded ? "clip" : "ellipsis",
            }}
            title={coaching.question}
          >
            {coaching.question}
          </div>
          {!expanded ? (
            <div
              className="muted"
              style={{
                fontSize: 12.5,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {coaching.diagnosis}
            </div>
          ) : null}
        </div>
      </button>

      {expanded ? (
        <div
          className="col"
          style={{
            padding: "0 18px 18px",
            gap: 14,
            borderTop: "1px solid var(--line)",
            paddingTop: 14,
          }}
        >
          <Section title="你的回答(摘要)">
            <p className="body" style={{ margin: 0 }}>
              {coaching.your_answer_summary}
            </p>
          </Section>
          <Section title="教练诊断">
            <p className="body" style={{ margin: 0 }}>
              {coaching.diagnosis}
            </p>
          </Section>
          <Section title="参考答案要点">
            <ul className="col" style={{ gap: 6, paddingLeft: 18, margin: 0 }}>
              {coaching.model_answer_outline.map((line, i) => (
                <li key={i} style={{ fontSize: 13.5, color: "var(--ink-900)" }}>
                  {line}
                </li>
              ))}
            </ul>
          </Section>
          <Section title="可以用上的关键词">
            <div className="row wrap" style={{ gap: 6 }}>
              {coaching.key_phrases_to_use.map((p) => (
                <span key={p} className="tag tag-green">
                  {p}
                </span>
              ))}
            </div>
          </Section>
          <Section title="建议下次注意">
            <ul className="col" style={{ gap: 6, paddingLeft: 18, margin: 0 }}>
              {coaching.mistakes_to_avoid.map((m, i) => (
                <li key={i} style={{ fontSize: 13.5, color: "var(--ink-900)" }}>
                  {m}
                </li>
              ))}
            </ul>
          </Section>
          {coaching.recommended_resources.length > 0 ? (
            <Section title="拓展资料">
              <ul className="col" style={{ gap: 6, paddingLeft: 18, margin: 0 }}>
                {coaching.recommended_resources.map((r, i) => (
                  <li key={i} style={{ fontSize: 13, color: "var(--ink-700)" }}>
                    {r}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="eyebrow" style={{ fontSize: 10.5 }}>
        {title}
      </div>
      {children}
    </div>
  );
}
