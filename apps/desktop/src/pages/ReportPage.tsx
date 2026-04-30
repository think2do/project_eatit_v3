import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import type {
  InterviewDirectionV32,
  InterviewDurationV32,
  InterviewReportResponse,
  InterviewStyleV32,
} from "@eatit/shared-types";
import { generateReport, getSessionReport } from "@/api/sessions";
import { DarkActionCard } from "@/pages/report/DarkActionCard";
import { DimensionRow } from "@/pages/report/DimensionRow";
import { HeroScoreCard } from "@/pages/report/HeroScoreCard";
import { QuestionReview } from "@/pages/report/QuestionReview";
import { ReasonRow } from "@/pages/report/ReasonRow";
import { WaitingTips } from "@/components/WaitingTips";
import { useAppStore } from "@/stores/app-store";
// Side-effect stylesheet: adds @media print rules that hide chrome
// and paginate ReasonRow entries cleanly. See print.css for details.
import "@/pages/report/print.css";

type ReportState =
  | { kind: "loading" }
  | { kind: "generating" }
  | { kind: "ready"; data: InterviewReportResponse }
  | { kind: "error"; message: string };

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 120_000;

function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.detail ?? err.message;
  }
  return err instanceof Error ? err.message : "请求失败";
}

export function ReportPage(): JSX.Element {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const setPresetConfig = useAppStore((s) => s.setPresetConfig);
  const [state, setState] = useState<ReportState>({ kind: "loading" });

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const started = Date.now();

    async function ensureAndPoll() {
      setState({ kind: "loading" });
      // First attempt: fetch existing; if 409 (still generating) or 404 (not
      // yet requested), trigger + poll. This makes the page idempotent: the
      // same URL works whether the report was previously requested or not.
      try {
        const existing = await getSessionReport(sessionId!);
        if (cancelled) return;
        setState({ kind: "ready", data: existing });
        return;
      } catch (err) {
        const status = axios.isAxiosError(err) ? err.response?.status : null;
        if (status !== 404 && status !== 409) {
          if (!cancelled) setState({ kind: "error", message: extractError(err) });
          return;
        }
      }

      try {
        await generateReport(sessionId!);
      } catch (err) {
        if (!cancelled) setState({ kind: "error", message: extractError(err) });
        return;
      }

      if (cancelled) return;
      setState({ kind: "generating" });

      while (!cancelled) {
        if (Date.now() - started > POLL_TIMEOUT_MS) {
          setState({ kind: "error", message: "报告生成超时,请稍后重试。" });
          return;
        }
        try {
          const response = await getSessionReport(sessionId!);
          if (cancelled) return;
          setState({ kind: "ready", data: response });
          return;
        } catch (err) {
          const status = axios.isAxiosError(err) ? err.response?.status : null;
          if (status === 409) {
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
            continue;
          }
          if (!cancelled) setState({ kind: "error", message: extractError(err) });
          return;
        }
      }
    }

    void ensureAndPoll();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const header = useMemo(
    () => (
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            fontSize: 12,
            color: "var(--ink-500)",
          }}
          onClick={() => navigate("/history")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter") navigate("/history");
          }}
        >
          <ArrowLeft size={14} /> 返回面试记录
        </div>
        <div className="eyebrow">06 · 评估报告</div>
        <h1
          className="h-serif"
          style={{
            fontSize: 42,
            lineHeight: 1.1,
            fontWeight: 400,
            margin: "10px 0 0",
            color: "var(--ink-900)",
          }}
        >
          本场面试的复盘
        </h1>
      </header>
    ),
    [navigate],
  );

  if (!sessionId) {
    return (
      <div style={{ color: "var(--ink-500)" }}>缺少 session_id。</div>
    );
  }

  if (state.kind === "loading" || state.kind === "generating") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {header}
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div className="shimmer" style={{ width: 110, height: 110, borderRadius: "50%" }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="shimmer" style={{ height: 14, width: "50%" }} />
            <div className="shimmer" style={{ height: 12, width: "70%" }} />
            <div className="shimmer" style={{ height: 12, width: "40%" }} />
          </div>
        </div>
        <WaitingTips
          title={
            state.kind === "generating"
              ? "AI 正在生成本场面试报告..."
              : "正在加载报告..."
          }
          subtitle="通常约 20 秒。在此期间可以看看面试技巧。"
        />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {header}
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "var(--r-md)",
            background: "var(--warn-soft)",
            color: "var(--warn)",
            border: "1px solid var(--warn)",
            fontSize: 13.5,
          }}
        >
          {state.message}
        </div>
      </div>
    );
  }

  const payload = state.data.payload;

  const handleExportPdf = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <div
      className="report-page"
      style={{ display: "flex", flexDirection: "column", gap: 22 }}
    >
      <div
        className="report-page__print-hide"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>{header}</div>
        <button
          type="button"
          onClick={handleExportPdf}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--line)",
            background: "var(--bg-elev)",
            color: "var(--ink-900)",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          <Printer size={14} />
          导出 PDF
        </button>
      </div>

      <section
        className="ds-card"
        style={{
          padding: 22,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <HeroScoreCard
          overallScore={payload.overall_score ?? null}
          passLikelihood={payload.pass_likelihood ?? null}
        />
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.7,
            color: "var(--ink-900)",
          }}
        >
          {payload.overall_summary}
        </div>
      </section>

      {/* F-312 维度分析卡 (M1.3). 严格 5 项 (post-normalize) 或空 (v3.1
          legacy report);非空时整段渲染,空时整段隐藏避免 v3.1 报告
          崩溃。 */}
      {payload.dimensions && payload.dimensions.length > 0 ? (
        <section className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            维度分析
          </div>
          <div>
            {payload.dimensions.map((d) => (
              <DimensionRow
                key={d.name}
                name={d.name}
                description={d.description}
                score={d.score}
                evidenceChips={d.evidence_chips}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* F-313 逐题复盘卡 (M1.3). v3.1 legacy report → round_reviews_v2
          为空,整段隐藏。第一题默认展开,其余折叠。 */}
      {payload.round_reviews_v2 && payload.round_reviews_v2.length > 0 ? (
        <section className="card">
          <div
            className="eyebrow"
            style={{ padding: "16px 24px 0", marginBottom: 0 }}
          >
            逐题复盘
          </div>
          <div>
            {payload.round_reviews_v2.map((r, idx) => (
              <QuestionReview
                key={r.turn_index}
                index={idx + 1}
                questionTag={r.question_tag}
                questionText={r.question_text}
                score={r.score}
                tone={r.tone}
                answerSummary={r.answer_summary}
                aiFeedback={r.ai_feedback}
                defaultExpanded={idx === 0}
              />
            ))}
          </div>
        </section>
      ) : null}

      {payload.reasons.length > 0 ? (
        <section>
          <div
            className="eyebrow"
            style={{ marginBottom: 10 }}
          >
            证据绑定的维度评价
          </div>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {payload.reasons.map((reason, idx) => (
              <ReasonRow
                key={`${reason.aspect}-${idx}`}
                reason={reason}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {payload.next_actions.length > 0 ? (
        <section
          className="ds-card"
          style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--ink-900)" }}>
            下一场面试前可以做的事
          </h2>
          <ol
            style={{
              margin: 0,
              paddingLeft: 20,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              color: "var(--ink-700)",
              fontSize: 13.5,
              lineHeight: 1.6,
            }}
          >
            {payload.next_actions.map((action, idx) => (
              <li key={`${action}-${idx}`}>{action}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {payload.next_actions_v2
        ? (() => {
            // F-317 V32.M1.5 — preset-driven 专项训练 dark CTA. Hidden
            // when backend's derive_preset_config returned null (every
            // dimension ≥ 80, or v3.1 legacy report with no dimensions).
            const next = payload.next_actions_v2;
            // Backend's `derive_preset_config` always emits v3.2-palette
            // strings, but the shared `InterviewConfigRequest` type
            // unions them with the legacy v3.1 enum values for L0
            // back-compat. Cast through `unknown` so the prefill matches
            // the desktop store's stricter v3.2-only shape.
            const apply = () => {
              setPresetConfig({
                style: next.preset_config.style as InterviewStyleV32,
                directions:
                  next.preset_config.directions as InterviewDirectionV32[],
                durationMinutes:
                  next.preset_config.duration_minutes as InterviewDurationV32,
              });
            };
            return (
              <DarkActionCard
                headline={next.headline}
                reason={next.reason}
                onPrimaryClick={() => {
                  apply();
                  navigate("/config");
                }}
                onSecondaryClick={() => {
                  apply();
                  navigate("/config");
                }}
              />
            );
          })()
        : null}
    </div>
  );
}
