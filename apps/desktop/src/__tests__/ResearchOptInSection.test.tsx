// V32.M2.3.X audit-fix (G6) — ResearchOptInSection integration test.
//
// Pre-audit there was no test that flipping the toggle ON actually
// surfaces PrivacyOptInDialog AND blocks the API write until the user
// confirms. These cases pin the L0 A11 contract: the user cannot opt
// in by accident, and tapping Cancel keeps researchOptIn=false (no PUT
// fired, no store flip).
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

vi.mock("@/api/settingsResearch", () => ({
  getResearchOptIn: vi.fn(async () => ({ enabled: false })),
  setResearchOptIn: vi.fn(async () => ({ enabled: true })),
}));

import {
  getResearchOptIn,
  setResearchOptIn,
} from "@/api/settingsResearch";
import { ResearchOptInSection } from "@/pages/SettingsPage";
import { useAppStore } from "@/stores/app-store";

const getMock = vi.mocked(getResearchOptIn);
const putMock = vi.mocked(setResearchOptIn);

beforeEach(() => {
  getMock.mockReset();
  getMock.mockResolvedValue({ enabled: false });
  putMock.mockReset();
  putMock.mockResolvedValue({ enabled: true });
  useAppStore.setState({ researchOptIn: false });
});

afterEach(() => {
  cleanup();
});

describe("ResearchOptInSection", () => {
  it("first ON click opens the privacy dialog WITHOUT firing the PUT", async () => {
    const { getByTestId, queryByTestId } = render(<ResearchOptInSection />);

    // Wait for the GET to settle so the toggle is enabled.
    await waitFor(() => {
      expect(getMock).toHaveBeenCalledTimes(1);
    });

    const toggle = getByTestId("research-opt-in-toggle") as HTMLInputElement;
    expect(toggle.checked).toBe(false);

    fireEvent.click(toggle);

    // Dialog must surface — but no PUT yet, and the store flag is
    // still false (the user has NOT confirmed).
    expect(getByTestId("privacy-opt-in-dialog")).not.toBeNull();
    expect(putMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().researchOptIn).toBe(false);
    queryByTestId("research-opt-in-toggle"); // sanity
  });

  it("Cancel in the dialog keeps researchOptIn=false (no PUT, no store flip)", async () => {
    const { getByTestId, queryByTestId } = render(<ResearchOptInSection />);

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(getByTestId("research-opt-in-toggle"));
    fireEvent.click(getByTestId("privacy-opt-in-cancel"));

    // Dialog closed, no API write happened, store still false.
    expect(queryByTestId("privacy-opt-in-dialog")).toBeNull();
    expect(putMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().researchOptIn).toBe(false);
  });

  it("Confirm in the dialog fires the PUT and flips researchOptIn=true", async () => {
    const { getByTestId, queryByTestId } = render(<ResearchOptInSection />);

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(getByTestId("research-opt-in-toggle"));
    fireEvent.click(getByTestId("privacy-opt-in-confirm"));

    await waitFor(() => {
      expect(putMock).toHaveBeenCalledWith(true);
    });
    expect(queryByTestId("privacy-opt-in-dialog")).toBeNull();
    expect(useAppStore.getState().researchOptIn).toBe(true);
  });
});
