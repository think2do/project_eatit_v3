// V32.M1.1.X-followup — DirectionProgressCard render coverage.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DirectionProgressCard } from "@/pages/interview/DirectionProgressCard";

afterEach(() => cleanup());

describe("DirectionProgressCard", () => {
  it("renders one row per supplied direction with done/total mono", () => {
    const { getByTestId } = render(
      <DirectionProgressCard
        rows={[
          { id: "ai-insight", label: "AI 场景洞察", done: 1, total: 3, active: true },
          { id: "data-driven", label: "数据驱动决策", done: 0, total: 3 },
        ]}
      />,
    );
    expect(getByTestId("direction-progress-card")).toHaveTextContent(
      "提问方向进度",
    );
    expect(getByTestId("direction-progress-row-ai-insight")).toHaveTextContent(
      "AI 场景洞察",
    );
    expect(getByTestId("direction-progress-row-ai-insight")).toHaveTextContent(
      "1/3",
    );
    expect(getByTestId("direction-progress-row-data-driven")).toHaveTextContent(
      "0/3",
    );
  });

  it("lights up the active row via data-active and bullet glyph", () => {
    const { getByTestId } = render(
      <DirectionProgressCard
        rows={[
          { id: "ai-insight", label: "AI 场景洞察", done: 1, total: 3, active: true },
          { id: "data-driven", label: "数据驱动决策", done: 0, total: 3 },
        ]}
      />,
    );
    expect(getByTestId("direction-progress-row-ai-insight")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(getByTestId("direction-progress-row-data-driven")).toHaveAttribute(
      "data-active",
      "false",
    );
    // Bullet ● appears only for active rows
    expect(getByTestId("direction-progress-row-ai-insight").textContent).toContain(
      "●",
    );
    expect(
      getByTestId("direction-progress-row-data-driven").textContent,
    ).not.toContain("●");
  });

  it("clamps progress bar to 0..100 for malformed rows", () => {
    const { getByTestId } = render(
      <DirectionProgressCard
        rows={[
          { id: "ai-insight", label: "AI 场景洞察", done: 9, total: 3 },
          { id: "blank", label: "Blank", done: 0, total: 0 },
        ]}
      />,
    );
    const overflow = getByTestId(
      "direction-progress-row-ai-insight",
    ).querySelector(".bar > i") as HTMLElement | null;
    expect(overflow!.style.width).toBe("100%");
    const zero = getByTestId(
      "direction-progress-row-blank",
    ).querySelector(".bar > i") as HTMLElement | null;
    expect(zero!.style.width).toBe("0%");
  });
});
