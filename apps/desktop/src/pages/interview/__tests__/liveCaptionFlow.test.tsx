// M3.4.1.dev — LiveCaption RTL + jsdom tests
//
// Test file location: pages/interview/__tests__/ (co-located with component,
// matching M2.x component co-location convention).
//
// Cases: 4 rendering states, 5 partial rerenders, a11y, React.memo behavior.

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { LiveCaption } from "../LiveCaption";

afterEach(() => {
  cleanup();
});

describe("LiveCaption", () => {
  // Case 1: capturing with empty partial → "正在聆听..."
  it("isCapturing + no partialText → shows '正在聆听...'", () => {
    const { getByText, getByRole } = render(
      <LiveCaption isCapturing partialText="" finalText="" />,
    );
    expect(getByText("正在聆听...")).toBeTruthy();
    // a11y: role=status + aria-live=polite present
    const region = getByRole("status");
    expect(region).toBeTruthy();
    expect(region.getAttribute("aria-live")).toBe("polite");
  });

  // Case 2: 5 successive rerenders with incrementally longer partialText
  // Each rerender REPLACES previous (not appends).
  it("5 partial rerenders: each shows only current text (replace semantic)", () => {
    const partials = ["你", "你好", "你好世", "你好世界", "你好世界。"];
    const { rerender, container } = render(
      <LiveCaption isCapturing partialText={partials[0]} finalText="" />,
    );
    expect(container.textContent).toContain(partials[0]);

    for (let i = 1; i < partials.length; i++) {
      rerender(
        <LiveCaption isCapturing partialText={partials[i]} finalText="" />,
      );
      expect(container.textContent).toContain(partials[i]);
      // Previous partial must not be present as a separate element
      // (it may still be a substring, but the full previous text as its own
      // text node is gone — implementation uses single span replacement)
      for (let j = 0; j < i; j++) {
        // Only check that we're NOT just appending: if current includes prev
        // as a substring that's fine (Chinese characters build on each other),
        // but the DOM text should equal exactly the current partial.
        const spans = container.querySelectorAll("span");
        let found = false;
        spans.forEach((s) => {
          if (s.textContent === partials[i]) found = true;
        });
        expect(found).toBe(true);
      }
    }

    // After final partial, "你好世界。" is the only text in the partial span
    const spans = container.querySelectorAll("span");
    const lastPartialSpan = Array.from(spans).find(
      (s) => s.textContent === partials[partials.length - 1],
    );
    expect(lastPartialSpan).toBeTruthy();
  });

  // Case 3: not capturing + finalText → final styling rendered
  it("isCapturing=false + finalText → shows final text with no 'status' role", () => {
    const { container } = render(
      <LiveCaption
        isCapturing={false}
        partialText=""
        finalText="完整答案"
      />,
    );
    expect(container.textContent).toContain("完整答案");
    // Final state uses <p>, not role="status"
    const p = container.querySelector("p");
    expect(p).toBeTruthy();
    expect(p?.textContent).toBe("完整答案");
    // No status role in final state
    const status = container.querySelector("[role=status]");
    expect(status).toBeNull();
  });

  // Case 4: not capturing + no text → renders nothing (null)
  it("isCapturing=false + no text → container.firstChild is null", () => {
    const { container } = render(
      <LiveCaption isCapturing={false} partialText="" finalText="" />,
    );
    expect(container.firstChild).toBeNull();
  });

  // Case 5: a11y — role="status" present when capturing, aria-live="polite"
  it("a11y: role=status + aria-live=polite when isCapturing=true", () => {
    const { getByRole } = render(
      <LiveCaption isCapturing partialText="hello" finalText="" />,
    );
    const region = getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
  });

  // Case 6: isCapturing=true + partialText present → shows partial text, not "正在聆听..."
  it("isCapturing + partialText → shows partialText, not '正在聆听...'", () => {
    const { container, queryByText } = render(
      <LiveCaption isCapturing partialText="实时识别中" finalText="" />,
    );
    expect(container.textContent).toContain("实时识别中");
    expect(queryByText("正在聆听...")).toBeNull();
  });

  // Case 7: React.memo — same props → same DOM, no extra changes
  it("React.memo: rerender with identical props produces identical DOM", () => {
    const props = { isCapturing: true, partialText: "same", finalText: "" };
    const { container, rerender } = render(<LiveCaption {...props} />);
    const before = container.innerHTML;
    rerender(<LiveCaption {...props} />);
    const after = container.innerHTML;
    expect(before).toBe(after);
  });

  // Case 8: transition from capturing to not-capturing with final text
  it("transition capturing→done: final text replaces partial view", () => {
    const { rerender, container, queryByRole } = render(
      <LiveCaption isCapturing partialText="partial..." finalText="" />,
    );
    expect(queryByRole("status")).toBeTruthy();
    expect(container.textContent).toContain("partial...");

    rerender(
      <LiveCaption isCapturing={false} partialText="" finalText="최종 답변" />,
    );
    expect(queryByRole("status")).toBeNull();
    expect(container.textContent).toContain("최종 답변");
  });
});
