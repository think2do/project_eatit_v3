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
