// G10 fix (2026-04-30 audit) — InterviewPage refactor 4-component smoke.
//
// V32.M2.1.5 提取了 4 个组件 (RecBadge / SessionMetaStrip / WaveBars /
// RecentRounds) 给 InterviewPage 顶部用,但没有任何测试。本 smoke 只
// 验证组件渲染契约 (mm:ss 格式 / 8 根波形 / 三段 meta / 上限 3 条),
// 不挂 InterviewPage 全页 (那需要 mock WS / store / router,代价过大)。
//
// 任何上述组件被改成不符合契约 (e.g. WaveBars 6 根),CI 失败。

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import { RecBadge } from "@/pages/interview/RecBadge";
import { SessionMetaStrip } from "@/pages/interview/SessionMetaStrip";
import { WaveBars } from "@/pages/interview/WaveBars";
import {
  RecentRounds,
  type RecentRound,
} from "@/pages/interview/RecentRounds";

afterEach(() => {
  cleanup();
});

describe("RecBadge", () => {
  it("renders mm:ss zero-padded with REC prefix", () => {
    const { container } = render(
      <RecBadge recording={true} elapsedSeconds={5} />,
    );
    expect(container.textContent).toMatch(/REC\s*00:05/);
  });

  it("formats minutes correctly past 60s", () => {
    const { container } = render(
      <RecBadge recording={true} elapsedSeconds={90} />,
    );
    expect(container.textContent).toMatch(/REC\s*01:30/);
  });

  it("clamps negative elapsedSeconds to 00:00", () => {
    const { container } = render(
      <RecBadge recording={false} elapsedSeconds={-3} />,
    );
    expect(container.textContent).toMatch(/REC\s*00:00/);
  });
});

describe("WaveBars", () => {
  it("always renders exactly 8 bars (active or inactive)", () => {
    const { container, rerender } = render(<WaveBars active={true} />);
    expect(container.querySelectorAll("span").length).toBe(8);
    rerender(<WaveBars active={false} />);
    expect(container.querySelectorAll("span").length).toBe(8);
  });
});

describe("SessionMetaStrip", () => {
  it("renders all three eyebrow segments + persona/style + progress", () => {
    const { container, getByText } = render(
      <SessionMetaStrip
        jobTitle="高级 AI 产品经理"
        personaName="Sarah"
        styleLabel="结构化"
        currentTurn={3}
        totalTurns={6}
      />,
    );
    expect(getByText("当前岗位")).toBeTruthy();
    expect(getByText("面试官风格")).toBeTruthy();
    expect(getByText("进度")).toBeTruthy();
    expect(getByText("高级 AI 产品经理")).toBeTruthy();
    // styleLabel · personaName 复合显示
    // V32.M1.1.X-followup: SessionMetaStrip now appends 面试官 to the
    // style label so the value reads "结构化面试官 · Sarah", matching
    // design-reference/page-live.jsx exactly.
    expect(container.textContent).toMatch(/结构化面试官\s*·\s*Sarah/);
    expect(container.textContent).toMatch(/3\s*\/\s*6/);
  });
});

describe("RecentRounds", () => {
  function makeRound(i: number): RecentRound {
    return {
      index: i,
      question: `Q${i} 文案`,
      answerSummary: `A${i} 摘要`,
      tone: "normal",
      toneLabel: "一般",
    };
  }

  it("returns null when given an empty list", () => {
    const { container } = render(<RecentRounds rounds={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders at most 3 rounds even when handed 5", () => {
    const five = [1, 2, 3, 4, 5].map(makeRound);
    const { container } = render(<RecentRounds rounds={five} />);
    // 找 Q{i} 文案;只留最后 3 条 (Q3 / Q4 / Q5)
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/Q1 文案/);
    expect(text).not.toMatch(/Q2 文案/);
    expect(text).toMatch(/Q3 文案/);
    expect(text).toMatch(/Q4 文案/);
    expect(text).toMatch(/Q5 文案/);
  });

  it("applies the right tag class per tone", () => {
    const rounds: RecentRound[] = [
      { ...makeRound(1), tone: "good", toneLabel: "稳" },
      { ...makeRound(2), tone: "risk", toneLabel: "风险" },
      { ...makeRound(3), tone: "normal", toneLabel: "一般" },
    ];
    const { container } = render(<RecentRounds rounds={rounds} />);
    expect(container.querySelector(".tag-green")).toBeTruthy();
    expect(container.querySelector(".tag-warn")).toBeTruthy();
    expect(container.querySelector(".tag-line")).toBeTruthy();
  });
});
