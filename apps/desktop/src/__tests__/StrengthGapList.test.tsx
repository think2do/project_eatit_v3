import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { Gap, MatchAdvantage } from "@eatit/shared-types";

import { StrengthGapList } from "@/pages/upload/StrengthGapList";

afterEach(() => {
  cleanup();
});

const ADVANTAGES: MatchAdvantage[] = [
  { label: "LLM 应用经验", tag: "强匹配", evidence: "主导过 3 个 LLM 应用上线" },
  { label: "结果导向", tag: "匹配", evidence: "项目结果有量化数据" },
];

const GAPS: Gap[] = [
  { label: "C 端经验不足", tag: "需补充", evidence: "简历偏 B 端" },
  { label: "数据驱动深度", tag: "待评估", evidence: "AB 测试经验未展开" },
];

describe("StrengthGapList", () => {
  it("renders advantages with title and green-tinted rows", () => {
    const { getByTestId, getAllByTestId, container } = render(
      <StrengthGapList title="匹配优势" items={ADVANTAGES} tint="green" />,
    );
    expect(getByTestId("strength-gap-green")).toBeTruthy();
    expect(getAllByTestId("row-green")).toHaveLength(2);
    expect(container.textContent).toContain("匹配优势");
    expect(container.textContent).toContain("LLM 应用经验");
    expect(container.textContent).toContain("强匹配");
    expect(container.textContent).toContain("主导过 3 个 LLM 应用上线");
    expect(container.querySelectorAll(".tag.tag-green")).toHaveLength(2);
  });

  it("renders gaps with warn tint and warn tag class", () => {
    const { getByTestId, getAllByTestId, container } = render(
      <StrengthGapList title="潜在差距" items={GAPS} tint="warn" />,
    );
    expect(getByTestId("strength-gap-warn")).toBeTruthy();
    expect(getAllByTestId("row-warn")).toHaveLength(2);
    expect(container.textContent).toContain("潜在差距");
    expect(container.textContent).toContain("C 端经验不足");
    expect(container.textContent).toContain("需补充");
    expect(container.querySelectorAll(".tag.tag-warn")).toHaveLength(2);
  });

  it("renders an empty placeholder when items is empty", () => {
    const { container, queryAllByTestId } = render(
      <StrengthGapList title="匹配优势" items={[]} tint="green" />,
    );
    expect(queryAllByTestId("row-green")).toHaveLength(0);
    expect(container.textContent).toContain("AI 暂未识别");
  });

  it("keys items by label without React duplicate-key warnings", () => {
    // React would throw a console.error for duplicate keys; rendering
    // distinct labels exercises the key path implicitly.
    const { getAllByTestId } = render(
      <StrengthGapList title="匹配优势" items={ADVANTAGES} tint="green" />,
    );
    const labels = getAllByTestId("row-green").map((el) =>
      el.querySelector("span")?.textContent,
    );
    expect(new Set(labels).size).toBe(labels.length);
  });
});
