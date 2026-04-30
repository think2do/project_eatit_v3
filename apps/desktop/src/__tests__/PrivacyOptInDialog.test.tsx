// V32.M2.3.5 — PrivacyOptInDialog confirm/cancel contract.
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

import { PrivacyOptInDialog } from "@/components/PrivacyOptInDialog";

afterEach(() => cleanup());

describe("PrivacyOptInDialog", () => {
  it("renders nothing when open=false", () => {
    const { queryByTestId } = render(
      <PrivacyOptInDialog
        open={false}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(queryByTestId("privacy-opt-in-dialog")).toBeNull();
  });

  it("renders L0 A11 contract copy when open", () => {
    const { getByTestId } = render(
      <PrivacyOptInDialog open onConfirm={() => {}} onCancel={() => {}} />,
    );
    const dialog = getByTestId("privacy-opt-in-dialog");
    expect(dialog.textContent).toContain("公司名");
    expect(dialog.textContent).toContain("岗位名");
    expect(dialog.textContent).toContain("行业关键词");
    // Privacy guarantee callout must mention "不会发送" + the PII set.
    const guarantee = getByTestId("privacy-opt-in-guarantee").textContent ?? "";
    expect(guarantee).toContain("不会发送");
    expect(guarantee).toContain("简历正文");
    expect(guarantee).toContain("姓名");
  });

  it("calls onConfirm when 我已了解 button clicked", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { getByTestId } = render(
      <PrivacyOptInDialog open onConfirm={onConfirm} onCancel={onCancel} />,
    );
    fireEvent.click(getByTestId("privacy-opt-in-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("calls onCancel when 取消 button clicked", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { getByTestId } = render(
      <PrivacyOptInDialog open onConfirm={onConfirm} onCancel={onCancel} />,
    );
    fireEvent.click(getByTestId("privacy-opt-in-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
