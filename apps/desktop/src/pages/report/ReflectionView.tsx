import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import type { ReflectionReport } from "@eatit/shared-types";
import { getReflection } from "@/api/reflections";
import { TipsCarousel } from "@/components/TipsCarousel";
import { selectTips } from "@/lib/tips";
import { useAppStore } from "@/stores/app-store";
import { MockDialogue } from "@/pages/report/MockDialogue";
import { PerQuestionCoachingCard } from "@/pages/report/PerQuestionCoachingCard";

// F-322 V32.M3.2.3 — ReportPage "[详细复盘]" tab 的顶级容器。
// State machine:
//   loading   — 首次拉取
//   absent    — API 返回 204(post_report_graph 还没跑完)
//   running   — row 存在但 status === "running",轮询直到 ok / failed
//   ok        — 正常渲染
//   failed    — 显示降级 UI + 重试按钮(POST 触发器在 M3.2.X audit-fix
//               引入,现在重试只是 refetch — 并不会重新 fire trigger)
//   error     — 网络 / 其他异常

type ViewState =
  | { kind: "loading" }
  | { kind: "absent" }
  | { kind: "running"; data: ReflectionReport }
  | { kind: "ok"; data: ReflectionReport }
  | { kind: "failed"; data: ReflectionReport | null }
  | { kind: "error"; message: string };

const POLL_INTERVAL_MS = 2_000;
// Reflection 是 LLM-heavy 任务(全部 turns + report payload),给较宽的
// 等待预算。120s 之后仍未 ok / failed 就放弃轮询,让用户手动点重试。
const POLL_TIMEOUT_MS = 180_000;

function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.detail ?? err.message;
  }
  return err instanceof Error ? err.message : "请求失败";
}

export type ReflectionViewProps = {
  sessionId: string;
};

export function ReflectionView({ sessionId }: ReflectionViewProps): JSX.Element {
  const setReflection = useAppStore((s) => s.setReflection);
  const cached = useAppStore((s) => s.reflection);

  const hasFreshCache =
    cached !== null &&
    cached.session_id === sessionId &&
    cached.status === "ok";
  const [state, setState] = useState<ViewState>(() =>
    hasFreshCache ? { kind: "ok", data: cached } : { kind: "loading" },
  );
  const [retryNonce, setRetryNonce] = useState(0);

  const pollingTipsRef = useRef(selectTips("report_generating", 0));

  useEffect(() => {
    // Skip the network round-trip when the store already has an ``ok``
    // payload for this session; reuse it on first paint to avoid a
    // loading flash on tab switch. ``retryNonce`` increments break out
    // of this short-circuit so the user-visible refresh button always
    // hits the wire.
    if (
      retryNonce === 0 &&
      cached !== null &&
      cached.session_id === sessionId &&
      cached.status === "ok"
    ) {
      return;
    }

    let cancelled = false;
    const started = Date.now();

    async function fetchOnce(): Promise<ReflectionReport | null> {
      return getReflection(sessionId);
    }

    async function ensureAndPoll() {
      setState({ kind: "loading" });
      try {
        const initial = await fetchOnce();
        if (cancelled) return;
        if (initial == null) {
          setState({ kind: "absent" });
          return;
        }
        if (initial.status === "ok") {
          setReflection(initial);
          setState({ kind: "ok", data: initial });
          return;
        }
        if (initial.status === "failed") {
          setReflection(initial);
          setState({ kind: "failed", data: initial });
          return;
        }
        // pending / running → enter the polling loop.
        setState({ kind: "running", data: initial });
      } catch (err) {
        if (!cancelled) setState({ kind: "error", message: extractError(err) });
        return;
      }

      while (!cancelled) {
        if (Date.now() - started > POLL_TIMEOUT_MS) {
          setState({
            kind: "error",
            message: "复盘生成超时,请稍后再试。",
          });
          return;
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (cancelled) return;
        try {
          const fresh = await fetchOnce();
          if (cancelled) return;
          if (fresh == null) {
            // Row was deleted out from under us — surface as failure.
            setState({ kind: "failed", data: null });
            return;
          }
          if (fresh.status === "ok") {
            setReflection(fresh);
            setState({ kind: "ok", data: fresh });
            return;
          }
          if (fresh.status === "failed") {
            setReflection(fresh);
            setState({ kind: "failed", data: fresh });
            return;
          }
          setState({ kind: "running", data: fresh });
        } catch (err) {
          if (!cancelled) setState({ kind: "error", message: extractError(err) });
          return;
        }
      }
    }

    void ensureAndPoll();

    return () => {
      cancelled = true;
    };
    // ``cached`` intentionally NOT in the deps array — we read it once
    // on mount to decide whether to skip the initial fetch. Including it
    // would re-run the effect every time the store updates ``reflection``
    // (which this very effect does on success), creating a refetch loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, retryNonce, setReflection]);

  if (state.kind === "loading") {
    return (
      <div
        className="card card-pad col"
        data-testid="reflection-view-loading"
        style={{ gap: 10 }}
      >
        <div className="row" style={{ gap: 8 }}>
          <Loader2 size={14} className="spin" />
          <div className="body" style={{ margin: 0 }}>
            正在加载复盘报告…
          </div>
        </div>
      </div>
    );
  }

  if (state.kind === "absent") {
    return (
      <div
        className="card card-pad col"
        data-testid="reflection-view-absent"
        style={{ gap: 10 }}
      >
        <div className="row" style={{ gap: 8 }}>
          <Sparkles size={14} color="var(--brand)" />
          <div className="eyebrow">详细复盘</div>
        </div>
        <div className="body" style={{ margin: 0 }}>
          复盘报告将在评估报告就绪后自动生成,通常约 30 秒,稍后再回到此页查看。
        </div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setRetryNonce((v) => v + 1)}
          data-testid="reflection-view-refresh"
        >
          <RefreshCw size={12} />
          刷新
        </button>
      </div>
    );
  }

  if (state.kind === "running") {
    return (
      <div
        className="card card-pad col"
        data-testid="reflection-view-running"
        style={{ gap: 12 }}
      >
        <div className="row" style={{ gap: 8 }}>
          <Loader2 size={14} className="spin" />
          <div
            className="body"
            style={{ margin: 0, fontWeight: 500 }}
          >
            正在为你撰写详细复盘…
          </div>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          通常约 30 秒。在此期间可以看看面试技巧。
        </div>
        <TipsCarousel tips={pollingTipsRef.current} size="full" />
      </div>
    );
  }

  if (state.kind === "failed") {
    return (
      <div
        className="card card-pad col"
        data-testid="reflection-view-failed"
        style={{ gap: 10 }}
      >
        <div className="eyebrow">详细复盘</div>
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
          复盘报告生成失败,稍后再试。失败不影响主报告查看。
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => setRetryNonce((v) => v + 1)}
          data-testid="reflection-view-retry"
        >
          <RefreshCw size={12} />
          重试
        </button>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        className="card card-pad col"
        data-testid="reflection-view-error"
        style={{ gap: 10 }}
      >
        <div className="eyebrow">详细复盘</div>
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
          {state.message}
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => setRetryNonce((v) => v + 1)}
          data-testid="reflection-view-retry"
        >
          <RefreshCw size={12} />
          重试
        </button>
      </div>
    );
  }

  // state.kind === "ok"
  const reflection = state.data;
  return (
    <div
      data-testid="reflection-view-ok"
      className="col"
      style={{ gap: 18 }}
    >
      <section className="card card-pad-lg col" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 8 }}>
          <Sparkles size={14} color="var(--brand)" />
          <div className="eyebrow">复盘总结</div>
        </div>
        <h2
          className="h-serif"
          style={{
            fontSize: 22,
            fontWeight: 400,
            color: "var(--ink-900)",
            margin: 0,
            lineHeight: 1.3,
          }}
        >
          教练给你的下一步建议
        </h2>
        <p className="body" style={{ margin: 0 }}>
          {reflection.executive_summary}
        </p>
      </section>

      {reflection.per_question_coaching.length > 0 ? (
        <section className="col" style={{ gap: 10 }}>
          <div className="eyebrow">逐题教练卡</div>
          {reflection.per_question_coaching.map((c, idx) => (
            <PerQuestionCoachingCard
              key={c.turn_index}
              coaching={c}
              defaultExpanded={idx === 0}
            />
          ))}
        </section>
      ) : null}

      <section className="card card-pad col" style={{ gap: 8 }}>
        <div className="eyebrow">通用成长建议</div>
        <p className="body" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
          {reflection.general_growth_advice}
        </p>
      </section>

      {reflection.mock_followup_dialogue.length > 0 ? (
        <section className="card card-pad col" style={{ gap: 12 }}>
          <div className="eyebrow">追问演练</div>
          <MockDialogue dialogue={reflection.mock_followup_dialogue} />
        </section>
      ) : null}
    </div>
  );
}
