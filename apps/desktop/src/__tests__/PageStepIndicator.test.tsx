import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import { PageStepIndicator } from "@/components/PageStepIndicator";

afterEach(() => {
  cleanup();
});

describe("PageStepIndicator", () => {
  it("renders step 1 with the upload-and-parse label", () => {
    const { container } = render(<PageStepIndicator step={1} />);
    expect(container.textContent).toContain("第 1 步 · 共 3 步 · 上传与解析");
  });

  it("renders step 2 with the interview-config label", () => {
    const { container } = render(<PageStepIndicator step={2} />);
    expect(container.textContent).toContain("第 2 步 · 共 3 步 · 面试配置");
  });

  it("renders step 3 with the live-interview label", () => {
    const { container } = render(<PageStepIndicator step={3} />);
    expect(container.textContent).toContain("第 3 步 · 共 3 步 · 实时面试");
  });

  it("uses the eyebrow shared className from index.css @layer components", () => {
    const { container } = render(<PageStepIndicator step={1} />);
    const root = container.firstChild as HTMLElement | null;
    expect(root?.className).toContain("eyebrow");
  });
});
