import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";

import { useGlobalKeymap } from "@/lib/useGlobalKeymap";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("useGlobalKeymap", () => {
  it("Space triggers onSubmit when not in input", () => {
    const onSubmit = vi.fn();
    renderHook(() => useGlobalKeymap({ onSubmit }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Space ignored when an <input> is focused", () => {
    const onSubmit = vi.fn();
    renderHook(() => useGlobalKeymap({ onSubmit }));
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(
      new KeyboardEvent("keydown", { code: "Space", bubbles: true }),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Space ignored when a <textarea> is focused", () => {
    const onSubmit = vi.fn();
    renderHook(() => useGlobalKeymap({ onSubmit }));
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    ta.focus();
    ta.dispatchEvent(
      new KeyboardEvent("keydown", { code: "Space", bubbles: true }),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // G8 fix (2026-04-30 audit) — contenteditable focus is the third
  // typing-target branch in `isTypingTarget`. Without this test, a
  // refactor that drops the `isContentEditable` check would not fail
  // CI even though rich-text editors (future review notes? feedback
  // form?) would suddenly start submitting on Space.
  //
  // jsdom currently does not derive `isContentEditable` from the
  // `contenteditable` attribute (only the property setter exists),
  // so we stub the getter directly. This still exercises the hook's
  // branch — the hook reads `target.isContentEditable`, which is what
  // matters; how the DOM derives that boolean is jsdom's concern.
  it("Space ignored when a contenteditable element is focused", () => {
    const onSubmit = vi.fn();
    renderHook(() => useGlobalKeymap({ onSubmit }));
    const div = document.createElement("div");
    Object.defineProperty(div, "isContentEditable", {
      configurable: true,
      get: () => true,
    });
    document.body.appendChild(div);
    div.dispatchEvent(
      new KeyboardEvent("keydown", { code: "Space", bubbles: true }),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("R triggers onReplay (lowercase + uppercase both)", () => {
    const onReplay = vi.fn();
    renderHook(() => useGlobalKeymap({ onReplay }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "R" }));
    expect(onReplay).toHaveBeenCalledTimes(2);
  });

  it("Esc triggers onEnd (which opens dialog, not immediate end)", () => {
    const onEnd = vi.fn();
    renderHook(() => useGlobalKeymap({ onEnd }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("does not bind when enabled = false", () => {
    const onSubmit = vi.fn();
    const onEnd = vi.fn();
    renderHook(() => useGlobalKeymap({ onSubmit, onEnd }, false));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("unsubscribes on unmount (no late firings)", () => {
    const onSubmit = vi.fn();
    const { unmount } = renderHook(() => useGlobalKeymap({ onSubmit }));
    unmount();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
