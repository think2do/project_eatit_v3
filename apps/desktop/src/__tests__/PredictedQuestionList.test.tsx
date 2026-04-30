// V32.M2.3.5 — PredictedQuestionList rendering + expand contract.
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type {
  PredictedQuestion,
  PredictedQuestionBank,
  PredictedQuestionCategory,
} from "@eatit/shared-types";

import { PredictedQuestionList } from "@/pages/upload/PredictedQuestionList";

afterEach(() => cleanup());

function makeQuestion(
  category: PredictedQuestionCategory,
  i: number,
): PredictedQuestion {
  return {
    category,
    question: `${category} 问题 ${i}`,
    why_likely: `${category} 理由 ${i}`,
    related_evidence: `${category} 证据 ${i}`,
  };
}

const FULL_BANK: PredictedQuestionBank = {
  questions: [
    makeQuestion("company-business", 1),
    makeQuestion("company-business", 2),
    makeQuestion("industry-judgment", 1),
    makeQuestion("industry-judgment", 2),
    makeQuestion("project-deepdive", 1),
    makeQuestion("project-deepdive", 2),
    makeQuestion("general-pm", 1),
    makeQuestion("general-pm", 2),
  ],
  generated_at: "2026-04-30T12:00:00+00:00",
  sources: ["jd", "resume", "research"],
};

describe("PredictedQuestionList", () => {
  it("renders all 4 category buckets even when some are empty", () => {
    const sparse: PredictedQuestionBank = {
      ...FULL_BANK,
      // 8-min, all in one category
      questions: Array.from({ length: 8 }, (_, i) => makeQuestion("general-pm", i)),
    };
    const { getByTestId } = render(<PredictedQuestionList bank={sparse} />);
    expect(getByTestId("predicted-category-company-business")).toBeTruthy();
    expect(getByTestId("predicted-category-industry-judgment")).toBeTruthy();
    expect(getByTestId("predicted-category-project-deepdive")).toBeTruthy();
    expect(getByTestId("predicted-category-general-pm")).toBeTruthy();
  });

  it("renders source chips for every entry in `sources`", () => {
    const { getAllByTestId } = render(<PredictedQuestionList bank={FULL_BANK} />);
    const sources = getAllByTestId("predicted-source");
    expect(sources.length).toBe(3);
    expect(sources.map((el) => el.textContent)).toEqual([
      "岗位 JD",
      "简历",
      "联网情报",
    ]);
  });

  it("renders all 8 questions across the buckets", () => {
    const { getAllByTestId } = render(<PredictedQuestionList bank={FULL_BANK} />);
    expect(getAllByTestId("predicted-question").length).toBe(8);
  });

  it("hides why_likely + related_evidence by default and shows on click", () => {
    const { getAllByTestId, queryAllByTestId } = render(
      <PredictedQuestionList bank={FULL_BANK} />,
    );
    expect(queryAllByTestId("predicted-question-detail").length).toBe(0);
    const firstQuestion = getAllByTestId("predicted-question")[0];
    const button = firstQuestion.querySelector("button")!;
    fireEvent.click(button);
    expect(queryAllByTestId("predicted-question-detail").length).toBe(1);
  });

  it("toggles individual questions independently", () => {
    const { getAllByTestId, queryAllByTestId } = render(
      <PredictedQuestionList bank={FULL_BANK} />,
    );
    const questions = getAllByTestId("predicted-question");
    fireEvent.click(questions[0].querySelector("button")!);
    fireEvent.click(questions[1].querySelector("button")!);
    expect(queryAllByTestId("predicted-question-detail").length).toBe(2);
    fireEvent.click(questions[0].querySelector("button")!);
    expect(queryAllByTestId("predicted-question-detail").length).toBe(1);
  });

  it("renders the 道 count in the header from bank.questions.length", () => {
    const { container } = render(<PredictedQuestionList bank={FULL_BANK} />);
    expect(container.textContent).toContain("可能会被问到的 8 道题");
  });
});
