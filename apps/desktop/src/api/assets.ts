import type {
  AssetUploadRequest,
  AssetUploadResponse,
  ParseRequestResponse,
  ParseResultResponse,
} from "@eatit/shared-types";
import { apiClient } from "@/api/client";

export const uploadResume = async (
  file: File,
  request: AssetUploadRequest = {},
): Promise<AssetUploadResponse> => {
  const formData = new FormData();
  formData.append("file", file);
  if (request.asset_bundle_id) {
    formData.append("asset_bundle_id", request.asset_bundle_id);
  }

  const response = await apiClient.post<AssetUploadResponse>("/api/v1/assets/resume", formData);
  return response.data;
};

export const uploadJd = async (
  file: File,
  request: AssetUploadRequest = {},
): Promise<AssetUploadResponse> => {
  const formData = new FormData();
  formData.append("file", file);
  if (request.asset_bundle_id) {
    formData.append("asset_bundle_id", request.asset_bundle_id);
  }

  const response = await apiClient.post<AssetUploadResponse>("/api/v1/assets/jd", formData);
  return response.data;
};

export const triggerParse = async (assetBundleId: string): Promise<ParseRequestResponse> => {
  // ParseAgent runs inline and processes the full resume + JD in one
  // LLM call. Default axios 30s timeout fires mid-call on slower tiers.
  // 3 minutes covers worst-case parse without trapping the user forever.
  const response = await apiClient.post<ParseRequestResponse>(
    `/api/v1/assets/${assetBundleId}/parse`,
    undefined,
    { timeout: 180_000 },
  );
  return response.data;
};

export const getParseResult = async (assetBundleId: string): Promise<ParseResultResponse> => {
  // skipErrorToast: 404 = "no parse on file yet" is a *legitimate* state
  // for a fresh upload or a stale store-cached assetBundleId from a prior
  // dev session. The caller decides whether to surface the absence.
  const response = await apiClient.get<ParseResultResponse>(
    `/api/v1/assets/${assetBundleId}/parse`,
    { skipErrorToast: true },
  );
  return response.data;
};
