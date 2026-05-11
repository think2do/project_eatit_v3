import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { MarkdownStream, parseBoldSegments } from "@/components/MarkdownStream";

// ---------------------------------------------------------------------------
// parseBoldSegments unit tests
// ---------------------------------------------------------------------------

describe("parseBoldSegments", () => {
  it("empty string → empty array", () => {
    expect(parseBoldSegments("", false)).toEqual([]);
  });

  it("plain text with no ** → single plain segment", () => {
    expect(parseBoldSegments("hello world", false)).toEqual([
      { text: "hello world", bold: false },
    ]);
  });

  it("complete bold only → single bold segment", () => {
    expect(parseBoldSegments("**abc**", true)).toEqual([
      { text: "abc", bold: true },
    ]);
  });

  it("complete bold only (isComplete=false) → still bold because stream happens to close", () => {
    expect(parseBoldSegments("**abc**", false)).toEqual([
      { text: "abc", bold: true },
    ]);
  });

  it("** alone streaming → no bold (emit empty plain or nothing, never bold)", () => {
    const segs = parseBoldSegments("**", false);
    // Either empty result or a plain '**' — must NOT contain a bold segment
    for (const s of segs) {
      expect(s.bold).toBe(false);
    }
  });

  it("**a streaming → rendered as plain literal **a (no-flicker rule)", () => {
    const segs = parseBoldSegments("**a", false);
    expect(segs.length).toBe(1);
    expect(segs[0].bold).toBe(false);
    expect(segs[0].text).toBe("**a");
  });

  it("**a complete → rendered as bold (stream ended, treat as closed)", () => {
    const segs = parseBoldSegments("**a", true);
    expect(segs.length).toBe(1);
    expect(segs[0].bold).toBe(true);
    expect(segs[0].text).toBe("a");
  });

  it("prefix + bold + suffix (complete) → 3 segments: plain / bold / plain", () => {
    expect(parseBoldSegments("前**中**后", true)).toEqual([
      { text: "前", bold: false },
      { text: "中", bold: true },
      { text: "后", bold: false },
    ]);
  });

  it("a**b**c**d streaming → plain a / bold b / plain c / plain **d", () => {
    // The parser flushes buf each time it hits '**', so 'c' and the trailing
    // un-closed '**d' become two separate plain segments.
    expect(parseBoldSegments("a**b**c**d", false)).toEqual([
      { text: "a", bold: false },
      { text: "b", bold: true },
      { text: "c", bold: false },
      { text: "**d", bold: false }, // un-closed bold → literal, no-flicker
    ]);
  });

  it("newline preserved inside plain segment", () => {
    const segs = parseBoldSegments("行1\n**行2**", true);
    expect(segs[0].text).toBe("行1\n");
    expect(segs[0].bold).toBe(false);
    expect(segs[1].text).toBe("行2");
    expect(segs[1].bold).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MarkdownStream component render tests
// ---------------------------------------------------------------------------

describe("MarkdownStream", () => {
  it("renders an empty span for empty string", () => {
    const { container } = render(<MarkdownStream text="" />);
    expect(container.querySelector("span")).toBeTruthy();
    expect(container.querySelector("strong")).toBeNull();
  });

  it("renders plain text without any strong element", () => {
    const { container } = render(<MarkdownStream text="hello" />);
    expect(container.querySelector("strong")).toBeNull();
    expect(container.textContent).toBe("hello");
  });

  it("renders **bold** as <strong> when complete", () => {
    const { container } = render(
      <MarkdownStream text="**important**" isComplete={true} />
    );
    const strong = container.querySelector("strong");
    expect(strong).toBeTruthy();
    expect(strong?.textContent).toBe("important");
  });

  it("does NOT render strong for un-closed ** during streaming", () => {
    const { container } = render(
      <MarkdownStream text="**important" isComplete={false} />
    );
    expect(container.querySelector("strong")).toBeNull();
    expect(container.textContent).toContain("**important");
  });

  it("renders mixed text correctly: plain+bold+plain", () => {
    const { container } = render(
      <MarkdownStream text="今天**很重要**的一点是" isComplete={true} />
    );
    const strong = container.querySelector("strong");
    expect(strong?.textContent).toBe("很重要");
    expect(container.textContent).toBe("今天很重要的一点是");
  });

  it("isComplete defaults to false — un-closed ** treated as plain", () => {
    const { container } = render(<MarkdownStream text="**abc" />);
    expect(container.querySelector("strong")).toBeNull();
  });
});
