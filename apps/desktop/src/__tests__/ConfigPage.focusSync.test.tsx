// V32.M2.2.X audit fix — ConfigPage seededFromFocus → store flag.
//
// Before: `useRef(false)` lived inside the ConfigPage component, which
// resets on unmount, so navigating Config→Upload→Config kept re-seeding
// `directions` from selectedFocusIds and clobbered the user's edits.
// After: lock lives in the Zustand store as `hasSyncedFocusToConfig`,
// flipped by `patchConfig` and reset by `patchUpload({ parsePayload })`.
//
// These tests stay focused on the seed/lock contract and don't render
// the full ConfigPage UI (which would pull in axios + router-driven
// navigation we don't care about here).
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { ConfigPage } from "@/pages/ConfigPage";
import { useAppStore } from "@/stores/app-store";

function renderConfigPage() {
  return render(
    <MemoryRouter initialEntries={["/config"]}>
      <ConfigPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  // Manually reset the relevant store slices so each case starts clean
  // (Zustand keeps state across test cases otherwise).
  useAppStore.setState((state) => ({
    upload: {
      ...state.upload,
      assetBundleId: null,
      parseStatus: "idle",
      parsePayload: null,
      parsedAtMs: null,
    },
    config: { style: "structured", directions: ["zero-to-one"], durationMinutes: 30 },
    selectedFocusIds: [],
    hasSyncedFocusToConfig: false,
    presetConfig: null,
  }));
});

describe("ConfigPage focus-sync", () => {
  it("seeds `directions` from selectedFocusIds on first mount and locks the flag", () => {
    useAppStore.setState({
      selectedFocusIds: ["ai-insight", "data-driven"],
      hasSyncedFocusToConfig: false,
    });

    renderConfigPage();

    const state = useAppStore.getState();
    expect(state.config.directions).toEqual(["ai-insight", "data-driven"]);
    expect(state.hasSyncedFocusToConfig).toBe(true);
  });

  it("does not re-seed on remount once the lock is set (user edits stick)", () => {
    useAppStore.setState({
      selectedFocusIds: ["ai-insight", "data-driven"],
      hasSyncedFocusToConfig: false,
    });

    // First mount seeds.
    const first = renderConfigPage();
    expect(useAppStore.getState().config.directions).toEqual([
      "ai-insight",
      "data-driven",
    ]);
    first.unmount();

    // User hand-edits to a single different direction. patchConfig keeps
    // hasSyncedFocusToConfig true, so the next mount must NOT clobber it.
    useAppStore.getState().patchConfig({ directions: ["strategy"] });
    expect(useAppStore.getState().hasSyncedFocusToConfig).toBe(true);

    renderConfigPage();
    expect(useAppStore.getState().config.directions).toEqual(["strategy"]);
  });

  it("re-seeds after a new parse: patchUpload({parsePayload}) clears the lock", () => {
    useAppStore.setState({
      selectedFocusIds: ["ai-insight"],
      hasSyncedFocusToConfig: false,
    });

    // First mount seeds directions=["ai-insight"], lock flips to true.
    const first = renderConfigPage();
    expect(useAppStore.getState().config.directions).toEqual(["ai-insight"]);
    first.unmount();

    // User picks new focus cards on the upload page (selectedFocusIds
    // changes), then a new parse fires. patchUpload({parsePayload})
    // resets the lock so the next ConfigPage mount re-seeds.
    useAppStore.setState({ selectedFocusIds: ["strategy", "user-research"] });
    useAppStore.getState().patchUpload({
      parsePayload: null, // any patch touching parsePayload key triggers reset
    });
    expect(useAppStore.getState().hasSyncedFocusToConfig).toBe(false);

    renderConfigPage();
    expect(useAppStore.getState().config.directions).toEqual([
      "strategy",
      "user-research",
    ]);
    expect(useAppStore.getState().hasSyncedFocusToConfig).toBe(true);
  });
});
