import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";

import { StatCard } from "@/pages/history/StatCard";

afterEach(() => {
  cleanup();
});

describe("StatCard", () => {
  it("renders eyebrow + value text", () => {
    const { getByTestId, container } = render(
      <StatCard eyebrow="累计场次" value={12} />,
    );
    expect(getByTestId("stat-card")).toBeTruthy();
    expect(container.textContent).toContain("累计场次");
    expect(container.textContent).toContain("12");
  });

  it("renders sub line when provided", () => {
    const { container } = render(
      <StatCard eyebrow="平均时长" value="30 分" sub="按 config 估算" />,
    );
    expect(container.textContent).toContain("按 config 估算");
  });

  it("omits sub line when undefined", () => {
    const { queryByText } = render(
      <StatCard eyebrow="累计场次" value={0} />,
    );
    expect(queryByText("按 config 估算")).toBeNull();
  });

  it("uses serif typography on the value via .h-serif class", () => {
    const { getByTestId } = render(
      <StatCard eyebrow="累计场次" value={12} />,
    );
    const value = getByTestId("stat-card-value");
    expect(value.className).toContain("h-serif");
  });
});
