// V32.M2.2.X audit fix — ParsedPanel integration smoke.
//
// Sub-component tests (MatchDial / StrengthGapList / FocusCard) lock
// individual contracts but cannot prove the whole panel renders the
// branches the UploadPage cares about: match_score=null hides the dial,
// interview_focus=[] shows a placeholder, and the bottom CTA fires the
// onContinue callback. These three are wired here.
import { describe, it, expect, afterEach, vi } from "vitest";
import { fireEvent, render, cleanup } from "@testing-library/react";
import type { ParseResultPayload } from "@eatit/shared-types";

import { ParsedPanel } from "@/pages/upload/ParsedPanel";
import { useAppStore } from "@/stores/app-store";

const BASE_PAYLOAD: ParseResultPayload = {
  job_requirements: [],
  candidate_highlights: [],
  candidate_risks: [],
  project_hooks: [],
  match_summary: null,
  candidate_profile: null,
  match_score: {
    score: 78,
    level: "HIGH",
    one_line: "整体匹配度偏高,可深挖具体业务",
  },
  profile_summary: "5 年 PM,擅长数据驱动决策,有 0→1 经验。",
  match_advantages: [
    { label: "结果导向", tag: "匹配", evidence: "项目里有量化指标" },
  ],
  gaps: [{ label: "AB 实验", tag: "需补充", evidence: "未提到 A/B 框架" }],
  interview_focus: [
    {
      direction_id: "ai-insight",
      priority: "high",
      title: "AI 洞察",
      description: "考察对 AI 趋势的判断与边界感。",
    },
  ],
  project_hooks_v32: [],
};

afterEach(() => {
  cleanup();
  // Reset transient store state so toggles don't leak across cases.
  useAppStore.getState().resetSelectedFocusIds();
});

describe("ParsedPanel", () => {
  it("hides MatchDial when match_score is null and shows the empty-state copy", () => {
    const payload: ParseResultPayload = { ...BASE_PAYLOAD, match_score: null };
    const { queryByTestId, container } = render(
      <ParsedPanel
        payload={payload}
        parsedAt={Date.now()}
        onReparse={() => {}}
        onContinue={() => {}}
      />,
    );
    expect(queryByTestId("match-dial")).toBeNull();
    expect(container.textContent).toContain("AI 暂未给出整体匹配度");
  });

  it("renders FocusCards when interview_focus has items, placeholder when empty", () => {
    const { container, getByText, queryByTestId, rerender } = render(
      <ParsedPanel
        payload={BASE_PAYLOAD}
        parsedAt={Date.now()}
        onReparse={() => {}}
        onContinue={() => {}}
      />,
    );
    // Populated: at least one FocusCard rendered.
    expect(queryByTestId("focus-card")).not.toBeNull();
    expect(getByText("AI 洞察")).toBeTruthy();

    rerender(
      <ParsedPanel
        payload={{ ...BASE_PAYLOAD, interview_focus: [] }}
        parsedAt={Date.now()}
        onReparse={() => {}}
        onContinue={() => {}}
      />,
    );
    expect(container.textContent).toContain("AI 暂未给出建议侧重");
  });

  it("fires onContinue when 进入面试配置 button is clicked", () => {
    const onContinue = vi.fn();
    const { getByTestId } = render(
      <ParsedPanel
        payload={BASE_PAYLOAD}
        parsedAt={Date.now()}
        onReparse={() => {}}
        onContinue={onContinue}
      />,
    );
    fireEvent.click(getByTestId("parsed-panel-continue"));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("fires onReparse when ParsedMetaBar 重新解析 button is clicked", () => {
    const onReparse = vi.fn();
    const { getByTestId } = render(
      <ParsedPanel
        payload={BASE_PAYLOAD}
        parsedAt={Date.now()}
        onReparse={onReparse}
        onContinue={() => {}}
      />,
    );
    fireEvent.click(getByTestId("parsed-meta-reparse"));
    expect(onReparse).toHaveBeenCalledTimes(1);
  });
});
