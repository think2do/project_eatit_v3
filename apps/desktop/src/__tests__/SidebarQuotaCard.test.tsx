import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { SidebarQuotaCard } from "@/components/SidebarQuotaCard";
import { __quotaMockInternal } from "@/lib/quotaMock";

const { STORAGE_KEY } = __quotaMockInternal;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("SidebarQuotaCard", () => {
  it("renders default 0 / 10 state on first mount", () => {
    const { getByTestId } = render(<SidebarQuotaCard />);

    expect(getByTestId("sidebar-quota-card")).toBeTruthy();
    expect(getByTestId("sidebar-quota-used").textContent).toBe("0");
    expect(getByTestId("sidebar-quota-card").textContent).toContain("/ 10");
  });

  it("reflects stored used=7 from localStorage", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        used: 7,
        limit: 10,
        resetAt: new Date(Date.UTC(2099, 0, 1)).toISOString(),
      }),
    );

    const { getByTestId } = render(<SidebarQuotaCard />);

    expect(getByTestId("sidebar-quota-used").textContent).toBe("7");
    // 7 / 10 ≥ 0.7 → near-limit warn tag must show.
    expect(getByTestId("sidebar-quota-near-limit")).toBeTruthy();
  });

  it("includes the '占位' marker so users do not read it as a real cap", () => {
    const { getByTestId } = render(<SidebarQuotaCard />);
    expect(getByTestId("sidebar-quota-card").textContent).toContain("占位");
  });

  it("hides the near-limit chip when used is below 70% of limit", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        used: 3,
        limit: 10,
        resetAt: new Date(Date.UTC(2099, 0, 1)).toISOString(),
      }),
    );

    const { queryByTestId } = render(<SidebarQuotaCard />);

    expect(queryByTestId("sidebar-quota-near-limit")).toBeNull();
  });
});
