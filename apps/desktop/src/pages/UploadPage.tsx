import { useMemo, useState } from "react";
import axios from "axios";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getParseResult, triggerParse, uploadJd, uploadResume } from "@/api/assets";
import { DropZone } from "@/pages/upload/DropZone";
import { ParsedPanel } from "@/pages/upload/ParsedPanel";
import {
  buildJdChips,
  buildResumeChips,
  formatFileSizeMeta,
} from "@/pages/upload/profileChips";
import { PageStepIndicator } from "@/components/PageStepIndicator";
import { TipsCarousel } from "@/components/TipsCarousel";
import { selectTips } from "@/lib/tips";
import { useAppStore } from "@/stores/app-store";

function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.detail ?? err.message;
  }
  return err instanceof Error ? err.message : "请求失败";
}

export function UploadPage(): JSX.Element {
  const navigate = useNavigate();
  const upload = useAppStore((s) => s.upload);
  const patchUpload = useAppStore((s) => s.patchUpload);

  const [globalError, setGlobalError] = useState<string | null>(null);

  const parseTips = useMemo(() => selectTips("parsing", 0), []);

  const handleResume = async (file: File) => {
    setGlobalError(null);
    patchUpload({
      resumeFileName: file.name,
      resumeFileSize: file.size,
      resumeStatus: "uploading",
      parseStatus: "idle",
      parsePayload: null,
      parsedAtMs: null,
      error: null,
    });
    try {
      const response = await uploadResume(file, {
        asset_bundle_id: upload.assetBundleId ?? undefined,
      });
      patchUpload({
        assetBundleId: response.asset_bundle_id,
        resumeStatus: "uploaded",
      });
    } catch (err) {
      patchUpload({ resumeStatus: "failed", error: extractError(err) });
      setGlobalError(extractError(err));
    }
  };

  const handleJd = async (file: File) => {
    setGlobalError(null);
    patchUpload({
      jdFileName: file.name,
      jdFileSize: file.size,
      jdStatus: "uploading",
      parseStatus: "idle",
      parsePayload: null,
      parsedAtMs: null,
      error: null,
    });
    try {
      const response = await uploadJd(file, {
        asset_bundle_id: upload.assetBundleId ?? undefined,
      });
      patchUpload({
        assetBundleId: response.asset_bundle_id,
        jdStatus: "uploaded",
      });
    } catch (err) {
      patchUpload({ jdStatus: "failed", error: extractError(err) });
      setGlobalError(extractError(err));
    }
  };

  const resumeChips = buildResumeChips(upload.parsePayload);
  const jdChips = buildJdChips(upload.parsePayload);
  const resumeMeta = formatFileSizeMeta(upload.resumeFileSize);
  const jdMeta = formatFileSizeMeta(upload.jdFileSize);

  const handleParse = async () => {
    if (!upload.assetBundleId) return;
    setGlobalError(null);
    patchUpload({ parseStatus: "running" });
    try {
      const response = await triggerParse(upload.assetBundleId);
      patchUpload({
        parseStatus: "succeeded",
        parsePayload: response.payload,
        parsedAtMs: Date.now(),
      });
    } catch (err) {
      // Fall back to the GET endpoint — if parse succeeded but the POST
      // socket dropped, the stored payload is still the source of truth.
      try {
        const existing = await getParseResult(upload.assetBundleId);
        patchUpload({
          parseStatus: "succeeded",
          parsePayload: existing.payload,
          parsedAtMs: Date.now(),
        });
        return;
      } catch {
        /* ignore, fall through to error path */
      }
      patchUpload({ parseStatus: "failed", error: extractError(err) });
      setGlobalError(extractError(err));
    }
  };

  const canParse =
    upload.resumeStatus === "uploaded" &&
    upload.jdStatus === "uploaded" &&
    upload.parseStatus !== "running";

  const canContinue = upload.parseStatus === "succeeded";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <PageStepIndicator step={1} />
        <h1
          className="h-serif"
          style={{
            fontSize: 42,
            lineHeight: 1.1,
            fontWeight: 400,
            margin: "10px 0 6px",
            color: "var(--ink-900)",
          }}
        >
          上传简历与岗位 JD
        </h1>
        <p style={{ fontSize: 14, color: "var(--ink-500)", maxWidth: 620, lineHeight: 1.6 }}>
          AI 会先通读这两份文本,告诉你岗位要求、候选人亮点、潜在薄弱点,以及面试里值得深挖的项目。
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        <DropZone
          label="简历"
          hint="拖拽或点击选择简历文件"
          fileName={upload.resumeFileName}
          status={upload.resumeStatus}
          onFile={handleResume}
          chips={upload.parseStatus === "succeeded" ? resumeChips : []}
          meta={resumeMeta}
        />
        <DropZone
          label="岗位 JD"
          hint="拖拽或点击选择 JD 文件"
          fileName={upload.jdFileName}
          status={upload.jdStatus}
          onFile={handleJd}
          chips={upload.parseStatus === "succeeded" ? jdChips : []}
          meta={jdMeta}
        />
      </div>

      {globalError ? (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "var(--r-md)",
            background: "var(--warn-soft)",
            color: "var(--warn)",
            border: "1px solid var(--warn)",
            fontSize: 13,
          }}
        >
          {globalError}
        </div>
      ) : null}

      {upload.parseStatus !== "succeeded" ? (
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleParse}
            disabled={!canParse}
            className="btn btn-brand btn-lg"
          >
            {upload.parseStatus === "running" ? <Loader2 size={14} className="spin" /> : null}
            {upload.parseStatus === "running" ? "解析中..." : "开始 AI 解析"}
          </button>
        </div>
      ) : null}

      {upload.parseStatus === "running" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--ink-900)",
              }}
            >
              AI 正在解析简历与岗位描述...
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 4 }}>
              通常约 15 秒。在此期间可以看看面试技巧。
            </div>
          </div>
          <TipsCarousel tips={parseTips} size="large" />
        </div>
      ) : null}

      {upload.parsePayload && upload.parsedAtMs !== null ? (
        <ParsedPanel
          payload={upload.parsePayload}
          parsedAt={upload.parsedAtMs}
          onReparse={handleParse}
          onContinue={() => navigate("/config")}
          reparseDisabled={!canParse}
          continueDisabled={!canContinue}
        />
      ) : null}
    </div>
  );
}
