interface Segment {
  text: string;
  bold: boolean;
}

/**
 * Parse text into bold/plain segments with incremental-safe handling.
 *
 * When isComplete=false and a `**` opening is detected but no closing `**`
 * has arrived yet, the trailing un-closed run is emitted as plain text
 * (prefixed with `**`) to avoid a flash of bold during streaming.
 *
 * When isComplete=true, un-closed bold segments are rendered as bold
 * (the stream has ended so whatever remains is final).
 */
export function parseBoldSegments(text: string, isComplete: boolean): Segment[] {
  const result: Segment[] = [];
  let i = 0;
  let buf = "";
  let inBold = false;

  while (i < text.length) {
    if (text[i] === "*" && text[i + 1] === "*") {
      if (buf) {
        result.push({ text: buf, bold: inBold });
        buf = "";
      }
      inBold = !inBold;
      i += 2;
      continue;
    }
    buf += text[i];
    i += 1;
  }

  if (buf) {
    if (inBold && !isComplete) {
      // Un-closed bold during streaming — render as plain literal to avoid flicker
      result.push({ text: "**" + buf, bold: false });
    } else {
      result.push({ text: buf, bold: inBold });
    }
  }

  return result;
}

interface Props {
  /** Current accumulated full text (may contain a half-open `**` token). */
  text: string;
  /** Whether the stream has ended. When true, un-closed `**` are rendered as bold. */
  isComplete?: boolean;
}

/**
 * Streaming-safe inline markdown renderer that handles only `**bold**`.
 * Does not depend on any external markdown library.
 *
 * - During streaming (isComplete=false): un-closed `**...` tail is shown as
 *   plain text so the UI never flickers in and out of bold mid-token.
 * - After stream completes (isComplete=true): any remaining bold segment is
 *   rendered as `<strong>`.
 */
export function MarkdownStream({ text, isComplete = false }: Props): JSX.Element {
  const segments = parseBoldSegments(text, isComplete);
  return (
    <span>
      {segments.map((s, i) =>
        s.bold ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>
      )}
    </span>
  );
}
