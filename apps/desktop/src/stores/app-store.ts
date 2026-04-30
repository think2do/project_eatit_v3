import { create } from "zustand";
import type {
  InterviewDirectionV32,
  InterviewDurationV32,
  InterviewStyleV32,
  ParseResultPayload,
  PredictedQuestionBank,
  ResearchResult,
  UserInsightCache,
} from "@eatit/shared-types";

type UploadStatus = "idle" | "uploading" | "uploaded" | "failed";
type ParseStatus = "idle" | "running" | "succeeded" | "failed";

export type CurrentUpload = {
  assetBundleId: string | null;
  resumeFileName: string | null;
  jdFileName: string | null;
  // V32.M2.2.X audit fix (F-303) — file size in bytes, captured client-
  // side when the user picks the file. Drives the "· N KB" tail of the
  // DropZone metadata strip in done state.
  resumeFileSize: number | null;
  jdFileSize: number | null;
  resumeStatus: UploadStatus;
  jdStatus: UploadStatus;
  parseStatus: ParseStatus;
  parsePayload: ParseResultPayload | null;
  // V32.M2.3.5 (F-320) — Research output from intake_graph's
  // research_node. Null when user opted out, the JD heuristics could
  // not derive company/role, or the upstream API has not yet exposed
  // it. ParsedPanel renders CompanyCard / IndustryCard only when both
  // researchOptIn=true AND this is non-null.
  researchPayload: ResearchResult | null;
  // V32.M2.3.5 (F-321) — PredictedQuestionBank from intake_graph's
  // predict_questions_node. Null when Framework declined to predict
  // (insufficient evidence) or when the bank API has not yet shipped.
  predictedQuestions: PredictedQuestionBank | null;
  // V32.M2.2.4 — wallclock at the moment parseStatus flipped to
  // "succeeded". Drives ParsedMetaBar's "N 秒前生成" relative time.
  parsedAtMs: number | null;
  error: string | null;
};

export type CurrentConfig = {
  // v3.2+ shape (F-307). Old single `direction` field is folded into
  // a 1–3-item `directions` list at the type level; backend still
  // accepts a singular legacy `direction` via its before-validator,
  // but the desktop client now writes the v3.2 shape directly.
  style: InterviewStyleV32;
  directions: InterviewDirectionV32[];
  durationMinutes: InterviewDurationV32;
};

type AppStore = {
  upload: CurrentUpload;
  patchUpload: (patch: Partial<CurrentUpload>) => void;
  resetUpload: () => void;

  config: CurrentConfig;
  patchConfig: (patch: Partial<CurrentConfig>) => void;

  // F-317 V32.M1.5 — one-shot prefill bridge from ReportPage's dark
  // CTA to ConfigPage. The dark card commits this slot, navigates to
  // ConfigPage, and the page consumes (then clears) the slot on mount.
  presetConfig: Partial<CurrentConfig> | null;
  setPresetConfig: (preset: Partial<CurrentConfig> | null) => void;

  // F-302 V32.M2.2.3 — InterviewFocus cards on ParsedPanel toggle the
  // user's preferred direction_ids; ConfigPage reads this on mount to
  // pre-populate `directions` (capped at 3 per F-307). Subsequent edits
  // in ConfigPage no longer flow back here — the store entry is sticky
  // until the user re-parses (cleared by `resetSelectedFocusIds`).
  selectedFocusIds: InterviewDirectionV32[];
  setSelectedFocusIds: (ids: InterviewDirectionV32[]) => void;
  toggleSelectedFocusId: (id: InterviewDirectionV32) => void;
  resetSelectedFocusIds: () => void;

  // V32.M2.2.X audit fix — was a `useRef(false)` inside ConfigPage, but
  // a ref is reset on unmount, so navigating Config→Upload→Config kept
  // re-seeding `directions` from selectedFocusIds and clobbered the
  // user's hand edits. Promoting it to the store keeps the lock across
  // remounts. patchUpload (new parse) flips it back to false so the
  // next ConfigPage mount can re-seed; patchConfig flips it true so
  // hand edits stick.
  hasSyncedFocusToConfig: boolean;
  markFocusSyncedToConfig: () => void;

  // V32.M2.3.5 (F-320) — desktop mirror of `research_opt_in` from the
  // backend app_settings table. Components read this flag to decide
  // whether to render CompanyCard / IndustryCard / PredictedQuestionList
  // (Research output is only fetched when opt-in is true). The
  // SettingsPage toggle calls setResearchOptIn() to persist; that
  // helper writes through to the API and flips this slot.
  researchOptIn: boolean;
  setResearchOptIn: (enabled: boolean) => void;

  // F-318 V32.M3.1.4 — cross-session Coach insight payload backing the
  // Dashboard AICoachCard. ``null`` covers two cases: (a) HistoryPage
  // hasn't fetched yet, (b) the API returned 204 because the trigger
  // hasn't run for this user. The card branches on ``insights`` +
  // ``insights.status``; clients should not render coach copy when null.
  insights: UserInsightCache | null;
  setInsights: (insights: UserInsightCache | null) => void;
};

const DEFAULT_UPLOAD: CurrentUpload = {
  assetBundleId: null,
  resumeFileName: null,
  jdFileName: null,
  resumeFileSize: null,
  jdFileSize: null,
  resumeStatus: "idle",
  jdStatus: "idle",
  parseStatus: "idle",
  parsePayload: null,
  researchPayload: null,
  predictedQuestions: null,
  parsedAtMs: null,
  error: null,
};

const DEFAULT_CONFIG: CurrentConfig = {
  style: "structured",
  directions: ["zero-to-one"],
  durationMinutes: 30,
};

export const useAppStore = create<AppStore>((set) => ({
  upload: { ...DEFAULT_UPLOAD },
  patchUpload: (patch) =>
    set((state) => ({
      upload: { ...state.upload, ...patch },
      // A patch that touches `parsePayload` indicates the parse
      // lifecycle just moved (new upload clears it to null; successful
      // parse sets the new payload). Either way, drop the seed-lock so
      // the next ConfigPage mount re-seeds `directions` from the
      // freshly chosen focus cards.
      hasSyncedFocusToConfig: "parsePayload" in patch
        ? false
        : state.hasSyncedFocusToConfig,
    })),
  resetUpload: () => set({ upload: { ...DEFAULT_UPLOAD }, hasSyncedFocusToConfig: false }),

  config: { ...DEFAULT_CONFIG },
  patchConfig: (patch) =>
    set((state) => ({
      config: { ...state.config, ...patch },
      // Any user-driven config tweak locks the seed so navigation away
      // and back doesn't re-seed `directions` from selectedFocusIds.
      hasSyncedFocusToConfig: true,
    })),

  presetConfig: null,
  setPresetConfig: (preset) => set({ presetConfig: preset }),

  selectedFocusIds: [],
  setSelectedFocusIds: (ids) => set({ selectedFocusIds: ids }),
  toggleSelectedFocusId: (id) =>
    set((state) => ({
      selectedFocusIds: state.selectedFocusIds.includes(id)
        ? state.selectedFocusIds.filter((x) => x !== id)
        : [...state.selectedFocusIds, id],
    })),
  resetSelectedFocusIds: () => set({ selectedFocusIds: [] }),

  hasSyncedFocusToConfig: false,
  markFocusSyncedToConfig: () => set({ hasSyncedFocusToConfig: true }),

  researchOptIn: false,
  setResearchOptIn: (enabled) => set({ researchOptIn: enabled }),

  insights: null,
  setInsights: (insights) => set({ insights }),
}));
