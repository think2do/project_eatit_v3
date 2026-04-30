import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import type { UserInsightCache } from "@eatit/shared-types";

import { AICoachCard } from "@/pages/history/AICoachCard";

afterEach(() => {
  cleanup();
});

const baseInsight: UserInsightCache = {
  user_id: "u-1",
  based_on_session_count: 4,
  based_on_last_session_id: "s-4",
  headline: "继续围绕数据驱动方向做专项训练",
  headline_detail:
    "近三场结构化表达稳定提升;建议接下来重点训练数据指标推导与跨职能协作类问题。",
  recurring_weaknesses: ["指标拆解深度不足", "STAR 收尾仓促"],
  improvement_signals: ["近三场结构化表达稳定提升"],
  next_focus_areas: ["data-driven", "cross-func"],
  generated_at: "2026-04-30T12:00:00+00:00",
  status: "ok",
};

describe("AICoachCard", () => {
  it("renders headline + detail + sparkle eyebrow", () => {
    const { container, getByTestId } = render(
      <AICoachCard insight={baseInsight} />,
    );
    const card = getByTestId("ai-coach-card");
    expect(card.getAttribute("data-status")).toBe("ok");
    expect(container.textContent).toContain("继续围绕数据驱动方向做专项训练");
    expect(container.textContent).toContain("AI 成长教练");
    expect(container.textContent).toContain("STAR 收尾仓促");
  });

  it("renders both action buttons with deterministic labels", () => {
    const { getByTestId } = render(<AICoachCard insight={baseInsight} />);
    expect(getByTestId("ai-coach-view-weaknesses").textContent).toBe(
      "查看弱项清单",
    );
    expect(getByTestId("ai-coach-start-targeted").textContent).toBe(
      "发起专项训练",
    );
  });

  it("invokes onViewWeaknesses + onStartTargeted callbacks", () => {
    const onView = vi.fn();
    const onStart = vi.fn();
    const { getByTestId } = render(
      <AICoachCard
        insight={baseInsight}
        onViewWeaknesses={onView}
        onStartTargeted={onStart}
      />,
    );
    fireEvent.click(getByTestId("ai-coach-view-weaknesses"));
    fireEvent.click(getByTestId("ai-coach-start-targeted"));
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("hides the weakness chip list when none are provided", () => {
    const empty: UserInsightCache = { ...baseInsight, recurring_weaknesses: [] };
    const { queryByTestId } = render(<AICoachCard insight={empty} />);
    expect(queryByTestId("ai-coach-weaknesses")).toBeNull();
  });

  it("uses the brand-softer linear-gradient (D2 token-only)", () => {
    const { getByTestId } = render(<AICoachCard insight={baseInsight} />);
    const card = getByTestId("ai-coach-card");
    expect(card.style.background).toContain("linear-gradient");
    // D2 — no raw hex colours; both stops reference --brand-softer / --bg-elev.
    expect(card.style.background).toContain("var(--brand-softer)");
    expect(card.style.background).toContain("var(--bg-elev)");
  });
});
