/**
 * QuestionReview — M8.4 simplified layout.
 *
 * Each round is rendered as:
 *   1. question-line (Q{n} + tag + tone + score)
 *   2. ai-answer-main: persona 这样回答 + AI answer text (primary content)
 *   3. raw-answer-fold: <details> wrapping the user's original answer
 *      (collapsed by default)
 *
 * Rendering note: M8.5 will introduce <MarkdownStream /> for the AI answer.
 * Until then we use whiteSpace: "pre-wrap" plain text.
 * TODO M8.5: swap in <MarkdownStream text={aiAnswer} />
 */
import type { RoundReviewTone } from "@eatit/shared-types";

interface QuestionReviewProps {
  index: number;
  questionTag: string;
  questionText: string;
  score: number;
  tone: RoundReviewTone;
  rawAnswer: string;
  aiSuggestedAnswer: string;
  /** M8.2 field — preferred when non-empty; falls back to aiSuggestedAnswer. */
  aiSuggestedAnswerMarkdown?: string;
  aiFeedback: string;
  /** Name of the interviewer persona (e.g. "Sarah"). */
  personaName: string;
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
  const scoreColor =
    props.score >= 80
      ? "var(--brand)"
      : props.score >= 65
        ? "var(--ink-700)"
        : "var(--warn)";

  // Prefer the markdown field (M8.2+); fall back to the legacy plain-text field.
  const aiAnswer =
    (props.aiSuggestedAnswerMarkdown ?? "").trim() ||
    (props.aiSuggestedAnswer ?? "") ||
    "";

  const rawAnswer = (props.rawAnswer ?? "").trim();

  return (
    <section
      className="round-review"
      style={{
        borderBottom: "1px solid var(--line)",
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* question-line */}
      <div className="question-line" style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <span className="mono muted" style={{ fontSize: 12, minWidth: 20, paddingTop: 2 }}>
          Q{props.index}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-900)", lineHeight: 1.5 }}>
            {props.questionText}
          </div>
          <div className="row" style={{ gap: 6, marginTop: 6 }}>
            <span className="tag tag-line" style={{ fontSize: 10.5 }}>
              {props.questionTag}
            </span>
            <span className={TONE_TAG_CLASS[props.tone]} style={{ fontSize: 10.5 }}>
              {TONE_LABELS[props.tone]}
            </span>
          </div>
        </div>
        <span
          className="mono"
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: scoreColor,
            minWidth: 26,
            textAlign: "right",
            flexShrink: 0,
          }}
        >
          {props.score}
        </span>
      </div>

      {/* ai-answer-main — primary content block */}
      <div
        className="ai-answer-main"
        style={{
          padding: 16,
          borderRadius: "var(--r-md)",
          background: "var(--brand-softer)",
          border: "1px solid var(--line)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <h3
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--brand)",
            margin: 0,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {props.personaName} 这样回答
        </h3>
        {/* TODO M8.5: swap in <MarkdownStream text={aiAnswer} /> */}
        <div
          style={{
            fontSize: 13.5,
            lineHeight: 1.8,
            color: aiAnswer.length > 0 ? "var(--ink-900)" : "var(--ink-400)",
            whiteSpace: "pre-wrap",
          }}
        >
          {aiAnswer.length > 0 ? aiAnswer : "（暂无范例答）"}
        </div>

        {props.aiFeedback.trim().length > 0 && (
          <div
            style={{
              marginTop: 4,
              paddingTop: 10,
              borderTop: "1px solid var(--line)",
              fontSize: 12.5,
              color: "var(--ink-700)",
              lineHeight: 1.7,
              whiteSpace: "pre-wrap",
            }}
          >
            <span className="muted" style={{ fontSize: 11, display: "block", marginBottom: 4 }}>
              AI 总结及建议
            </span>
            {props.aiFeedback}
          </div>
        )}
      </div>

      {/* raw-answer-fold — collapsed by default */}
      <details
        className="raw-answer-fold"
        style={{ fontSize: 13, color: "var(--ink-700)" }}
      >
        <summary
          style={{
            cursor: "pointer",
            fontSize: 12,
            color: "var(--ink-500)",
            userSelect: "none",
            listStyle: "none",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          我的原始作答
        </summary>
        <pre
          style={{
            marginTop: 10,
            padding: 14,
            borderRadius: "var(--r-md)",
            background: "var(--bg-warm)",
            border: "1px solid var(--line)",
            fontSize: 12.5,
            color: rawAnswer.length > 0 ? "var(--ink-900)" : "var(--ink-400)",
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
            fontFamily: "inherit",
            margin: "10px 0 0",
          }}
        >
          {rawAnswer.length > 0 ? rawAnswer : "（无作答记录）"}
        </pre>
      </details>
    </section>
  );
}
