/**
 * M8.4 — ReportPage component tests.
 *
 * Tests cover the new ai-answer-first layout:
 *   1. QuestionReview renders ai_suggested_answer_markdown when present
 *   2. QuestionReview falls back to ai_suggested_answer when markdown is empty
 *   3. Raw answer is collapsed by default inside <details>
 *   4. DimensionSidebar renders all 5 dimension names directly (L0 red line)
 *   5. DimensionSidebar renders overall score when provided
 *   6. personaName appears in the "X 这样回答" heading
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";

import { QuestionReview } from "@/pages/report/QuestionReview";
import { DimensionSidebar } from "@/pages/report/DimensionSidebar";
import type { DimensionName } from "@eatit/shared-types";

afterEach(() => {
  cleanup();
});

// ─── QuestionReview fixtures ────────────────────────────────────────────────

const baseReviewProps = {
  index: 1,
  questionTag: "产品思维",
  questionText: "如何拆解一个新业务的北极星指标？",
  score: 82,
  tone: "good" as const,
  rawAnswer: "我会先看 DAU 再分层。",
  aiSuggestedAnswer: "先明确北极星指标的定义，再拆解驱动指标。",
  aiSuggestedAnswerMarkdown: "",
  aiFeedback: "结构清晰，建议补充驱动指标层级。",
  personaName: "Sarah",
};

// ─── DimensionSidebar fixtures ───────────────────────────────────────────────

const FIVE_DIMENSIONS: Array<{
  name: DimensionName;
  description: string;
  score: number;
  evidence_chips: Array<{ text: string; good: boolean }>;
}> = [
  { name: "专业深度", description: "技术理解深度", score: 85, evidence_chips: [] },
  { name: "结构化表达", description: "逻辑清晰", score: 72, evidence_chips: [] },
  { name: "批判性思考", description: "分析问题", score: 60, evidence_chips: [] },
  { name: "业务直觉", description: "商业嗅觉", score: 78, evidence_chips: [] },
  { name: "沟通节奏", description: "表达节奏", score: 90, evidence_chips: [] },
];

// ─── Tests: QuestionReview ───────────────────────────────────────────────────

describe("QuestionReview — M8.4 ai-answer-first layout", () => {
  it("renders ai_suggested_answer_markdown when it is non-empty (preferred field)", () => {
    const { container } = render(
      <QuestionReview
        {...baseReviewProps}
        aiSuggestedAnswerMarkdown="markdown 专属答案内容"
        aiSuggestedAnswer="旧字段内容"
      />,
    );
    expect(container.textContent).toContain("markdown 专属答案内容");
    expect(container.textContent).not.toContain("旧字段内容");
  });

  it("falls back to ai_suggested_answer when markdown field is empty string", () => {
    const { container } = render(
      <QuestionReview
        {...baseReviewProps}
        aiSuggestedAnswerMarkdown=""
        aiSuggestedAnswer="旧字段内容（fallback）"
      />,
    );
    expect(container.textContent).toContain("旧字段内容（fallback）");
  });

  it("falls back to ai_suggested_answer when markdown field is undefined", () => {
    const props = { ...baseReviewProps };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (props as any).aiSuggestedAnswerMarkdown;
    const { container } = render(
      <QuestionReview
        {...props}
        aiSuggestedAnswer="fallback 旧字段"
      />,
    );
    expect(container.textContent).toContain("fallback 旧字段");
  });

  it("raw answer is inside a <details> element (collapsed by default)", () => {
    const { container } = render(<QuestionReview {...baseReviewProps} />);
    const details = container.querySelector("details.raw-answer-fold");
    expect(details).not.toBeNull();
    // <details> without `open` attribute is collapsed by default.
    expect(details?.hasAttribute("open")).toBe(false);
    // The raw answer text should be in the DOM (inside details) but not visible.
    expect(container.textContent).toContain("我的原始作答");
  });

  it("shows persona name in the ai-answer heading", () => {
    const { container } = render(
      <QuestionReview {...baseReviewProps} personaName="Marcus" />,
    );
    expect(container.textContent).toContain("Marcus 这样回答");
  });

  it("shows '（暂无范例答）' placeholder when both answer fields are empty", () => {
    const { container } = render(
      <QuestionReview
        {...baseReviewProps}
        aiSuggestedAnswerMarkdown=""
        aiSuggestedAnswer=""
      />,
    );
    expect(container.textContent).toContain("暂无范例答");
  });

  it("renders the question text and tag", () => {
    const { container } = render(<QuestionReview {...baseReviewProps} />);
    expect(container.textContent).toContain("如何拆解一个新业务的北极星指标");
    expect(container.textContent).toContain("产品思维");
  });
});

// ─── Tests: DimensionSidebar ─────────────────────────────────────────────────

describe("DimensionSidebar — M8.4 sidebar layout (L0 red line)", () => {
  it("renders all 5 dimension names directly from payload (no translation)", () => {
    const { container } = render(
      <DimensionSidebar dimensions={FIVE_DIMENSIONS} />,
    );
    // L0 lock: names must appear verbatim as received from payload.
    expect(container.textContent).toContain("专业深度");
    expect(container.textContent).toContain("结构化表达");
    expect(container.textContent).toContain("批判性思考");
    expect(container.textContent).toContain("业务直觉");
    expect(container.textContent).toContain("沟通节奏");
  });

  it("renders overallScore when provided", () => {
    const { container } = render(
      <DimensionSidebar dimensions={FIVE_DIMENSIONS} overallScore={78} />,
    );
    expect(container.textContent).toContain("78");
    expect(container.textContent).toContain("总分");
  });

  it("omits overall score section when overallScore is null", () => {
    const { container } = render(
      <DimensionSidebar dimensions={FIVE_DIMENSIONS} overallScore={null} />,
    );
    expect(container.textContent).not.toContain("总分");
  });

  it("renders a score bar for each dimension", () => {
    const { container } = render(
      <DimensionSidebar dimensions={FIVE_DIMENSIONS} />,
    );
    // Each dimension renders a .bar div with an <i> fill element.
    const bars = container.querySelectorAll(".bar");
    expect(bars.length).toBe(FIVE_DIMENSIONS.length);
  });

  it("renders all 5 numeric scores", () => {
    const { container } = render(
      <DimensionSidebar dimensions={FIVE_DIMENSIONS} />,
    );
    for (const dim of FIVE_DIMENSIONS) {
      expect(container.textContent).toContain(String(dim.score));
    }
  });
});
