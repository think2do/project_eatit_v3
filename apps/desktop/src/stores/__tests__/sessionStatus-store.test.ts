import { describe, it, expect, beforeEach } from "vitest";
import { useSessionStatusStore } from "@/stores/sessionStatus-store";

function getStore() {
  return useSessionStatusStore.getState();
}

function resetStore() {
  useSessionStatusStore.setState({
    analyzing: new Set<string>(),
    unreadReports: new Set<string>(),
  });
}

beforeEach(() => {
  resetStore();
});

describe("sessionStatus-store", () => {
  describe("markAnalyzing", () => {
    it("adds sessionId to analyzing set", () => {
      getStore().markAnalyzing("sess-1");
      expect(getStore().analyzing.has("sess-1")).toBe(true);
    });

    it("does not touch unreadReports", () => {
      getStore().markAnalyzing("sess-1");
      expect(getStore().unreadReports.size).toBe(0);
    });

    it("supports multiple sessions simultaneously", () => {
      getStore().markAnalyzing("sess-1");
      getStore().markAnalyzing("sess-2");
      expect(getStore().analyzing.has("sess-1")).toBe(true);
      expect(getStore().analyzing.has("sess-2")).toBe(true);
    });
  });

  describe("markReady", () => {
    it("removes sessionId from analyzing and adds to unreadReports", () => {
      getStore().markAnalyzing("sess-1");
      getStore().markReady("sess-1");
      expect(getStore().analyzing.has("sess-1")).toBe(false);
      expect(getStore().unreadReports.has("sess-1")).toBe(true);
    });

    it("does not affect other sessions in analyzing", () => {
      getStore().markAnalyzing("sess-1");
      getStore().markAnalyzing("sess-2");
      getStore().markReady("sess-1");
      expect(getStore().analyzing.has("sess-2")).toBe(true);
    });

    it("is idempotent — calling twice still only 1 entry in unreadReports", () => {
      getStore().markAnalyzing("sess-1");
      getStore().markReady("sess-1");
      getStore().markReady("sess-1");
      expect(getStore().unreadReports.size).toBe(1);
    });
  });

  describe("markRead", () => {
    it("removes sessionId from unreadReports", () => {
      getStore().markAnalyzing("sess-1");
      getStore().markReady("sess-1");
      getStore().markRead("sess-1");
      expect(getStore().unreadReports.has("sess-1")).toBe(false);
    });

    it("does not affect other entries in unreadReports", () => {
      getStore().markAnalyzing("sess-1");
      getStore().markReady("sess-1");
      getStore().markAnalyzing("sess-2");
      getStore().markReady("sess-2");
      getStore().markRead("sess-1");
      expect(getStore().unreadReports.has("sess-2")).toBe(true);
      expect(getStore().unreadReports.has("sess-1")).toBe(false);
    });

    it("is a no-op when sessionId was never in unreadReports", () => {
      getStore().markRead("nonexistent");
      expect(getStore().unreadReports.size).toBe(0);
    });
  });

  describe("Set immutability", () => {
    it("each state update produces a new Set reference", () => {
      const before = getStore().analyzing;
      getStore().markAnalyzing("sess-1");
      const after = getStore().analyzing;
      expect(before).not.toBe(after);
    });

    it("markReady produces new Set references for both sets", () => {
      getStore().markAnalyzing("sess-1");
      const analyzingBefore = getStore().analyzing;
      const unreadBefore = getStore().unreadReports;
      getStore().markReady("sess-1");
      expect(getStore().analyzing).not.toBe(analyzingBefore);
      expect(getStore().unreadReports).not.toBe(unreadBefore);
    });

    it("markRead produces a new Set reference for unreadReports", () => {
      getStore().markAnalyzing("sess-1");
      getStore().markReady("sess-1");
      const before = getStore().unreadReports;
      getStore().markRead("sess-1");
      expect(getStore().unreadReports).not.toBe(before);
    });
  });
});
