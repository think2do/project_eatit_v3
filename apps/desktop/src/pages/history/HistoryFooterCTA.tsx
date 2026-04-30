import { Plus, RotateCcw } from "lucide-react";
import type {
  InterviewDirectionV32,
  InterviewDurationV32,
  InterviewStyleV32,
  SessionSummary,
} from "@eatit/shared-types";

// F-316 V32.M3.1.5 — Dashboard 底部 CTA bar.
// 两个动作:
//   * 复用上次配置 — 取最近一场 session 的 config_snapshot 复制到 store,
//     标记 skipUpload=true,跳到 /upload(UploadPage 检测到 skipUpload 后
//     直接 navigate('/config'),所以面试者跳过上传环节)。
//   * + 全新面试  — 走完整流程从 /upload 起。
// 当 lastConfig 为空(未有任何历史 session 或 snapshot 解不出来)时,
// "复用上次配置" 按钮置灰并附说明。

export type ReusableConfig = {
  style: InterviewStyleV32;
  directions: InterviewDirectionV32[];
  durationMinutes: InterviewDurationV32;
};

export type HistoryFooterCTAProps = {
  lastConfig: ReusableConfig | null;
  onReuseLastConfig: (config: ReusableConfig) => void;
  onNewInterview: () => void;
};

const VALID_STYLES = new Set<InterviewStyleV32>([
  "structured",
  "pressure",
  "friendly",
  "expert",
]);

const VALID_DIRECTIONS = new Set<InterviewDirectionV32>([
  "ai-insight",
  "data-driven",
  "cross-func",
  "zero-to-one",
  "user-research",
  "strategy",
]);

const VALID_DURATIONS = new Set<InterviewDurationV32>([15, 30, 45]);

/**
 * Defensive snapshot reader. ``config_snapshot`` is typed as a free-form
 * dict on the API; we tolerate legacy v3.1 shapes (``direction`` singular
 * string) and only succeed when every required field maps onto its v3.2+
 * Literal. Returns ``null`` when even one field falls outside the lock,
 * which the caller treats as "disable the reuse button" rather than
 * accept a broken preset.
 */
export function extractConfigFromSnapshot(
  snapshot: Record<string, unknown> | undefined | null,
): ReusableConfig | null {
  if (!snapshot) return null;

  const styleRaw = snapshot["style"];
  if (typeof styleRaw !== "string" || !VALID_STYLES.has(styleRaw as InterviewStyleV32)) {
    return null;
  }

  const durationRaw = snapshot["duration_minutes"];
  if (
    typeof durationRaw !== "number" ||
    !VALID_DURATIONS.has(durationRaw as InterviewDurationV32)
  ) {
    return null;
  }

  // v3.2+: directions is a list. v3.1 legacy shape carried `direction`
  // (singular). Prefer the list when present; fall back to the singular
  // and wrap into a list. Both shapes are then filtered against the
  // v3.2 Literal so legacy values silently drop out.
  const rawList = Array.isArray(snapshot["directions"])
    ? (snapshot["directions"] as unknown[])
    : typeof snapshot["direction"] === "string"
      ? [snapshot["direction"]]
      : null;
  if (rawList === null) return null;
  const directions = rawList
    .filter(
      (d): d is InterviewDirectionV32 =>
        typeof d === "string" && VALID_DIRECTIONS.has(d as InterviewDirectionV32),
    )
    .slice(0, 3);
  if (directions.length === 0) return null;

  return {
    style: styleRaw as InterviewStyleV32,
    directions,
    durationMinutes: durationRaw as InterviewDurationV32,
  };
}

/**
 * Pick the most-recent (by ``created_at``) session whose ``config_snapshot``
 * yields a valid v3.2 ``ReusableConfig``. Older / malformed snapshots are
 * skipped so the reuse button always offers a usable preset.
 */
export function pickLastReusableConfig(
  sessions: SessionSummary[],
): ReusableConfig | null {
  const sorted = [...sessions].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  for (const s of sorted) {
    const cfg = extractConfigFromSnapshot(s.config_snapshot);
    if (cfg !== null) return cfg;
  }
  return null;
}

const STYLE_LABEL: Record<InterviewStyleV32, string> = {
  structured: "结构化",
  pressure: "高压追问",
  friendly: "友好引导",
  expert: "专家深度",
};

const DIRECTION_LABEL: Record<InterviewDirectionV32, string> = {
  "ai-insight": "AI 场景洞察",
  "data-driven": "数据驱动",
  "cross-func": "跨职能协作",
  "zero-to-one": "0-1 项目",
  "user-research": "用户洞察",
  strategy: "战略思考",
};

export function HistoryFooterCTA({
  lastConfig,
  onReuseLastConfig,
  onNewInterview,
}: HistoryFooterCTAProps): JSX.Element {
  const canReuse = lastConfig !== null;
  const summary = lastConfig
    ? `${STYLE_LABEL[lastConfig.style]} · ${lastConfig.durationMinutes} 分钟 · ${lastConfig.directions
        .map((d) => DIRECTION_LABEL[d])
        .join(" / ")}`
    : "尚无可复用的最近一场配置";

  return (
    <div
      className="card card-pad row between"
      data-testid="history-footer-cta"
      style={{ gap: 12 }}
    >
      <div className="col" style={{ gap: 4, minWidth: 0 }}>
        <div className="eyebrow">下一步</div>
        <div className="body" style={{ margin: 0 }}>
          {summary}
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button
          type="button"
          className="btn"
          data-testid="reuse-last-config"
          disabled={!canReuse}
          aria-disabled={!canReuse}
          onClick={() => {
            if (lastConfig !== null) onReuseLastConfig(lastConfig);
          }}
          style={
            canReuse
              ? undefined
              : { opacity: 0.5, cursor: "not-allowed" }
          }
        >
          <RotateCcw size={14} />
          复用上次配置
        </button>
        <button
          type="button"
          className="btn btn-brand"
          data-testid="start-new-interview"
          onClick={onNewInterview}
        >
          <Plus size={14} />
          全新面试
        </button>
      </div>
    </div>
  );
}
