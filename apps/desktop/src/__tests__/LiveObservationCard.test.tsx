// G7 fix (2026-04-30 audit) — A13 双轨 fallback 路径覆盖.
//
// LiveObservationCard 的双轨设计:
//   1. NextQuestion.live_observation 字段非 null → 用此值 (M2.1.1 主路径)
//   2. NextQuestion.live_observation 字段是 null → fallback prop (来自老 Observer
//      WS 事件 server.coach.observation 的兜底)
//   3. 两端都 null → 渲染 "AI 正在听…" 空态
//
// 之前没测 fallback 分支,refactor 把 `text ?? fallback ?? null` 改成
// 仅 text 也不会触发 CI 失败。本文件锁住三条路径。

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import { LiveObservationCard } from "@/pages/interview/LiveObservationCard";

afterEach(() => {
  cleanup();
});

describe("LiveObservationCard — A13 双轨 fallback", () => {
  it("renders text when text is non-null (primary path)", () => {
    const { getByText } = render(
      <LiveObservationCard
        text="结构清晰但优先级判断一带而过"
        fallback="不该被用上"
      />,
    );
    expect(getByText(/结构清晰但优先级判断一带而过/)).toBeTruthy();
    // fallback 不应该出现 — text 优先
    expect(() => getByText(/不该被用上/)).toThrow();
  });

  it("renders fallback when text is null (Observer WS 兜底)", () => {
    const { getByText } = render(
      <LiveObservationCard text={null} fallback="WS 兜底观察文本" />,
    );
    expect(getByText(/WS 兜底观察文本/)).toBeTruthy();
  });

  it("renders 'AI 正在听…' empty state when both text and fallback are null", () => {
    const { getByText } = render(
      <LiveObservationCard text={null} fallback={null} />,
    );
    expect(getByText(/AI 正在听/)).toBeTruthy();
  });

  it("renders empty state when text and fallback are both undefined", () => {
    const { getByText } = render(<LiveObservationCard text={undefined} />);
    expect(getByText(/AI 正在听/)).toBeTruthy();
  });

  it("text wins over fallback even when text is empty string", () => {
    // Note: empty string is falsy in JS — `text ?? fallback ?? null` only
    // falls through on null/undefined. An empty-string text resolves to
    // "" which is falsy, so the empty state renders. This pins the
    // current contract — if it ever changes, this test will catch it.
    const { getByText } = render(
      <LiveObservationCard text="" fallback="兜底" />,
    );
    // text="" is falsy → display="" → empty state renders (because
    // {display ? ... : 空态} treats "" as falsy)
    expect(getByText(/AI 正在听/)).toBeTruthy();
  });
});
