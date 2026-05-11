import { create } from "zustand";

export type ToastTone = "error" | "warn" | "info" | "success";

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  message?: string;
  requestId?: string;
  ttlMs: number;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastStore {
  toasts: Toast[];
  push(toast: Omit<Toast, "id" | "ttlMs"> & { ttlMs?: number }): string;
  dismiss(id: string): void;
  clear(): void;
}

const DEFAULT_TTL_MS = 5000;

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Minimal toast store. Kept outside React-land so axios interceptors +
 * WS handlers can push toasts without threading a setter through every
 * component. The `Toast.tsx` component reads from this store and
 * renders the current queue.
 */
export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push(toast) {
    const id = newId();
    const ttlMs = toast.ttlMs ?? DEFAULT_TTL_MS;
    const entry: Toast = {
      id,
      tone: toast.tone,
      title: toast.title,
      message: toast.message,
      requestId: toast.requestId,
      ttlMs,
      actionLabel: toast.actionLabel,
      onAction: toast.onAction,
    };
    set((state) => ({ toasts: [...state.toasts, entry] }));
    if (ttlMs > 0 && typeof window !== "undefined") {
      window.setTimeout(() => get().dismiss(id), ttlMs);
    }
    return id;
  },
  dismiss(id) {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
  clear() {
    set({ toasts: [] });
  },
}));

/** Convenience helper for call sites that only need the `push` method. */
export function pushToast(toast: Omit<Toast, "id" | "ttlMs"> & { ttlMs?: number }): string {
  return useToastStore.getState().push(toast);
}
