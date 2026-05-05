/**
 * api/settingsResearch — M5.4.dev.b PR1/4
 *
 * settingsResearch delegates entirely to appSettings (shared app_settings table,
 * key="research_opt_in_enabled"). This test mocks the whole appSettings module
 * and verifies the delegation contract.
 *
 * §B9: no bridge calls in this layer — that is covered by appSettings.test.ts
 * and infra/db.expanded.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/api/appSettings", () => ({
  getAppSetting: vi.fn(),
  putAppSetting: vi.fn(),
}));

import { getAppSetting, putAppSetting } from "@/api/appSettings";
import { getResearchOptIn, setResearchOptIn } from "@/api/settingsResearch";

const mockGet = vi.mocked(getAppSetting);
const mockPut = vi.mocked(putAppSetting);

beforeEach(() => {
  mockGet.mockReset();
  mockPut.mockReset();
});

describe("getResearchOptIn", () => {
  it("returns {enabled: true} when getAppSetting resolves true", async () => {
    mockGet.mockResolvedValue(true);
    const result = await getResearchOptIn();
    expect(result).toEqual({ enabled: true });
  });

  it("returns {enabled: false} when getAppSetting resolves null (no row)", async () => {
    mockGet.mockResolvedValue(null);
    const result = await getResearchOptIn();
    expect(result).toEqual({ enabled: false });
  });

  it("returns {enabled: false} when getAppSetting resolves false", async () => {
    mockGet.mockResolvedValue(false);
    const result = await getResearchOptIn();
    expect(result).toEqual({ enabled: false });
  });

  it("reads from the correct key 'research_opt_in_enabled'", async () => {
    mockGet.mockResolvedValue(null);
    await getResearchOptIn();
    expect(mockGet).toHaveBeenCalledWith("research_opt_in_enabled");
  });
});

describe("setResearchOptIn", () => {
  beforeEach(() => {
    mockPut.mockResolvedValue(true);
  });

  it("delegates to putAppSetting with key='research_opt_in_enabled' and the enabled value", async () => {
    await setResearchOptIn(true);
    expect(mockPut).toHaveBeenCalledWith("research_opt_in_enabled", true);
  });

  it("returns {enabled: true} after writing true", async () => {
    mockPut.mockResolvedValue(true);
    const result = await setResearchOptIn(true);
    expect(result).toEqual({ enabled: true });
  });

  it("returns {enabled: false} after writing false", async () => {
    mockPut.mockResolvedValue(false);
    const result = await setResearchOptIn(false);
    expect(result).toEqual({ enabled: false });
  });

  it("calls putAppSetting with false when disabling", async () => {
    await setResearchOptIn(false);
    expect(mockPut).toHaveBeenCalledWith("research_opt_in_enabled", false);
  });
});
