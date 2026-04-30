// V32.M2.3.5 (F-320) — first-run privacy modal for the connected
// research feature.
//
// Triggered by SettingsPage when the user flips the "联网情报检索"
// toggle ON. The modal restates the L0 A11 contract in plain
// language: only company / role / industry hints leave the device,
// never the resume body or PII. User must explicitly tap "我已了解,
// 启用" to confirm; cancel keeps the toggle OFF.
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PrivacyOptInDialog({
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
      <DialogContent
        className="card-pad-lg"
        data-testid="privacy-opt-in-dialog"
      >
        <DialogTitle className="h2">启用「联网情报检索」前请确认</DialogTitle>
        <DialogDescription
          className="body"
          style={{ marginTop: 8, lineHeight: 1.6, color: "var(--ink-900)" }}
        >
          启用后,Eatit 在解析阶段会把 <strong>仅以下信息</strong> 发送给你
          BYOK 的大模型用于公开网络检索:
        </DialogDescription>
        <ul
          style={{
            paddingLeft: 22,
            margin: "8px 0 14px",
            color: "var(--ink-900)",
            fontSize: 13.5,
            lineHeight: 1.7,
          }}
        >
          <li>JD 中提到的公司名 / 岗位名</li>
          <li>JD 中可识别的行业关键词</li>
        </ul>

        <div
          style={{
            padding: "10px 12px",
            borderRadius: "var(--r-md)",
            background: "var(--brand-softer)",
            border: "1px solid var(--brand)",
            color: "var(--ink-900)",
            fontSize: 13,
            lineHeight: 1.55,
          }}
          data-testid="privacy-opt-in-guarantee"
        >
          <strong>不会发送</strong>:简历正文、姓名、邮箱、电话、社交账号、
          住址,以及任何可识别个人身份的字段。Schema 层和 prompt 层都已
          硬编码 reject。
        </div>

        <p
          className="muted"
          style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.55 }}
        >
          检索结果会在本地缓存 30 天(`research_cache.cache_key` 是哈希,
          不存公司名明文),你可以随时在「设置 → 数据管理」清空。
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
            data-testid="privacy-opt-in-cancel"
          >
            取消,保持关闭
          </button>
          <button
            type="button"
            className="btn btn-brand"
            onClick={onConfirm}
            data-testid="privacy-opt-in-confirm"
          >
            我已了解,启用
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
