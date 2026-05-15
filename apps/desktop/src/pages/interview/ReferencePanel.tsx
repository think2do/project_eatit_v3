import { useEffect, useState } from "react";
import { Lightbulb, ChevronDown, Lock } from "lucide-react";
import type { ReferenceAnswerHint } from "@/statecharts/interview-machine";
import { MarkdownStream } from "@/components/MarkdownStream";

type Props = {
  reference: ReferenceAnswerHint | null;
  // Reset the "revealed" state when this changes — used so a new turn
  // forces the user to opt in again instead of leaking the previous
  // turn's hint.
  resetKey: number;
  // M8.3: streaming reference text arriving in real-time before reference.ready.
  // Rendered as plain preformatted text (no markdown parsing — M8.5 will add that).
  // When present and non-empty, shown above the structured reference sections.
  streamingText?: string;
};

/**
 * AI-generated reference answer hint, shown under the answer area.
 *
 * Always rendered (so the user knows the feature exists) but the actual
 * content is hidden behind a "查看 AI 参考答案" reveal so the user gets
 * a chance to answer first. Each new turn resets the reveal state via
 * `resetKey` so the previous turn's hint doesn't bleed through.
 *
 * Three loading states:
 *   - reference === null: backend hasn't pushed `server.reference.ready`
 *     yet. We show a thin "AI 正在准备参考答案..." note.
 *   - reference !== null & not revealed: button to expand.
 *   - reference !== null & revealed: full content.
 */
export function ReferencePanel({ reference, resetKey, streamingText }: Props): JSX.Element {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setRevealed(false);
  }, [resetKey]);

  if (!reference) {
    // M8.3: show streaming text if available, otherwise show loading indicator
    if (streamingText && streamingText.length > 0) {
      return (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: "var(--r-md)",
            border: "1px dashed var(--brand-soft)",
            background: "var(--bg-warm)",
            fontSize: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 8,
              color: "var(--ink-500)",
            }}
          >
            <Lightbulb size={13} />
            <span style={{ fontSize: 11.5 }}>AI 参考正在生成中...</span>
          </div>
          <div
            style={{
              fontSize: 12.5,
              lineHeight: 1.7,
              color: "var(--ink-900)",
              whiteSpace: "pre-wrap",
            }}
          >
            <MarkdownStream text={streamingText} isComplete={false} />
          </div>
        </div>
      );
    }
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderRadius: "var(--r-md)",
          border: "1px dashed var(--line)",
          background: "var(--bg-warm)",
          color: "var(--ink-500)",
          fontSize: 12,
        }}
      >
        <Lightbulb size={14} />
        <span>AI 正在后台生成参考答案,提交回答后可查看。</span>
      </div>
    );
  }

  if (!revealed) {
    // design-reference/page-live.jsx — collapsed state is a neutral
    // bg-warm strip (NOT a green CTA button) so it sits quietly inside
    // the question card and doesn't compete with the question text.
    // Lock icon + tertiary text emphasise "answer first, then peek".
    return (
      <button
        type="button"
        onClick={() => setRevealed(true)}
        data-testid="reference-panel-collapsed"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "10px 14px",
          borderRadius: "var(--r-md)",
          border: "1px solid var(--line)",
          background: "var(--bg-warm)",
          color: "var(--ink-700)",
          fontSize: 12.5,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Lock size={13} />
          <span style={{ fontWeight: 500, color: "var(--ink-900)" }}>
            AI 参考回答
          </span>
          <span className="muted" style={{ fontSize: 11.5 }}>
            默认折叠 · 回答后再查看效果更好
          </span>
        </span>
        <ChevronDown size={14} style={{ transform: "rotate(-90deg)" }} />
      </button>
    );
  }

  return (
    <section
      className="ds-card"
      style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        background: "var(--brand-softer)",
        border: "1px solid var(--brand-soft)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--brand-ink)",
          }}
        >
          <Lightbulb size={14} />
          AI 参考答案
        </div>
        <button
          type="button"
          onClick={() => setRevealed(false)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 8px",
            borderRadius: "var(--r-sm)",
            border: "1px solid transparent",
            background: "transparent",
            color: "var(--ink-500)",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          收起 <ChevronDown size={12} />
        </button>
      </header>

      {streamingText && streamingText.length > 0 ? (
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            AI 参考答案（流式）
          </div>
          <div
            style={{
              fontSize: 12.5,
              lineHeight: 1.7,
              color: "var(--ink-900)",
              whiteSpace: "pre-wrap",
            }}
          >
            <MarkdownStream text={streamingText} isComplete={false} />
          </div>
        </div>
      ) : null}

      {reference.ideal_answer ? (
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.75,
            color: "var(--ink-900)",
            whiteSpace: "pre-wrap",
          }}
        >
          {reference.ideal_answer}
        </div>
      ) : null}
    </section>
  );
}
