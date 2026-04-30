import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

type Status = "idle" | "uploading" | "uploaded" | "failed";

interface Props {
  label: string;
  hint: string;
  fileName: string | null;
  status: Status;
  accept?: string;
  onFile: (file: File) => void;
  // V32.M2.2.X audit fix (F-303) — small chips shown after a successful
  // parse. Resume side passes `{role}·{years}年`, companies join, and
  // domain_tags; JD side passes job-title chips when JdProfile lands
  // (currently empty since the schema is not in P1/M2.2 yet). Empty
  // array → no chip row is rendered.
  chips?: string[];
  // V32.M2.2.X audit fix (F-303) — file metadata strip "· 124 KB ·
  // 3 页" rendered in mono under the filename. Skipped when null.
  meta?: string | null;
}

const ACCEPT_DEFAULT = ".pdf,.doc,.docx,.txt";

export function DropZone({
  label,
  hint,
  fileName,
  status,
  accept = ACCEPT_DEFAULT,
  onFile,
  chips = [],
  meta = null,
}: Props): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hovering, setHovering] = useState(false);

  const handleFileList = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onFile(list[0]);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setHovering(false);
    handleFileList(event.dataTransfer.files);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFileList(event.target.files);
    // Clear so selecting the same file twice still fires change.
    event.target.value = "";
  };

  const borderColor = hovering
    ? "var(--brand)"
    : status === "failed"
      ? "var(--warn)"
      : "var(--line-strong)";

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setHovering(true);
      }}
      onDragLeave={() => setHovering(false)}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      style={{
        border: `1.5px dashed ${borderColor}`,
        borderRadius: "var(--r-lg)",
        padding: "28px 20px",
        background: hovering ? "var(--brand-softer)" : "var(--bg-warm)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        transition: "border-color 120ms ease, background 120ms ease",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        style={{ display: "none" }}
      />

      <StatusIcon status={status} />

      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--ink-900)",
        }}
      >
        {label}
      </div>

      {fileName ? (
        <div
          className="mono"
          style={{
            fontSize: 12,
            color: "var(--ink-500)",
            wordBreak: "break-all",
            maxWidth: 260,
            textAlign: "center",
          }}
          data-testid="dropzone-filename"
        >
          {fileName}
          {meta ? (
            <span
              data-testid="dropzone-meta"
              style={{ color: "var(--ink-400)", marginLeft: 4 }}
            >
              {meta}
            </span>
          ) : null}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--ink-500)" }}>{hint}</div>
      )}

      {chips.length > 0 ? (
        <div
          data-testid="dropzone-chips"
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 6,
            maxWidth: 280,
          }}
        >
          {chips.map((chip) => (
            <span key={chip} className="tag tag-line" style={{ fontSize: 10.5 }}>
              {chip}
            </span>
          ))}
        </div>
      ) : null}

      <div style={{ fontSize: 11, color: "var(--ink-400)" }}>
        支持 pdf / doc / docx / txt
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: Status }): JSX.Element {
  const wrapperStyle: React.CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: "var(--r-pill)",
    background: "var(--bg-elev)",
    border: "1px solid var(--line)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };

  if (status === "uploading") {
    return (
      <div style={{ ...wrapperStyle, color: "var(--ink-500)" }}>
        <Loader2 size={18} className="spin" />
      </div>
    );
  }
  if (status === "uploaded") {
    return (
      <div style={{ ...wrapperStyle, color: "var(--brand)" }}>
        <CheckCircle2 size={18} />
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div style={{ ...wrapperStyle, color: "var(--warn)" }}>
        <AlertCircle size={18} />
      </div>
    );
  }
  if (status === "idle") {
    return (
      <div style={{ ...wrapperStyle, color: "var(--ink-500)" }}>
        <Upload size={18} />
      </div>
    );
  }
  return (
    <div style={{ ...wrapperStyle, color: "var(--ink-500)" }}>
      <FileText size={18} />
    </div>
  );
}
