import { X } from "lucide-react";
import type { Toast as ToastEntry, ToastTone } from "@/stores/toast-store";
import { useToastStore, pushToast } from "@/stores/toast-store";

/**
 * Fire-and-forget helper. Call from any non-React context (api/, agents/)
 * to surface a notification in the bottom-right rail.
 */
export function showToast(
  message: string,
  opts?: {
    actionLabel?: string;
    onAction?: () => void;
    durationMs?: number;
    tone?: ToastTone;
  },
): void {
  // M9.3: HeroCard 已在 HomePage 顶部承担"分析生成中"提示,避免 toast 重复
  if (message.includes("分析生成中")) return;
  pushToast({
    title: message,
    tone: opts?.tone ?? "info",
    ttlMs: opts?.durationMs ?? (opts?.actionLabel ? 0 : 5000),
    actionLabel: opts?.actionLabel,
    onAction: opts?.onAction,
  });
}

/**
 * Bottom-right toast rail. Renders `useToastStore.toasts` as a stack.
 * Each toast auto-dismisses after its TTL; close button is always
 * available for sticky (ttl=0) entries.
 */
export function ToastRail(): JSX.Element {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return <></>;

  return (
    <div
      style={{
        position: "fixed",
        right: 20,
        bottom: 20,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        zIndex: 50,
        maxWidth: 360,
      }}
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onClose={() => dismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onClose,
}: {
  toast: ToastEntry;
  onClose: () => void;
}): JSX.Element {
  const palette = tonePalette(toast.tone);
  return (
    <div
      role="status"
      style={{
        display: "flex",
        gap: 10,
        padding: "12px 14px",
        borderRadius: "var(--r-md)",
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        color: palette.ink,
        boxShadow: "var(--shadow-md)",
      }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{toast.title}</div>
        {toast.message ? (
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: palette.soft }}>
            {toast.message}
          </div>
        ) : null}
        {toast.requestId ? (
          <div
            className="mono"
            style={{ fontSize: 11, color: palette.soft, opacity: 0.8 }}
          >
            request_id: {toast.requestId}
          </div>
        ) : null}
        {toast.actionLabel ? (
          <button
            type="button"
            onClick={() => {
              toast.onAction?.();
              onClose();
            }}
            style={{
              alignSelf: "flex-start",
              marginTop: 4,
              padding: "3px 10px",
              borderRadius: "var(--r-sm)",
              border: `1px solid ${palette.border}`,
              background: "transparent",
              color: palette.ink,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {toast.actionLabel}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭提示"
        style={{
          background: "transparent",
          border: "none",
          color: palette.ink,
          cursor: "pointer",
          padding: 2,
          alignSelf: "flex-start",
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function tonePalette(tone: ToastTone): {
  bg: string;
  border: string;
  ink: string;
  soft: string;
} {
  switch (tone) {
    case "error":
      return {
        bg: "var(--warn-softer)",
        border: "var(--warn)",
        ink: "var(--warn)",
        soft: "var(--ink-700)",
      };
    case "warn":
      return {
        bg: "var(--warn-soft)",
        border: "var(--warn)",
        ink: "var(--warn)",
        soft: "var(--ink-700)",
      };
    case "info":
      return {
        bg: "var(--info-soft)",
        border: "var(--info)",
        ink: "var(--info)",
        soft: "var(--ink-700)",
      };
    case "success":
      return {
        bg: "var(--brand-softer)",
        border: "var(--brand)",
        ink: "var(--brand-ink)",
        soft: "var(--ink-700)",
      };
  }
}
