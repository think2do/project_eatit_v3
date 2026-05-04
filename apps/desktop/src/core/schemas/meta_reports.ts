import { z } from "zod";

// ===== meta_reports.py enums =====

export const MetaReportStatusSchema = z.enum([
  "generating",
  "ready",
  "failed",
]);

export type MetaReportStatus = z.infer<typeof MetaReportStatusSchema>;

// ===== meta_reports.py models =====

export const TriggerMetaReportRequestSchema = z
  .object({
    session_ids: z.array(z.string()).nullable().optional(),
  })
  .strict();

export type TriggerMetaReportRequest = z.infer<typeof TriggerMetaReportRequestSchema>;

export const TriggerMetaReportResponseSchema = z
  .object({
    id: z.string().uuid(),
    task_id: z.string(),
    status: MetaReportStatusSchema,
    covered_session_ids: z.array(z.string()),
    created_at: z.string().datetime(),
  })
  .strict();

export type TriggerMetaReportResponse = z.infer<typeof TriggerMetaReportResponseSchema>;

export const MetaReportDetailResponseSchema = z
  .object({
    id: z.string().uuid(),
    user_id: z.string(),
    status: MetaReportStatusSchema,
    covered_session_ids: z.array(z.string()),
    payload: z.record(z.unknown()).nullable().optional(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .strict();

export type MetaReportDetailResponse = z.infer<typeof MetaReportDetailResponseSchema>;

export const MetaReportListItemSchema = z
  .object({
    id: z.string().uuid(),
    status: MetaReportStatusSchema,
    covered_session_ids: z.array(z.string()),
    session_count: z.number().int(),
    created_at: z.string().datetime(),
  })
  .strict();

export type MetaReportListItem = z.infer<typeof MetaReportListItemSchema>;

export const MetaReportListRequestSchema = z
  .object({
    page: z.number().int().min(1).default(1),
    page_size: z.number().int().min(1).max(100).default(20),
  })
  .strict();

export type MetaReportListRequest = z.infer<typeof MetaReportListRequestSchema>;

export const MetaReportListResponseSchema = z
  .object({
    items: z.array(MetaReportListItemSchema),
    page: z.number().int(),
    page_size: z.number().int(),
    total: z.number().int(),
  })
  .strict();

export type MetaReportListResponse = z.infer<typeof MetaReportListResponseSchema>;
