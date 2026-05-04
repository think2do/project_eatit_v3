import { z } from "zod";
import { TimestampedResponseSchema } from "./common";

/**
 * Mirror of Python CandidateAssetStatus (StrEnum).
 * String enum — all 5 values explicitly listed to lock the set.
 */
export const CandidateAssetStatusSchema = z.enum([
  "DRAFT",
  "READY_FOR_PARSE",
  "PARSE_IN_PROGRESS",
  "ANALYSIS_READY",
  "PARSE_FAILED",
]);

export type CandidateAssetStatus = z.infer<typeof CandidateAssetStatusSchema>;

/**
 * Mirror of Python AssetUploadResponse(TimestampedResponse).
 * Zod has no schema inheritance — merge parent fields manually.
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const AssetUploadResponseSchema = TimestampedResponseSchema.extend({
  asset_bundle_id: z.string().uuid(),
  status: CandidateAssetStatusSchema,
  uploaded_kind: z.string(),
}).strict();

export type AssetUploadResponse = z.infer<typeof AssetUploadResponseSchema>;

/**
 * Mirror of Python AssetUploadRequest(SchemaModel).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const AssetUploadRequestSchema = z
  .object({
    asset_bundle_id: z.string().uuid().nullable().optional(),
  })
  .strict();

export type AssetUploadRequest = z.infer<typeof AssetUploadRequestSchema>;

/**
 * Mirror of Python CandidateAssetResponse(TimestampedResponse).
 * parse_preview: z.unknown().nullable().optional() is a forward-reference placeholder.
 * TODO M3.1.1.b: replace z.unknown() with ParseResultPreviewSchema once parse.ts lands.
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const CandidateAssetResponseSchema = TimestampedResponseSchema.extend({
  user_id: z.string().uuid(),
  status: CandidateAssetStatusSchema,
  resume_filename: z.string().nullable().optional(),
  jd_filename: z.string().nullable().optional(),
  // TODO M3.1.1.b: replace z.unknown() with ParseResultPreviewSchema once parse.ts lands
  parse_preview: z.unknown().nullable().optional(),
}).strict();

export type CandidateAssetResponse = z.infer<
  typeof CandidateAssetResponseSchema
>;
