import { create } from "zustand";
import type {
  InterviewDirectionV32,
  InterviewDurationV32,
  InterviewStyleV32,
  ParseResultPayload,
} from "@eatit/shared-types";

type UploadStatus = "idle" | "uploading" | "uploaded" | "failed";
type ParseStatus = "idle" | "running" | "succeeded" | "failed";

export type CurrentUpload = {
  assetBundleId: string | null;
  resumeFileName: string | null;
  jdFileName: string | null;
  resumeStatus: UploadStatus;
  jdStatus: UploadStatus;
  parseStatus: ParseStatus;
  parsePayload: ParseResultPayload | null;
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
};

const DEFAULT_UPLOAD: CurrentUpload = {
  assetBundleId: null,
  resumeFileName: null,
  jdFileName: null,
  resumeStatus: "idle",
  jdStatus: "idle",
  parseStatus: "idle",
  parsePayload: null,
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
    set((state) => ({ upload: { ...state.upload, ...patch } })),
  resetUpload: () => set({ upload: { ...DEFAULT_UPLOAD } }),

  config: { ...DEFAULT_CONFIG },
  patchConfig: (patch) =>
    set((state) => ({ config: { ...state.config, ...patch } })),
}));
