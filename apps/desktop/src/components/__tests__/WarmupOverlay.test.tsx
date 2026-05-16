import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

import { WarmupOverlay } from "@/components/WarmupOverlay";

afterEach(() => {
  cleanup();
});

describe("WarmupOverlay", () => {
  it("stage=1: row 1 active (spinner visible), row 2/3 pending", () => {
    const { getByTestId } = render(<WarmupOverlay stage={1} />);

    const row1 = getByTestId("warmup-stage-1");
    expect(row1.getAttribute("data-state")).toBe("active");
    expect(row1.querySelector('[aria-label="loading"]')).toBeTruthy();

    const row2 = getByTestId("warmup-stage-2");
    expect(row2.getAttribute("data-state")).toBe("pending");

    const row3 = getByTestId("warmup-stage-3");
    expect(row3.getAttribute("data-state")).toBe("pending");
  });

  it("stage=2: row 1 done (✓ + done text), row 2 active (spinner), row 3 pending", () => {
    const { getByTestId } = render(<WarmupOverlay stage={2} />);

    const row1 = getByTestId("warmup-stage-1");
    expect(row1.getAttribute("data-state")).toBe("done");
    expect(row1.textContent).toContain("面试框架已就绪");

    const row2 = getByTestId("warmup-stage-2");
    expect(row2.getAttribute("data-state")).toBe("active");
    expect(row2.querySelector('[aria-label="loading"]')).toBeTruthy();

    const row3 = getByTestId("warmup-stage-3");
    expect(row3.getAttribute("data-state")).toBe("pending");
  });

  it("stage=3: row 1/2 done, row 3 active (spinner)", () => {
    const { getByTestId } = render(<WarmupOverlay stage={3} />);

    const row1 = getByTestId("warmup-stage-1");
    expect(row1.getAttribute("data-state")).toBe("done");

    const row2 = getByTestId("warmup-stage-2");
    expect(row2.getAttribute("data-state")).toBe("done");
    expect(row2.textContent).toContain("开场问题已就绪");

    const row3 = getByTestId("warmup-stage-3");
    expect(row3.getAttribute("data-state")).toBe("active");
    expect(row3.querySelector('[aria-label="loading"]')).toBeTruthy();
  });

  it("stage=1, error='网络异常': row 1 shows error state + 返回配置 button visible", () => {
    const { getByTestId, getByText } = render(
      <WarmupOverlay stage={1} error="网络异常" onBack={() => {}} />
    );

    const row1 = getByTestId("warmup-stage-1");
    expect(row1.getAttribute("data-state")).toBe("error");
    expect(row1.textContent).toContain("网络异常");

    expect(getByText("返回配置")).toBeTruthy();
  });

  it("stage=1, error present, onBack fn: clicking 返回配置 triggers onBack once", () => {
    const onBack = vi.fn();
    const { getByText } = render(
      <WarmupOverlay stage={1} error="x" onBack={onBack} />
    );

    fireEvent.click(getByText("返回配置"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
