import { useEffect } from "react";

export interface KeymapHandlers {
  onSubmit?: () => void;
  onReplay?: () => void;
  onEnd?: () => void;
}

// Treats input / textarea / contenteditable focus as "user is typing" and
// silently skips the shortcut. Without this, pressing Space inside the
// text-mode answer textarea would submit the answer instead of inserting
// a space character.
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * InterviewPage global keymap (PRD §6.3.6 ④):
 *   - Space   → onSubmit   (= 提交回答)
 *   - R / r   → onReplay   (= 重听问题, replays TTS)
 *   - Escape  → onEnd      (opens EndConfirmDialog — never ends directly)
 *
 * Listener is attached to `window` so the page-level keys win even if no
 * specific element has focus. `enabled` lets the page suspend the bind
 * while a modal is open or the session is over.
 */
export function useGlobalKeymap(
  handlers: KeymapHandlers,
  enabled: boolean = true,
): void {
  const { onSubmit, onReplay, onEnd } = handlers;
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.code === "Space") {
        e.preventDefault();
        onSubmit?.();
        return;
      }
      if (e.key === "r" || e.key === "R") {
        onReplay?.();
        return;
      }
      if (e.key === "Escape") {
        onEnd?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, onSubmit, onReplay, onEnd]);
}
