import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { DialogueTurn } from "@eatit/shared-types";

import { MockDialogue } from "@/pages/report/MockDialogue";

afterEach(() => {
  cleanup();
});

const sample: DialogueTurn[] = [
  { role: "interviewer", text: "你刚才提到驱动指标,具体怎么拆?" },
  { role: "candidate", text: "我会按用户行为漏斗 5 步拆解。" },
  { role: "interviewer", text: "如果漏斗第 3 步异常呢?" },
];

describe("MockDialogue", () => {
  it("renders one bubble per turn with correct role label", () => {
    const { container, getByTestId } = render(<MockDialogue dialogue={sample} />);
    expect(getByTestId("mock-dialogue")).toBeTruthy();
    expect(container.textContent).toContain("面试官");
    expect(container.textContent).toContain("候选人");
    expect(container.textContent).toContain("驱动指标");
    expect(container.textContent).toContain("用户行为漏斗");
  });

  it("aligns interviewer/candidate bubbles via data-role attribute", () => {
    const { getByTestId } = render(<MockDialogue dialogue={sample} />);
    expect(
      getByTestId("mock-dialogue-interviewer-0").getAttribute("data-role"),
    ).toBe("interviewer");
    expect(
      getByTestId("mock-dialogue-candidate-1").getAttribute("data-role"),
    ).toBe("candidate");
  });

  it("renders empty-state when dialogue list is empty", () => {
    const { getByTestId } = render(<MockDialogue dialogue={[]} />);
    expect(getByTestId("mock-dialogue-empty").textContent).toContain(
      "暂无追问演练片段",
    );
  });
});
