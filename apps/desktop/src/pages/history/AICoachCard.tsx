import { Sparkles } from "lucide-react";
import type { UserInsightCache } from "@eatit/shared-types";

// F-316 / F-318 V32.M3.1.4 — Dashboard AI 推荐卡(linear-gradient
// brand-softer + sparkle + headline + 双按钮). Drives PRD §6.4's
// "AI 推荐" surface from the cross-session insight payload produced by
// CoachAgent (M3.1.1) + persisted to user_insight_cache (M3.1.3).
//
// Render contract:
//   * insight === null OR status !== "ok"  → caller hides this card and
//     shows the progress / failed empty state instead. We render a
//     graceful placeholder if invoked anyway, but the page should not
//     route to this component in those states.
//   * status === "ok"  → headline + headline_detail + 2 actions.
//
// The two actions are wired via callbacks because routing semantics
// belong to HistoryPage:
//   * onViewWeaknesses — scroll to / open recurring weaknesses panel.
//   * onStartTargeted  — kick the "复用上次配置" / preset config flow
//     (the "发起专项训练" button text from the spec).

export type AICoachCardProps = {
  insight: UserInsightCache;
  onViewWeaknesses?: () => void;
  onStartTargeted?: () => void;
};

export function AICoachCard({
  insight,
  onViewWeaknesses,
  onStartTargeted,
}: AICoachCardProps): JSX.Element {
  return (
    <section
      className="card card-pad-lg col"
      data-testid="ai-coach-card"
      data-status={insight.status}
      style={{
        // D2 example exception — the gradient mixes two existing tokens
        // (--brand-softer + --bg-elev) into a soft brand wash. No new
        // hex values are introduced.
        background:
          "linear-gradient(135deg, var(--brand-softer) 0%, var(--bg-elev) 100%)",
        border: "1px solid var(--brand-soft)",
        gap: 14,
      }}
    >
      <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
        <div
          aria-hidden
          style={{
            width: 36,
            height: 36,
            display: "grid",
            placeItems: "center",
            borderRadius: "var(--r-md)",
            background: "var(--brand)",
            color: "white",
            flexShrink: 0,
          }}
        >
          <Sparkles size={18} />
        </div>
        <div className="col grow" style={{ gap: 6 }}>
          <div className="eyebrow">AI 成长教练</div>
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
            {insight.headline}
          </h2>
          <p className="body" style={{ margin: 0 }}>
            {insight.headline_detail}
          </p>
        </div>
      </div>

      {insight.recurring_weaknesses.length > 0 ? (
        <ul
          className="row wrap"
          data-testid="ai-coach-weaknesses"
          style={{ gap: 6, margin: 0, padding: 0, listStyle: "none" }}
        >
          {insight.recurring_weaknesses.map((w) => (
            <li key={w}>
              <span className="tag tag-warn">{w}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="row" style={{ gap: 8 }}>
        <button
          type="button"
          className="btn"
          onClick={onViewWeaknesses}
          data-testid="ai-coach-view-weaknesses"
        >
          查看弱项清单
        </button>
        <button
          type="button"
          className="btn btn-brand"
          onClick={onStartTargeted}
          data-testid="ai-coach-start-targeted"
        >
          发起专项训练
        </button>
      </div>
    </section>
  );
}
