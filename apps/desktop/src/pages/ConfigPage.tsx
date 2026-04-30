import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type {
  InterviewDirectionV32,
  InterviewDurationV32,
  InterviewStyleV32,
} from "@eatit/shared-types";
import { createSession } from "@/api/sessions";
import { TipsCarousel } from "@/components/TipsCarousel";
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
  { value: 15, label: "15 分钟", hint: "短练,聚焦一个主题" },
  { value: 30, label: "30 分钟", hint: "默认,覆盖 3-4 个轮次" },
  { value: 45, label: "45 分钟", hint: "完整体验,含反问" },
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div className="eyebrow">03 · 面试配置</div>
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
        title="选择 1 个面试官风格"
        description="影响 AI 面试官的语气与追问强度。"
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
        eyebrow="02 · 面试方向"
        title="选择 1–3 个方向(可多选)"
        description="决定 AI 把重心放在哪里。最多选 3 个。"
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
        eyebrow="03 · 期望时长"
        title="选择面试时长"
        description="会按比例切分各环节(暖场 / 深挖 / 反问)。"
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
        >
          {error}
        </div>
      ) : null}

      <div className="row">
        <button type="button" className="btn" onClick={() => navigate("/upload")}>
          返回上传
        </button>
        <button
          type="button"
          className={ready && !submitting ? "btn btn-brand btn-lg" : "btn btn-lg"}
          onClick={handleStart}
          disabled={!ready || submitting}
          style={!ready || submitting ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
        >
          {submitting ? <Loader2 size={14} className="spin" /> : null}
          {submitting ? "生成面试框架..." : "开始面试"}
        </button>
      </div>

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
