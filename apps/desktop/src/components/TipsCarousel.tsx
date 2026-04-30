import { useEffect, useState } from "react";

import { getFallbackTips, type TipsCard } from "@/lib/tips";

export type TipsCarouselSize = "small" | "large" | "full";

interface Props {
  tips: TipsCard[];
  size?: TipsCarouselSize;
  // Set true the moment the surrounding async op finishes; the carousel
  // freezes auto-advance and renders a one-shot "已完成 ✓" plate, then
  // calls `onCompleted` after the transition window so the parent can
  // unmount or swap to the success view.
  completing?: boolean;
  onCompleted?: () => void;
  // 4500ms keeps a tip on screen long enough to read but short enough
  // that a 20s parse cycles through 4-5 cards.
  intervalMs?: number;
}

const DEFAULT_INTERVAL_MS = 4500;
const COMPLETION_TRANSITION_MS = 400;

const WIDTH_BY_SIZE: Record<TipsCarouselSize, number | string> = {
  small: 360,
  large: 540,
  full: "100%",
};

export function TipsCarousel({
  tips,
  size = "small",
  completing = false,
  onCompleted,
  intervalMs = DEFAULT_INTERVAL_MS,
}: Props): JSX.Element {
  // Hard-coded fallback so the carousel never renders an empty card if
  // the static-import import resolution silently yields an empty list.
  const effectiveTips = tips.length > 0 ? tips : getFallbackTips();

  const [activeIndex, setActiveIndex] = useState(0);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    if (completing) return;
    if (effectiveTips.length <= 1) return;
    const t = window.setInterval(() => {
      setActiveIndex((i) => (i + 1) % effectiveTips.length);
    }, intervalMs);
    return () => window.clearInterval(t);
  }, [effectiveTips.length, intervalMs, completing]);

  useEffect(() => {
    if (!completing) return;
    setShowDone(true);
    const t = window.setTimeout(() => {
      setShowDone(false);
      onCompleted?.();
    }, COMPLETION_TRANSITION_MS);
    return () => window.clearTimeout(t);
  }, [completing, onCompleted]);

  return (
    <div style={{ width: WIDTH_BY_SIZE[size], margin: "0 auto" }}>
      <div
        className="card card-pad-lg"
        style={{ background: "var(--bg-warm)" }}
      >
        {showDone ? (
          <div
            className="row"
            style={{
              gap: 8,
              color: "var(--brand)",
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            <span aria-hidden>✓</span>
            <span>已完成</span>
          </div>
        ) : (
          <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>
            <span style={{ color: "var(--brand-ink)", fontWeight: 600 }}>
              面试 Tip ·{" "}
            </span>
            <span>{effectiveTips[activeIndex]?.content ?? ""}</span>
          </div>
        )}
      </div>
      <div
        className="row"
        style={{ justifyContent: "center", gap: 6, marginTop: 12 }}
      >
        {effectiveTips.map((tip, i) => (
          <span
            key={tip.id}
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background:
                i === activeIndex ? "var(--brand)" : "var(--ink-200)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
