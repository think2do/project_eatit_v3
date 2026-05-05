import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import type {
  MetaReportDetailResponse,
  MetaReportFailurePayload,
  MetaReportPayload,
  PassProbabilityPoint,
} from "@eatit/shared-types";
import { getMetaReport } from "@/api/metaReports";

type PageState =
  | { kind: "loading" }
  | { kind: "generating" }
  | { kind: "ready"; data: MetaReportDetailResponse }
  | { kind: "failed"; detail: string }
  | { kind: "error"; message: string };

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 180_000;

function extractError(err: unknown): string {
  return err instanceof Error ? err.message : "请求失败";
}

function isFailurePayload(
  payload: MetaReportDetailResponse["payload"],
): payload is MetaReportFailurePayload {
  return !!payload && "detail" in payload && !("overall_trend_summary" in payload);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function MetaReportPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    cancelledRef.current = false;
    const started = Date.now();

    async function poll() {
      while (!cancelledRef.current) {
        if (Date.now() - started > POLL_TIMEOUT_MS) {
          setState({ kind: "error", message: "生成超时,请稍后刷新重试" });
          return;
        }
        try {
          const data = await getMetaReport(id!);
          if (cancelledRef.current) return;
          if (data.status === "ready") {
            setState({ kind: "ready", data });
            return;
          }
          if (data.status === "failed") {
            const detail = isFailurePayload(data.payload)
              ? data.payload.detail
              : "生成失败";
            setState({ kind: "failed", detail });
            return;
          }
          setState({ kind: "generating" });
        } catch (err) {
          // v3.4: triggerMetaReport runs synchronously; polling loop should not normally hit a transient error.
          if (!cancelledRef.current) setState({ kind: "error", message: extractError(err) });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    }

    void poll();
    return () => {
      cancelledRef.current = true;
    };
  }, [id]);

  const header = useMemo(
    () => (
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div
          onClick={() => navigate("/meta-reports")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter") navigate("/meta-reports");
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            fontSize: 12,
            color: "var(--ink-500)",
          }}
        >
          <ArrowLeft size={14} /> 返回综合分析列表
        </div>
        <div className="eyebrow">07 · 综合分析</div>
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
          你这段时间的面试趋势
        </h1>
      </header>
    ),
    [navigate],
  );

  if (!id) {
    return <div style={{ color: "var(--ink-500)" }}>缺少 meta-report id。</div>;
  }

  if (state.kind === "loading" || state.kind === "generating") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {header}
        <div
          className="ds-card"
          style={{ padding: 22, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <div className="shimmer" style={{ height: 16, width: "40%" }} />
          <div className="shimmer" style={{ height: 10, width: "80%" }} />
          <div className="shimmer" style={{ height: 10, width: "72%" }} />
          <div className="shimmer" style={{ height: 10, width: "68%" }} />
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-500)" }}>通常约 30 秒</div>
      </div>
    );
  }

  if (state.kind === "failed") {
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
          生成失败:{state.detail}
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

  const payload = state.data.payload as MetaReportPayload;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {header}

      <section
        className="ds-card"
        style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}
      >
        <h2
          className="h-serif"
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 400,
            color: "var(--ink-900)",
          }}
        >
          趋势小结
        </h2>
        <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--ink-900)" }}>
          {payload.overall_trend_summary}
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
          覆盖 {state.data.covered_session_ids.length} 场面试 · 生成于{" "}
          {formatDate(state.data.created_at)}
        </div>
      </section>

      <section
        className="ds-card"
        style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}
      >
        <div className="eyebrow">通过概率轨迹</div>
        <ProbabilityTrajectory points={payload.pass_probability_series} />
      </section>

      {payload.recurring_weaknesses.length > 0 ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="eyebrow">反复出现的弱项</div>
          {payload.recurring_weaknesses.map((item) => (
            <RecurringWeaknessRow key={item.aspect} item={item} />
          ))}
        </section>
      ) : null}

      {payload.improvement_signals.length > 0 ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="eyebrow">已经看到的进步</div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {payload.improvement_signals.map((signal, idx) => (
              <div
                key={`${signal.aspect}-${idx}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  borderRadius: "var(--r-pill)",
                  background: "var(--brand-soft)",
                  color: "var(--brand-ink)",
                  fontSize: 13,
                  border: "1px solid var(--brand-soft)",
                }}
              >
                <span style={{ fontWeight: 600 }}>{signal.aspect}</span>
                <span>
                  {signal.from_verdict} → {signal.to_verdict}
                </span>
                <span
                  className="mono"
                  style={{ fontSize: 11, color: "var(--ink-500)" }}
                >
                  {shortId(signal.earlier_session_id)} →{" "}
                  {shortId(signal.later_session_id)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {payload.next_focus_areas.length > 0 ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="eyebrow">下一步重点补强</div>
          {payload.next_focus_areas.map((item, idx) => (
            <div
              key={`${item.aspect}-${idx}`}
              className="ds-card"
              style={{
                padding: 18,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-900)" }}>
                {item.aspect}
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-700)", lineHeight: 1.6 }}>
                {item.reason}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--brand-ink)",
                  background: "var(--brand-softer)",
                  padding: "8px 12px",
                  borderRadius: "var(--r-sm)",
                  marginTop: 4,
                  lineHeight: 1.6,
                }}
              >
                {item.suggested_prep}
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function shortId(sessionId: string): string {
  return sessionId.slice(0, 8);
}

function RecurringWeaknessRow({
  item,
}: {
  item: MetaReportPayload["recurring_weaknesses"][number];
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const toggle = () => setExpanded((v) => !v);
  return (
    <div className="ds-card" style={{ padding: 0 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") toggle();
        }}
        style={{
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          cursor: "pointer",
        }}
      >
        <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--ink-900)" }}>
          {item.aspect}
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "2px 10px",
            fontSize: 11.5,
            fontWeight: 600,
            borderRadius: "var(--r-pill)",
            background: "var(--warn-soft)",
            color: "var(--warn)",
          }}
        >
          {item.occurrence_count} 次
        </span>
        {expanded ? (
          <ChevronDown size={16} color="var(--ink-400)" />
        ) : (
          <ChevronRight size={16} color="var(--ink-400)" />
        )}
      </div>
      {expanded ? (
        <div
          style={{
            padding: "0 18px 16px",
            borderTop: "1px solid var(--line)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 12 }}>
            覆盖 session:
            {item.session_ids.map((sid, idx) => (
              <span
                key={sid}
                className="mono"
                style={{ marginLeft: idx === 0 ? 6 : 4 }}
              >
                {shortId(sid)}
              </span>
            ))}
          </div>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {item.evidence_quotes.map((quote, idx) => (
              <li
                key={`${quote}-${idx}`}
                style={{
                  fontSize: 13,
                  color: "var(--ink-700)",
                  padding: "8px 12px",
                  borderRadius: "var(--r-sm)",
                  background: "var(--bg-sunken)",
                  lineHeight: 1.6,
                }}
              >
                “{quote}”
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ProbabilityTrajectory({
  points,
}: {
  points: PassProbabilityPoint[];
}): JSX.Element {
  if (points.length === 0) {
    return (
      <div style={{ color: "var(--ink-500)", fontSize: 13 }}>暂无数据点。</div>
    );
  }
  const width = 640;
  const height = 180;
  const padX = 32;
  const padY = 24;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const n = points.length;
  const xFor = (idx: number) =>
    n === 1 ? width / 2 : padX + (idx * innerW) / (n - 1);
  const yFor = (prob: number) =>
    padY + innerH - (Math.max(0, Math.min(100, prob)) / 100) * innerH;
  const polyline = points
    .map((p, idx) => `${xFor(idx).toFixed(1)},${yFor(p.pass_probability).toFixed(1)}`)
    .join(" ");
  return (
    <div style={{ overflow: "auto" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="通过概率随时间变化"
        style={{ width: "100%", maxWidth: width, height }}
      >
        <line
          x1={padX}
          y1={padY}
          x2={padX}
          y2={height - padY}
          stroke="var(--line)"
          strokeWidth={1}
        />
        <line
          x1={padX}
          y1={height - padY}
          x2={width - padX}
          y2={height - padY}
          stroke="var(--line)"
          strokeWidth={1}
        />
        {[0, 50, 100].map((tick) => (
          <g key={tick}>
            <text
              x={padX - 8}
              y={yFor(tick) + 3}
              fontSize={10}
              textAnchor="end"
              fill="var(--ink-400)"
            >
              {tick}
            </text>
            <line
              x1={padX}
              y1={yFor(tick)}
              x2={width - padX}
              y2={yFor(tick)}
              stroke="var(--line)"
              strokeDasharray="2 4"
              strokeWidth={1}
            />
          </g>
        ))}
        <polyline
          points={polyline}
          fill="none"
          stroke="var(--brand)"
          strokeWidth={2}
        />
        {points.map((p, idx) => (
          <g key={p.session_id}>
            <circle
              cx={xFor(idx)}
              cy={yFor(p.pass_probability)}
              r={4}
              fill="var(--brand)"
            />
            <text
              x={xFor(idx)}
              y={yFor(p.pass_probability) - 10}
              fontSize={10}
              textAnchor="middle"
              fill="var(--ink-700)"
            >
              {p.pass_probability}
            </text>
            <text
              x={xFor(idx)}
              y={height - padY + 14}
              fontSize={10}
              textAnchor="middle"
              fill="var(--ink-500)"
            >
              {formatDate(p.session_created_at)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
