import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/llm/config", () => ({
  hasLLMApiKey: vi.fn(),
}));

import { hasLLMApiKey } from "@/lib/llm/config";
import { OnboardingGate } from "@/components/OnboardingGate";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderAt(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<OnboardingGate />}>
            <Route path="/" element={<div>HOME_PAGE</div>} />
            <Route path="/upload" element={<div>UPLOAD_PAGE</div>} />
            <Route path="/settings" element={<div>SETTINGS_PAGE</div>} />
            <Route path="/config" element={<div>CONFIG_PAGE</div>} />
            <Route path="/history" element={<div>HISTORY_PAGE</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OnboardingGate (Apple rejection fix 2026-06-01)", () => {
  // The Apple Guideline 2.1a regression: previously the gate redirected
  // ANY non-/settings path to /settings when no key was set, which made
  // every sidebar click appear non-responsive. These tests pin the new
  // narrow behavior: redirect ONLY on first-run root entry.

  it("no key + pathname=/ → redirect to /settings (first-run nudge)", async () => {
    (hasLLMApiKey as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const { findByText, queryByText } = renderAt("/");
    expect(await findByText("SETTINGS_PAGE")).toBeTruthy();
    expect(queryByText("HOME_PAGE")).toBeNull();
  });

  it("no key + pathname=/upload → /upload renders (NO redirect) — sidebar must work", async () => {
    (hasLLMApiKey as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const { findByText, queryByText } = renderAt("/upload");
    expect(await findByText("UPLOAD_PAGE")).toBeTruthy();
    expect(queryByText("SETTINGS_PAGE")).toBeNull();
  });

  it("no key + pathname=/config → /config renders (NO redirect)", async () => {
    (hasLLMApiKey as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const { findByText, queryByText } = renderAt("/config");
    expect(await findByText("CONFIG_PAGE")).toBeTruthy();
    expect(queryByText("SETTINGS_PAGE")).toBeNull();
  });

  it("no key + pathname=/history → /history renders (NO redirect)", async () => {
    (hasLLMApiKey as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const { findByText, queryByText } = renderAt("/history");
    expect(await findByText("HISTORY_PAGE")).toBeTruthy();
    expect(queryByText("SETTINGS_PAGE")).toBeNull();
  });

  it("no key + pathname=/settings → stays on /settings", async () => {
    (hasLLMApiKey as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const { findByText } = renderAt("/settings");
    expect(await findByText("SETTINGS_PAGE")).toBeTruthy();
  });

  it("has key + pathname=/ → home renders (no redirect)", async () => {
    (hasLLMApiKey as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const { findByText, queryByText } = renderAt("/");
    expect(await findByText("HOME_PAGE")).toBeTruthy();
    expect(queryByText("SETTINGS_PAGE")).toBeNull();
  });

  it("has key + pathname=/upload → /upload renders", async () => {
    (hasLLMApiKey as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const { findByText } = renderAt("/upload");
    expect(await findByText("UPLOAD_PAGE")).toBeTruthy();
  });

  it("keychain error → falls through (Outlet) at any path", async () => {
    (hasLLMApiKey as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("keychain unreachable"),
    );
    const { findByText, queryByText } = renderAt("/upload");
    expect(await findByText("UPLOAD_PAGE")).toBeTruthy();
    expect(queryByText("SETTINGS_PAGE")).toBeNull();
  });
});
