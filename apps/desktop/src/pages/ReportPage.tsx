import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import type { InterviewReportResponse } from "@eatit/shared-types";
import { generateReport, getSessionReport } from "@/api/sessions";
import { useSessionStatusStore } from "@/stores/sessionStatus-store";
import { HeroScoreCard } from "@/pages/report/HeroScoreCard";
import { DimensionsSummaryCard } from "@/pages/report/DimensionsSummaryCard";
import { QuestionReview } from "@/pages/report/QuestionReview";
import { TipsCarousel } from "@/components/TipsCarousel";
import { selectTips } from "@/lib/tips";
// Side-effect stylesheet: adds @media print rules that hide chrome.
import "@/pages/report/print.css";

type ReportState =
  | { kind: "loading" }
  | { kind: "generating" }
  | { kind: "ready"; data: InterviewReportResponse }
  | { kind: "error"; message: string };

function extractError(err: unknown): string {
  return err instanceof Error ? err.message : "请求失败";
}

export function ReportPage(): JSX.Element {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<ReportState>({ kind: "loading" });
  const reportTips = useMemo(() => selectTips("report_generating", 0), []);
  const markRead = useSessionStatusStore((s) => s.markRead);

  // M8.1: clear the sidebar unread badge when the user arrives on this page.
  useEffect(() => {
    if (sessionId) markRead(sessionId);
  }, [sessionId, markRead]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    // v3.4: generateReport is synchronous — it awaits the LLM call inline
    // and writes the report row before returning.  The legacy v3.3 polling
    // loop had a 120s budget that *included* the LLM wait, which produced
    // a misleading "报告生成超时" while the report was still in flight —
    // especially with thinking models like doubao-seed-1-8 that routinely
    // take 60-90s per call.  The bound on wait time now lives at Swift-side
    // URLSession.timeoutIntervalForRequest (180s, see
    // LLMGateway.makeProductionSession); JS just awaits.
    async function ensureAndLoad() {
      setState({ kind: "loading" });

      // Existing report already in DB? Render and bail.
      try {
        const existing = await getSessionReport(sessionId!);
        if (!cancelled) setState({ kind: "ready", data: existing });
        return;
      } catch {
        // No row yet — fall through to generateReport.
      }

      setState({ kind: "generating" });

      try {
        await generateReport(sessionId!);
      } catch (err) {
        if (!cancelled) setState({ kind: "error", message: extractError(err) });
        return;
      }
      if (cancelled) return;

      try {
        const response = await getSessionReport(sessionId!);
        if (!cancelled) setState({ kind: "ready", data: response });
      } catch (err) {
        if (!cancelled) setState({ kind: "error", message: extractError(err) });
      }
    }

    void ensureAndLoad();

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
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-900)" }}>
              {state.kind === "generating"
                ? "AI 正在生成本场面试报告..."
                : "正在加载报告..."}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 4 }}>
              通常约 20 秒。在此期间可以看看面试技巧。
            </div>
          </div>
          <TipsCarousel tips={reportTips} size="full" />
        </div>
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
          rightSlot={
            payload.dimensions && payload.dimensions.length > 0 ? (
              <DimensionsSummaryCard dimensions={payload.dimensions} />
            ) : undefined
          }
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

      {/* 逐题复盘 — 4 字段:问题 / 原始回答 / AI 建议回答 / AI 总结及建议 */}
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
                rawAnswer={r.raw_answer ?? ""}
                aiSuggestedAnswer={r.ai_suggested_answer ?? ""}
                aiFeedback={r.ai_feedback}
                defaultExpanded={idx === 0}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
