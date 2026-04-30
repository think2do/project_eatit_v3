import type * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ObserverEntry, ObserverTone } from "@/statecharts/interview-machine";
import { LiveObservationCard } from "@/pages/interview/LiveObservationCard";

const TONE_META: Record<ObserverTone, { label: string; dot: string; ink: string; soft: string }> = {
  support: {
    label: "鼓励",
    dot: "var(--brand)",
    ink: "var(--brand-ink)",
    soft: "var(--brand-softer)",
  },
  alert: {
    label: "提醒",
    dot: "var(--warn)",
    ink: "var(--warn)",
    soft: "var(--warn-softer)",
  },
  pivot: {
    label: "收口",
    dot: "var(--info)",
    ink: "var(--info)",
    soft: "var(--info-soft)",
  },
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ObserverPanel({
  observations,
  collapsed,
  onToggle,
  liveObservation,
  showLiveObservationCard,
  footerSlot,
}: {
  observations: ObserverEntry[];
  collapsed: boolean;
  onToggle: () => void;
  // F-309 — text from InterviewerAgentOutput.live_observation, primary
  // source for LiveObservationCard. When null/undefined the card falls
  // back to the latest server.coach.observation entry (A13 dual-track).
  liveObservation?: string | null;
  // The card is the right aside's "third card" per PRD §6.3 — render it
  // only once the page actually has a current question to observe; the
  // page passes false during connecting / pre-first-question.
  showLiveObservationCard?: boolean;
  // F-311 — pinned to the aside's bottom (e.g. KeyboardShortcutHelper).
  footerSlot?: React.ReactNode;
}): JSX.Element {
  if (collapsed) {
    return (
      <aside
        aria-label="AI 观察侧栏(已折叠)"
        style={{
          width: 36,
          borderLeft: "1px solid var(--line)",
          background: "var(--bg-warm)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "12px 0",
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-label="展开 AI 观察侧栏"
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: "1px solid var(--line)",
            background: "var(--bg-elev)",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            color: "var(--ink-700)",
          }}
        >
          <ChevronLeft size={14} />
        </button>
        <div
          style={{
            writingMode: "vertical-rl",
            marginTop: 14,
            fontSize: 11,
            letterSpacing: "0.08em",
            color: "var(--ink-500)",
            textTransform: "uppercase",
          }}
        >
          Observer
        </div>
      </aside>
    );
  }
  return (
    <aside
      aria-label="AI 观察侧栏"
      style={{
        width: 280,
        borderLeft: "1px solid var(--line)",
        background: "var(--bg-warm)",
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minHeight: "100%",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          className="eyebrow"
          style={{ padding: 0, flex: 1, margin: 0 }}
        >
          AI 观察
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label="折叠 AI 观察侧栏"
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: "1px solid var(--line)",
            background: "var(--bg-elev)",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            color: "var(--ink-700)",
          }}
        >
          <ChevronRight size={14} />
        </button>
      </header>
      {showLiveObservationCard ? (
        <LiveObservationCard
          text={liveObservation ?? null}
          fallback={observations[0]?.observation ?? null}
        />
      ) : null}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {observations.length === 0 ? (
          <div
            style={{
              fontSize: 12.5,
              color: "var(--ink-500)",
              lineHeight: 1.6,
            }}
          >
            每轮作答完,这里会有一条 AI 观察。
          </div>
        ) : (
          observations.map((entry) => (
            <ObserverCard key={entry.id} entry={entry} />
          ))
        )}
      </div>
      {footerSlot ? (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          {footerSlot}
        </div>
      ) : null}
    </aside>
  );
}

function ObserverCard({ entry }: { entry: ObserverEntry }): JSX.Element {
  const meta = TONE_META[entry.tone];
  return (
    <div
      className="ds-card"
      style={{
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: meta.soft,
        borderColor: "transparent",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          color: "var(--ink-500)",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: meta.dot,
            display: "inline-block",
          }}
        />
        <span style={{ color: meta.ink, fontWeight: 500 }}>{meta.label}</span>
        <span style={{ marginLeft: "auto" }}>
          第 {entry.turn_index} 轮 · {formatTime(entry.received_at)}
        </span>
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.6,
          color: "var(--ink-900)",
        }}
      >
        {entry.observation}
      </div>
      {entry.actionable ? (
        <div style={{ fontSize: 11, color: meta.ink }}>建议下一轮调整策略</div>
      ) : null}
    </div>
  );
}
