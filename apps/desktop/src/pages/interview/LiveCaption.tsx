// M3.4.1.dev — LiveCaption component
//
// Renders real-time partial transcripts (Volc revisable interim) and the
// committed final transcript. Three states:
//   capturing + no text  → "正在聆听..." + pulsing indicator
//   capturing + text     → partial text (italic, muted) + pulsing indicator
//   not capturing + finalText → final text (normal weight)
//   not capturing + no text  → null (renders nothing)
//
// Design tokens (var(--*)) are used where available. Classes are placeholder
// Tailwind-style names pending M5 design-token audit follow-up.

import React from "react";

export interface LiveCaptionProps {
  partialText: string;
  finalText: string;
  isCapturing: boolean;
}

export const LiveCaption: React.FC<LiveCaptionProps> = React.memo(
  function LiveCaption({ partialText, finalText, isCapturing }) {
    if (isCapturing) {
      return (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: "10px 14px",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--line)",
            background: "var(--bg-sunken)",
            fontSize: 14,
            lineHeight: 1.6,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {partialText ? (
            <span
              style={{
                color: "var(--ink-400)",
                fontStyle: "italic",
                flex: 1,
              }}
            >
              {partialText}
            </span>
          ) : (
            <span style={{ color: "var(--ink-500)", flex: 1 }}>
              正在聆听...
            </span>
          )}
          {/* Pulsing dot — M5 design-token follow-up for animation token */}
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--brand, #2563eb)",
              flexShrink: 0,
              animation: "pulse 1.2s ease-in-out infinite",
            }}
          />
        </div>
      );
    }

    if (finalText) {
      return (
        <p
          style={{
            margin: 0,
            padding: "10px 14px",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--line)",
            background: "var(--bg-sunken)",
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--ink-900)",
            whiteSpace: "pre-wrap",
          }}
        >
          {finalText}
        </p>
      );
    }

    return null;
  },
  (prev, next) =>
    prev.partialText === next.partialText &&
    prev.finalText === next.finalText &&
    prev.isCapturing === next.isCapturing,
);
