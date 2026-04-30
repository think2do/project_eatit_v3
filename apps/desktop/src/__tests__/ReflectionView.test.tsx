import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ReflectionReport } from "@eatit/shared-types";

vi.mock("@/api/reflections", () => ({
  getReflection: vi.fn(async () => null),
}));

import { getReflection } from "@/api/reflections";
import { ReflectionView } from "@/pages/report/ReflectionView";
import { useAppStore } from "@/stores/app-store";

const getMock = vi.mocked(getReflection);

function buildReflection(
  overrides: Partial<ReflectionReport> = {},
): ReflectionReport {
  return {
    report_id: "r-1",
    session_id: "s-1",
    executive_summary: "本场表现整体稳定;建议针对指标拆解做一次专项练习。",
    per_question_coaching: [
      {
        turn_index: 0,
        question: "如何拆解一个新业务的北极星指标",
        your_answer_summary: "只列了 DAU 没分层",
        diagnosis: "可加强指标拆解的层级表达",
        model_answer_outline: ["先讲北极星", "再讲驱动指标"],
        key_phrases_to_use: ["北极星", "驱动指标"],
        mistakes_to_avoid: ["建议下次注意指标分层"],
        recommended_resources: [],
      },
    ],
    general_growth_advice: "STAR 重写最关键的回答;练 3 道相似题。",
    mock_followup_dialogue: [
      { role: "interviewer", text: "你刚才提到驱动指标,具体怎么拆?" },
    ],
    generated_at: "2026-05-01T00:00:00+00:00",
    status: "ok",
    ...overrides,
  };
}

beforeEach(() => {
  getMock.mockReset();
  // Clear cached reflection between cases so each scenario starts at
  // ``loading`` instead of pre-rendering the previous test's payload.
  useAppStore.setState({ reflection: null });
});

afterEach(() => {
  cleanup();
});

describe("ReflectionView", () => {
  it("renders absent state when API returns null (204)", async () => {
    getMock.mockResolvedValue(null);
    const { findByTestId } = render(<ReflectionView sessionId="s-1" />);
    const absent = await findByTestId("reflection-view-absent");
    expect(absent.textContent).toContain("复盘报告将在");
  });

  it("renders ok payload when status === ok", async () => {
    getMock.mockResolvedValue(buildReflection());
    const { findByTestId, container } = render(
      <ReflectionView sessionId="s-1" />,
    );
    await findByTestId("reflection-view-ok");
    expect(container.textContent).toContain("本场表现整体稳定");
    expect(container.textContent).toContain("逐题教练卡");
    expect(container.textContent).toContain("追问演练");
    expect(container.textContent).toContain("北极星");
  });

  it("renders failed state with retry button when status === failed", async () => {
    getMock.mockResolvedValue(buildReflection({ status: "failed" }));
    const { findByTestId } = render(<ReflectionView sessionId="s-1" />);
    const failed = await findByTestId("reflection-view-failed");
    expect(failed.textContent).toContain("复盘报告生成失败");
    expect(await findByTestId("reflection-view-retry")).toBeTruthy();
  });

  it("retry triggers a refetch", async () => {
    getMock.mockResolvedValue(buildReflection({ status: "failed" }));
    const { findByTestId } = render(<ReflectionView sessionId="s-1" />);
    await findByTestId("reflection-view-failed");
    expect(getMock).toHaveBeenCalledTimes(1);

    // Next call returns ok — clicking retry should reach ok state.
    getMock.mockResolvedValue(buildReflection({ status: "ok" }));
    fireEvent.click(await findByTestId("reflection-view-retry"));
    await waitFor(() => {
      expect(getMock).toHaveBeenCalledTimes(2);
    });
    await findByTestId("reflection-view-ok");
  });

  it("renders network-error state with friendly message", async () => {
    getMock.mockRejectedValue(new Error("network down"));
    const { findByTestId } = render(<ReflectionView sessionId="s-1" />);
    const errored = await findByTestId("reflection-view-error");
    expect(errored.textContent).toContain("network down");
  });

  it("uses cached reflection from store when status === ok and matches sessionId", async () => {
    useAppStore.setState({ reflection: buildReflection({ session_id: "s-1" }) });
    // Even though the mock would resolve null, the cached store entry
    // wins on first paint so the user doesn't see a flash of the
    // loading spinner when re-entering the tab.
    getMock.mockResolvedValue(null);
    const { findByTestId } = render(<ReflectionView sessionId="s-1" />);
    await findByTestId("reflection-view-ok");
  });
});
