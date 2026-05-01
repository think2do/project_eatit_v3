import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import type {
  InterviewDirectionV32,
  InterviewDurationV32,
  InterviewStyleV32,
} from "@eatit/shared-types";
import { createSession } from "@/api/sessions";
import { PageStepIndicator } from "@/components/PageStepIndicator";
import { TipsCarousel } from "@/components/TipsCarousel";
import { SummarySidebar } from "@/pages/config/SummarySidebar";
import { selectTips } from "@/lib/tips";
import { useAppStore } from "@/stores/app-store";

type StyleOption = {
  value: InterviewStyleV32;
  label: string;
  hint: string;
  tag?: string;
  tagClass?: string;
};

const STYLE_OPTIONS: StyleOption[] = [
  {
    value: "structured",
    label: "结构化面试官",
    hint: "按既定框架推进,节奏稳定,适合大部分日常练习",
    tag: "推荐",
    tagClass: "tag tag-green",
  },
  {
    value: "pressure",
    label: "高压追问型",
    hint: "连续深挖细节、不断质疑你的判断依据",
  },
  {
    value: "friendly",
    label: "亲和启发型",
    hint: "引导你自述,追问偏协助式",
  },
  {
    value: "expert",
    label: "资深行业专家",
    hint: "以业务视角切入,追问行业理解",
    tag: "Beta",
    tagClass: "tag tag-line",
  },
];

type DirectionOption = {
  value: InterviewDirectionV32;
  label: string;
  hint: string;
};

const DIRECTION_OPTIONS: DirectionOption[] = [
  { value: "ai-insight", label: "AI 场景洞察", hint: "对新技术 / 新趋势的判断与边界感" },
  { value: "data-driven", label: "数据驱动决策", hint: "指标体系、AB 实验、归因分析" },
  { value: "cross-func", label: "跨职能协作", hint: "与不同角色的协作与推动" },
  { value: "zero-to-one", label: "从 0 到 1", hint: "应对不确定性与新业务" },
  { value: "user-research", label: "用户洞察", hint: "调研方法、客户分层" },
  { value: "strategy", label: "产品战略", hint: "竞争分析、北极星指标" },
];

const DURATION_OPTIONS: { value: InterviewDurationV32; label: string; hint: string }[] = [
  { value: 15, label: "15 分钟", hint: "精简 · 3~4 题" },
  { value: 30, label: "30 分钟", hint: "标准 · 6~8 题" },
  { value: 45, label: "45 分钟", hint: "完整 · 10~12 题" },
  { value: 60, label: "60 分钟", hint: "深度 · 含 case" },
];

const MAX_DIRECTIONS = 3;
const MIN_DIRECTIONS = 1;

function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.detail ?? err.message;
  }
  return err instanceof Error ? err.message : "请求失败";
}

export function ConfigPage(): JSX.Element {
  const navigate = useNavigate();
  const upload = useAppStore((s) => s.upload);
  const config = useAppStore((s) => s.config);
  const patchConfig = useAppStore((s) => s.patchConfig);
  const presetConfig = useAppStore((s) => s.presetConfig);
  const setPresetConfig = useAppStore((s) => s.setPresetConfig);
  const selectedFocusIds = useAppStore((s) => s.selectedFocusIds);
  const hasSyncedFocusToConfig = useAppStore((s) => s.hasSyncedFocusToConfig);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitTips = useMemo(() => selectTips("parsing", 0), []);

  // F-317: consume one-shot preset handoff from ReportPage's dark CTA
  // and clear the slot. Runs once on mount; subsequent navigations
  // back to ConfigPage with no preset don't reset the user's edits.
  useEffect(() => {
    if (!presetConfig) return;
    patchConfig(presetConfig);
    setPresetConfig(null);
  }, [presetConfig, patchConfig, setPresetConfig]);

  // F-302 V32.M2.2.3 (+ V32.M2.2.X audit fix): when the user toggled
  // focus cards on ParsedPanel (and there's no in-flight preset from
  // F-317), seed `directions` from selectedFocusIds — capped at 3,
  // deduped, ordered by user pick. The lock now lives on the store
  // (`hasSyncedFocusToConfig`) so navigating Config→Upload→Config does
  // not clobber the user's hand edits on remount; only a new parse
  // (`patchUpload({ parsePayload })`) clears the lock.
  useEffect(() => {
    if (hasSyncedFocusToConfig) return;
    if (presetConfig) return;
    if (selectedFocusIds.length === 0) return;
    // patchConfig flips hasSyncedFocusToConfig to true in the store, so
    // subsequent remounts find the lock set and skip re-seeding.
    patchConfig({ directions: selectedFocusIds.slice(0, MAX_DIRECTIONS) });
  }, [selectedFocusIds, presetConfig, patchConfig, hasSyncedFocusToConfig]);

  const directionsValid =
    config.directions.length >= MIN_DIRECTIONS && config.directions.length <= MAX_DIRECTIONS;

  const handleStart = async () => {
    if (!upload.assetBundleId) {
      setError("请先在「上传与解析」里完成简历与 JD 的上传。");
      return;
    }
    if (!directionsValid) {
      setError("请至少选择 1 个面试方向(最多 3 个)。");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const response = await createSession({
        asset_bundle_id: upload.assetBundleId,
        config: {
          style: config.style,
          directions: config.directions,
          duration_minutes: config.durationMinutes,
        },
      });
      navigate(`/interview/${response.session_id}`);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const ready =
    Boolean(upload.assetBundleId) && upload.parseStatus === "succeeded" && directionsValid;

  const toggleDirection = (value: InterviewDirectionV32) => {
    const isSelected = config.directions.includes(value);
    if (isSelected) {
      patchConfig({ directions: config.directions.filter((d) => d !== value) });
      return;
    }
    if (config.directions.length >= MAX_DIRECTIONS) {
      // Already at the cap; tile is rendered with .selected:false + greyed
      // hover, so this branch is mostly defensive.
      return;
    }
    patchConfig({ directions: [...config.directions, value] });
  };

  // V32.M1.1.X — derive sidebar inputs from current store state.
  const jobTitle = (() => {
    const payload = upload.parsePayload;
    if (!payload) return null;
    const company = payload.jd_company_name?.trim();
    const role = payload.jd_role_title?.trim();
    if (company && role) return `${company} · ${role}`;
    return role ?? company ?? null;
  })();
  const styleLabel =
    STYLE_OPTIONS.find((opt) => opt.value === config.style)?.label ?? config.style;
  const directionDetail = config.directions.map((value) => ({
    value,
    label: DIRECTION_OPTIONS.find((opt) => opt.value === value)?.label ?? value,
  }));

  return (
    <div
      style={{
        display: "flex",
        gap: 24,
        alignItems: "flex-start",
      }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
      <div>
        <PageStepIndicator step={2} />
        <h1 className="h1" style={{ margin: "10px 0 6px" }}>
          选一套和今天状态匹配的面试方式
        </h1>
        <p style={{ fontSize: 14, color: "var(--ink-500)", maxWidth: 620, lineHeight: 1.6 }}>
          AI 会根据你选择的风格、方向和时长生成专属的面试框架,开始后无法中途修改。
        </p>
      </div>

      {!upload.assetBundleId || upload.parseStatus !== "succeeded" ? (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "var(--r-md)",
            background: "var(--warn-softer)",
            color: "var(--warn)",
            border: "1px solid var(--warn)",
            fontSize: 13,
          }}
        >
          请先在「上传与解析」完成 AI 解析,然后再来配置面试。
        </div>
      ) : null}

      <Section
        eyebrow="01 · 面试风格"
        title="面试风格"
        description="选择 AI 面试官的人设。不同风格会影响问题的追问深度、节奏与反馈语气。"
      >
        <div className="tile-group">
          {STYLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`tile${config.style === opt.value ? " selected" : ""}`}
              onClick={() => patchConfig({ style: opt.value })}
            >
              <div className="tile-radio" />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span className="tile-title">{opt.label}</span>
                  {opt.tag ? <span className={opt.tagClass}>{opt.tag}</span> : null}
                </div>
                <div className="tile-desc">{opt.hint}</div>
              </div>
            </button>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="02 · 提问方向"
        title="选择 1–3 个方向(可多选)"
        description="AI 将在这些方向上出题。可多选,顺序无关。系统已根据你的简历与 JD 预选两项。"
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 10,
          }}
        >
          {DIRECTION_OPTIONS.map((opt) => {
            const selected = config.directions.includes(opt.value);
            const atCap = !selected && config.directions.length >= MAX_DIRECTIONS;
            return (
              <button
                key={opt.value}
                type="button"
                className={`tile${selected ? " selected" : ""}`}
                disabled={atCap}
                onClick={() => toggleDirection(opt.value)}
                style={atCap ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
              >
                <div className="tile-radio" />
                <div style={{ flex: 1 }}>
                  <div className="tile-title">{opt.label}</div>
                  <div className="tile-desc">{opt.hint}</div>
                </div>
              </button>
            );
          })}
        </div>
        {!directionsValid ? (
          <div
            style={{
              marginTop: 8,
              fontSize: 12.5,
              color: "var(--warn)",
            }}
          >
            请至少勾选 1 个方向。
          </div>
        ) : null}
      </Section>

      <Section
        eyebrow="03 · 面试时长"
        title="选择面试时长"
        description="会影响问题数量与追问深度,可随时提前结束。"
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
          }}
        >
          {DURATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`tile${config.durationMinutes === opt.value ? " selected" : ""}`}
              onClick={() => patchConfig({ durationMinutes: opt.value })}
            >
              <div className="tile-radio" />
              <div style={{ flex: 1 }}>
                <div className="tile-title">{opt.label}</div>
                <div className="tile-desc">{opt.hint}</div>
              </div>
            </button>
          ))}
        </div>
      </Section>

      {/* V32.M1.1.X: bottom dual-CTA row removed — SummarySidebar's main
          CTA replaces it. Inline error stays so the user sees validation
          feedback above the fold without scrolling to the sidebar. */}
      {error ? (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "var(--r-md)",
            background: "var(--warn-soft)",
            color: "var(--warn)",
            border: "1px solid var(--warn)",
            fontSize: 13,
          }}
          data-testid="config-inline-error"
        >
          {error}
        </div>
      ) : null}

      {submitting ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--ink-900)",
              }}
            >
              AI 正在为你定制面试框架...
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 4 }}>
              通常约 30-60 秒。在此期间可以看看面试技巧。
            </div>
          </div>
          <TipsCarousel tips={submitTips} />
        </div>
      ) : null}
      </div>

      <SummarySidebar
        jobTitle={jobTitle}
        styleLabel={styleLabel}
        directions={directionDetail}
        durationMinutes={config.durationMinutes}
        ready={ready}
        submitting={submitting}
        onStart={handleStart}
      />
    </div>
  );
}

interface SectionProps {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}

function Section({ eyebrow, title, description, children }: SectionProps): JSX.Element {
  return (
    <section className="card card-pad">
      <header style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
        <div className="eyebrow">{eyebrow}</div>
        <h2 className="h3">{title}</h2>
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          {description}
        </p>
      </header>
      {children}
    </section>
  );
}
