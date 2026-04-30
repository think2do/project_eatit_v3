import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import type { PerQuestionCoaching } from "@eatit/shared-types";

import { PerQuestionCoachingCard } from "@/pages/report/PerQuestionCoachingCard";

afterEach(() => {
  cleanup();
});

const coaching: PerQuestionCoaching = {
  turn_index: 1,
  question: "如何拆解一个新业务的北极星指标",
  your_answer_summary: "只列了 DAU 没分层",
  diagnosis: "可加强指标拆解的层级表达,补充驱动指标",
  model_answer_outline: ["先讲北极星", "再讲驱动指标", "用一句话收尾"],
  key_phrases_to_use: ["北极星", "驱动指标", "STAR"],
  mistakes_to_avoid: ["建议下次注意指标分层"],
  recommended_resources: ["《精益数据分析》"],
};

describe("PerQuestionCoachingCard", () => {
  it("renders question + diagnosis preview when collapsed", () => {
    const { getByTestId, container } = render(
      <PerQuestionCoachingCard coaching={coaching} />,
    );
    const card = getByTestId("per-question-card-1");
    expect(card.getAttribute("data-expanded")).toBe("false");
    expect(container.textContent).toContain(coaching.question);
    expect(container.textContent).toContain(coaching.diagnosis);
    // Outline + key phrases live behind the expand toggle.
    expect(container.textContent).not.toContain("先讲北极星");
  });

  it("expands to show outline + key phrases + mistakes_to_avoid", () => {
    const { getByTestId, container } = render(
      <PerQuestionCoachingCard coaching={coaching} />,
    );
    fireEvent.click(getByTestId("per-question-card-toggle-1"));
    expect(getByTestId("per-question-card-1").getAttribute("data-expanded")).toBe(
      "true",
    );
    expect(container.textContent).toContain("先讲北极星");
    expect(container.textContent).toContain("北极星");
    expect(container.textContent).toContain("建议下次注意指标分层");
  });

  it("starts expanded when defaultExpanded=true", () => {
    const { getByTestId, container } = render(
      <PerQuestionCoachingCard coaching={coaching} defaultExpanded />,
    );
    expect(getByTestId("per-question-card-1").getAttribute("data-expanded")).toBe(
      "true",
    );
    expect(container.textContent).toContain("先讲北极星");
  });

  it("hides recommended_resources section when list is empty", () => {
    const noRes: PerQuestionCoaching = {
      ...coaching,
      recommended_resources: [],
    };
    const { container } = render(
      <PerQuestionCoachingCard coaching={noRes} defaultExpanded />,
    );
    expect(container.textContent).not.toContain("拓展资料");
  });

  it("renders 1-based turn label (turn_index 0 → 第 1 题)", () => {
    const first: PerQuestionCoaching = { ...coaching, turn_index: 0 };
    const { container } = render(<PerQuestionCoachingCard coaching={first} />);
    expect(container.textContent).toContain("第 1 题");
  });
});
