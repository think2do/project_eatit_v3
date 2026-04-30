// V32.M2.3.5 — IndustryCard rendering contract.
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { IndustryProfile } from "@eatit/shared-types";

import { IndustryCard } from "@/pages/upload/IndustryCard";

afterEach(() => cleanup());

const FULL_INDUSTRY: IndustryProfile = {
  name: "短视频",
  landscape_summary: "中国短视频行业进入存量竞争阶段。",
  key_metrics: ["DAU", "时长", "广告 ARPU"],
  typical_pain_points: ["内容审核成本", "创作者生态"],
  competitors_in_jd_ctx: ["快手", "腾讯视频号"],
};

describe("IndustryCard", () => {
  it("renders industry name and landscape_summary", () => {
    const { getByText, container } = render(
      <IndustryCard industry={FULL_INDUSTRY} />,
    );
    expect(getByText("短视频")).toBeTruthy();
    expect(container.textContent).toContain("中国短视频行业进入存量竞争阶段");
  });

  it("renders all 3 key_metrics chips", () => {
    const { getAllByTestId } = render(<IndustryCard industry={FULL_INDUSTRY} />);
    const metrics = getAllByTestId("industry-metric");
    expect(metrics.length).toBe(3);
    expect(metrics.map((el) => el.textContent)).toEqual([
      "DAU",
      "时长",
      "广告 ARPU",
    ]);
  });

  it("renders pain_points and competitors in their own buckets", () => {
    const { getAllByTestId } = render(<IndustryCard industry={FULL_INDUSTRY} />);
    expect(getAllByTestId("industry-pain-point").length).toBe(2);
    expect(getAllByTestId("industry-competitor").length).toBe(2);
  });

  it("falls back to em-dash when competitors_in_jd_ctx is empty", () => {
    const sparse: IndustryProfile = {
      ...FULL_INDUSTRY,
      competitors_in_jd_ctx: [],
    };
    const { queryAllByTestId, container } = render(
      <IndustryCard industry={sparse} />,
    );
    expect(queryAllByTestId("industry-competitor").length).toBe(0);
    expect(container.textContent).toContain("—");
  });

  it("preserves shape on minimal-evidence industries", () => {
    // Hits Pydantic min_length so this is a real production lower bound:
    // 3 metrics + 2 pain points + 0 competitors.
    const { getAllByTestId, queryAllByTestId } = render(
      <IndustryCard
        industry={{
          ...FULL_INDUSTRY,
          competitors_in_jd_ctx: [],
        }}
      />,
    );
    expect(getAllByTestId("industry-metric").length).toBe(3);
    expect(getAllByTestId("industry-pain-point").length).toBe(2);
    expect(queryAllByTestId("industry-competitor").length).toBe(0);
  });
});
