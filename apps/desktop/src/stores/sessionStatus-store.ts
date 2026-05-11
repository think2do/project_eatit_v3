import { create } from "zustand";

interface SessionStatusStore {
  analyzing: Set<string>;
  unreadReports: Set<string>;
  markAnalyzing: (sessionId: string) => void;
  markReady: (sessionId: string) => void;
  markRead: (sessionId: string) => void;
}

export const useSessionStatusStore = create<SessionStatusStore>((set) => ({
  analyzing: new Set<string>(),
  unreadReports: new Set<string>(),
  markAnalyzing(sessionId) {
    set((state) => ({
      analyzing: new Set([...state.analyzing, sessionId]),
    }));
  },
  markReady(sessionId) {
    set((state) => ({
      analyzing: new Set([...state.analyzing].filter((id) => id !== sessionId)),
      unreadReports: new Set([...state.unreadReports, sessionId]),
    }));
  },
  markRead(sessionId) {
    set((state) => ({
      unreadReports: new Set([...state.unreadReports].filter((id) => id !== sessionId)),
    }));
  },
}));
