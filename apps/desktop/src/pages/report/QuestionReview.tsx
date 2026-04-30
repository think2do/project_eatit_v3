/**
 * F-313 V32.M1.3 — QuestionReview (collapsible per-question card).
 *
 * Renders one row of the report's "逐题复盘" card. Default-collapsed
 * with a chevron toggle; the first question can be passed
 * `defaultExpanded={true}` so the user lands on the most recent answer
 * already open. Tone tags drive the icon colour without affecting the
 * numeric score.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { RoundReviewTone } from "@eatit/shared-types";

interface QuestionReviewProps {
  index: number;
  questionTag: string;
  questionText: string;
  score: number;
  tone: RoundReviewTone;
  answerSummary: string;
  aiFeedback: string;
  defaultExpanded?: boolean;
}

const TONE_LABELS: Record<RoundReviewTone, string> = {
  good: "表现亮眼",
  ok: "中规中矩",
  warn: "需要补强",
};

const TONE_TAG_CLASS: Record<RoundReviewTone, string> = {
  good: "tag tag-green",
  ok: "tag",
  warn: "tag tag-warn",
};

export function QuestionReview(props: QuestionReviewProps): JSX.Element {
  const [expanded, setExpanded] = useState(props.defaultExpanded ?? false);
  const colorVar =
    props.score >= 80
      ? "var(--brand)"
      : props.score >= 65
        ? "var(--ink-700)"
        : "var(--warn)";

  return (
    <div style={{ borderBottom: "1px solid var(--line)" }}>
      <button
        className="row between"
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%",
          padding: "16px 24px",
          cursor: "pointer",
          background: "transparent",
          border: "none",
          textAlign: "left",
        }}
      >
        <div className="row" style={{ gap: 14 }}>
          <span
            className="mono muted"
            style={{ fontSize: 12, minWidth: 20 }}
          >
            Q{props.index}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-900)" }}>
              {props.questionText}
            </div>
            <div
              className="row"
              style={{ gap: 6, marginTop: 4 }}
            >
              <span className="tag tag-line" style={{ fontSize: 10.5 }}>
                {props.questionTag}
              </span>
              <span
                className={TONE_TAG_CLASS[props.tone]}
                style={{ fontSize: 10.5 }}
              >
                {TONE_LABELS[props.tone]}
              </span>
            </div>
          </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span
            className="mono"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: colorVar,
              minWidth: 26,
              textAlign: "right",
            }}
          >
            {props.score}
          </span>
          {expanded ? (
            <ChevronDown size={16} color="var(--ink-500)" />
          ) : (
            <ChevronRight size={16} color="var(--ink-500)" />
          )}
        </div>
      </button>

      {expanded ? (
        <div style={{ padding: "0 24px 20px 58px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              padding: 14,
              borderRadius: "var(--r-md)",
              background: "var(--bg-warm)",
              border: "1px solid var(--line)",
            }}
          >
            <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>
              你的回答 · 摘要
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-900)", lineHeight: 1.6 }}>
              {props.answerSummary}
            </div>
          </div>
          <div
            style={{
              padding: 14,
              borderRadius: "var(--r-md)",
              background:
                props.tone === "warn"
                  ? "var(--warn-softer)"
                  : "var(--brand-softer)",
              border: "1px solid var(--line)",
            }}
          >
            <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>
              AI 反馈
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-900)", lineHeight: 1.6 }}>
              {props.aiFeedback}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
