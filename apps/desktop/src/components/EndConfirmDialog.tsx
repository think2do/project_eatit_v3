import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Two-step "结束面试?" confirmation. Triggered by the global Esc shortcut
 * (useGlobalKeymap → onEnd) and by the page's "结束面试" button. Esc must
 * never end the session directly — confirm first, then propagate to the
 * page's handleEndSession.
 */
export function EndConfirmDialog({
  open,
  onConfirm,
  onCancel,
}: Props): JSX.Element | null {
  if (!open) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="card-pad-lg">
        <DialogTitle className="h2">结束面试?</DialogTitle>
        <p className="body muted" style={{ marginTop: 8 }}>
          当前进度会保留,稍后可继续或重新开始。
        </p>
        <div
          className="row"
          style={{
            gap: 8,
            marginTop: 24,
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="btn btn-danger-soft"
            onClick={onConfirm}
          >
            确认结束
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
