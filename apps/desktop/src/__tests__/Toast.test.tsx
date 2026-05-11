import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ToastRail, showToast } from "@/components/Toast";
import { useToastStore } from "@/stores/toast-store";

function resetToastStore() {
  useToastStore.getState().clear();
}

beforeEach(() => {
  resetToastStore();
});

afterEach(() => {
  cleanup();
  resetToastStore();
});

describe("ToastRail", () => {
  it("renders nothing when the store is empty", () => {
    const { container } = render(<ToastRail />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a toast pushed to the store", () => {
    act(() => {
      useToastStore.getState().push({ tone: "info", title: "测试通知", ttlMs: 0 });
    });
    const { getByText } = render(<ToastRail />);
    expect(getByText("测试通知")).toBeInTheDocument();
  });

  it("renders the message when provided", () => {
    act(() => {
      useToastStore.getState().push({
        tone: "success",
        title: "成功",
        message: "操作已完成",
        ttlMs: 0,
      });
    });
    const { getByText } = render(<ToastRail />);
    expect(getByText("操作已完成")).toBeInTheDocument();
  });

  it("renders actionLabel button when provided", () => {
    act(() => {
      useToastStore.getState().push({
        tone: "info",
        title: "分析完成",
        actionLabel: "查看",
        ttlMs: 0,
      });
    });
    const { getByText } = render(<ToastRail />);
    expect(getByText("查看")).toBeInTheDocument();
  });

  it("calls onAction when actionLabel button is clicked", () => {
    const onAction = vi.fn();
    act(() => {
      useToastStore.getState().push({
        tone: "info",
        title: "分析完成",
        actionLabel: "查看",
        onAction,
        ttlMs: 0,
      });
    });
    const { getByText } = render(<ToastRail />);
    fireEvent.click(getByText("查看"));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("dismisses the toast when actionLabel button is clicked", () => {
    act(() => {
      useToastStore.getState().push({
        tone: "info",
        title: "分析完成",
        actionLabel: "查看",
        onAction: vi.fn(),
        ttlMs: 0,
      });
    });
    const { getByText, queryByText } = render(<ToastRail />);
    fireEvent.click(getByText("查看"));
    expect(queryByText("分析完成")).not.toBeInTheDocument();
  });

  it("ttlMs=0 does not auto-dismiss (sticky toast)", () => {
    vi.useFakeTimers();
    act(() => {
      useToastStore.getState().push({ tone: "warn", title: "不会消失", ttlMs: 0 });
    });
    const { getByText } = render(<ToastRail />);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(getByText("不会消失")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("dismisses via close button", () => {
    act(() => {
      useToastStore.getState().push({ tone: "error", title: "错误通知", ttlMs: 0 });
    });
    const { getByLabelText, queryByText } = render(<ToastRail />);
    fireEvent.click(getByLabelText("关闭提示"));
    expect(queryByText("错误通知")).not.toBeInTheDocument();
  });
});

describe("showToast", () => {
  it("pushes a toast to the store with the given message as title", () => {
    showToast("后台分析中…");
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].title).toBe("后台分析中…");
  });

  it("defaults tone to info", () => {
    showToast("通知");
    expect(useToastStore.getState().toasts[0].tone).toBe("info");
  });

  it("accepts a custom tone", () => {
    showToast("出错了", { tone: "error" });
    expect(useToastStore.getState().toasts[0].tone).toBe("error");
  });

  it("sets ttlMs=0 (sticky) when actionLabel is provided", () => {
    showToast("分析完成", { actionLabel: "查看", onAction: vi.fn() });
    expect(useToastStore.getState().toasts[0].ttlMs).toBe(0);
  });

  it("uses durationMs when provided", () => {
    showToast("短暂通知", { durationMs: 3000 });
    expect(useToastStore.getState().toasts[0].ttlMs).toBe(3000);
  });

  it("stores actionLabel and onAction on the toast entry", () => {
    const handler = vi.fn();
    showToast("完成", { actionLabel: "Go", onAction: handler });
    const t = useToastStore.getState().toasts[0];
    expect(t.actionLabel).toBe("Go");
    expect(t.onAction).toBe(handler);
  });
});
