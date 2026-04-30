import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import type { SessionSummary } from "@eatit/shared-types";

import {
  HistoryFooterCTA,
  type ReusableConfig,
  extractConfigFromSnapshot,
  pickLastReusableConfig,
} from "@/pages/history/HistoryFooterCTA";
import { useAppStore } from "@/stores/app-store";

afterEach(() => {
  cleanup();
  // Reset the store between tests so reuseLastConfig assertions don't
  // leak. Calling consumeSkipUpload + clearing config back to defaults.
  useAppStore.setState({
    skipUpload: false,
    config: { style: "structured", directions: ["zero-to-one"], durationMinutes: 30 },
  });
});

const cfg: ReusableConfig = {
  style: "pressure",
  directions: ["data-driven", "cross-func"],
  durationMinutes: 45,
};

// ---------------------------------------------------------------------------
// extractConfigFromSnapshot
// ---------------------------------------------------------------------------

describe("extractConfigFromSnapshot", () => {
  it("extracts a v3.2 config_snapshot in the expected shape", () => {
    const result = extractConfigFromSnapshot({
      style: "pressure",
      directions: ["data-driven", "cross-func"],
      duration_minutes: 45,
    });
    expect(result).toEqual(cfg);
  });

  it("returns null when style is outside the v3.2 Literal", () => {
    expect(
      extractConfigFromSnapshot({
        style: "standard_professional", // legacy v3.1 enum
        directions: ["data-driven"],
        duration_minutes: 30,
      }),
    ).toBeNull();
  });

  it("returns null when duration_minutes is not 15/30/45", () => {
    expect(
      extractConfigFromSnapshot({
        style: "structured",
        directions: ["data-driven"],
        duration_minutes: 60,
      }),
    ).toBeNull();
  });

  it("falls back to legacy `direction` (singular) when `directions` is absent", () => {
    expect(
      extractConfigFromSnapshot({
        style: "structured",
        direction: "data-driven",
        duration_minutes: 30,
      }),
    ).toEqual({
      style: "structured",
      directions: ["data-driven"],
      durationMinutes: 30,
    });
  });

  it("filters out unknown directions and caps the list at 3", () => {
    const out = extractConfigFromSnapshot({
      style: "structured",
      directions: [
        "data-driven",
        "cross-func",
        "zero-to-one",
        "ai-insight",
        "bogus", // dropped
      ],
      duration_minutes: 30,
    });
    expect(out?.directions.length).toBe(3);
    expect(out?.directions).toEqual([
      "data-driven",
      "cross-func",
      "zero-to-one",
    ]);
  });

  it("returns null on null/empty snapshot", () => {
    expect(extractConfigFromSnapshot(null)).toBeNull();
    expect(extractConfigFromSnapshot(undefined)).toBeNull();
    expect(extractConfigFromSnapshot({})).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// pickLastReusableConfig
// ---------------------------------------------------------------------------

const mkSession = (
  id: string,
  created_at: string,
  snapshot: Record<string, unknown>,
): SessionSummary => ({
  id,
  created_at,
  updated_at: created_at,
  user_id: "u-1",
  candidate_asset_id: "ab-1",
  status: "report_ready",
  started_at: null,
  ended_at: null,
  turn_count: 0,
  config_snapshot: snapshot,
});

describe("pickLastReusableConfig", () => {
  it("returns null when sessions list is empty", () => {
    expect(pickLastReusableConfig([])).toBeNull();
  });

  it("picks the latest session by created_at", () => {
    const sessions = [
      mkSession("s-old", "2026-04-01T00:00:00Z", {
        style: "structured",
        directions: ["data-driven"],
        duration_minutes: 30,
      }),
      mkSession("s-new", "2026-04-30T00:00:00Z", {
        style: "pressure",
        directions: ["cross-func"],
        duration_minutes: 45,
      }),
    ];
    expect(pickLastReusableConfig(sessions)).toEqual({
      style: "pressure",
      directions: ["cross-func"],
      durationMinutes: 45,
    });
  });

  it("skips malformed snapshots and returns the next valid one", () => {
    const sessions = [
      mkSession("s-newest-broken", "2026-04-30T00:00:00Z", {
        style: "structured",
        // missing duration_minutes ⇒ extractor returns null
      }),
      mkSession("s-older-valid", "2026-04-29T00:00:00Z", {
        style: "structured",
        directions: ["data-driven"],
        duration_minutes: 30,
      }),
    ];
    expect(pickLastReusableConfig(sessions)).toEqual({
      style: "structured",
      directions: ["data-driven"],
      durationMinutes: 30,
    });
  });
});

// ---------------------------------------------------------------------------
// Component rendering + interactions
// ---------------------------------------------------------------------------

describe("HistoryFooterCTA component", () => {
  it("renders both buttons + summary line", () => {
    const { container, getByTestId } = render(
      <HistoryFooterCTA
        lastConfig={cfg}
        onReuseLastConfig={() => {}}
        onNewInterview={() => {}}
      />,
    );
    expect(getByTestId("history-footer-cta")).toBeTruthy();
    expect(getByTestId("reuse-last-config")).toBeTruthy();
    expect(getByTestId("start-new-interview")).toBeTruthy();
    expect(container.textContent).toContain("高压追问");
    expect(container.textContent).toContain("45 分钟");
    expect(container.textContent).toContain("数据驱动");
  });

  it("disables 复用上次配置 when lastConfig is null", () => {
    const onReuse = vi.fn();
    const { getByTestId } = render(
      <HistoryFooterCTA
        lastConfig={null}
        onReuseLastConfig={onReuse}
        onNewInterview={() => {}}
      />,
    );
    const reuseBtn = getByTestId("reuse-last-config");
    expect(reuseBtn.hasAttribute("disabled")).toBe(true);
    fireEvent.click(reuseBtn);
    // disabled buttons don't fire clicks anyway, but assert as a guard.
    expect(onReuse).not.toHaveBeenCalled();
  });

  it("invokes onReuseLastConfig with the supplied config + onNewInterview", () => {
    const onReuse = vi.fn();
    const onNew = vi.fn();
    const { getByTestId } = render(
      <HistoryFooterCTA
        lastConfig={cfg}
        onReuseLastConfig={onReuse}
        onNewInterview={onNew}
      />,
    );
    fireEvent.click(getByTestId("reuse-last-config"));
    fireEvent.click(getByTestId("start-new-interview"));
    expect(onReuse).toHaveBeenCalledWith(cfg);
    expect(onNew).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Store action — reuseLastConfig flips skipUpload + patches config
// ---------------------------------------------------------------------------

describe("useAppStore.reuseLastConfig", () => {
  it("merges config + flips skipUpload=true", () => {
    expect(useAppStore.getState().skipUpload).toBe(false);
    useAppStore.getState().reuseLastConfig({
      style: "expert",
      directions: ["strategy"],
      durationMinutes: 15,
    });
    const state = useAppStore.getState();
    expect(state.skipUpload).toBe(true);
    expect(state.config.style).toBe("expert");
    expect(state.config.durationMinutes).toBe(15);
    expect(state.config.directions).toEqual(["strategy"]);
  });

  it("consumeSkipUpload clears the flag without touching config", () => {
    useAppStore.getState().reuseLastConfig({ style: "expert" });
    expect(useAppStore.getState().skipUpload).toBe(true);
    useAppStore.getState().consumeSkipUpload();
    expect(useAppStore.getState().skipUpload).toBe(false);
    expect(useAppStore.getState().config.style).toBe("expert");
  });
});
