import { z } from "zod";
import { TimestampedResponseSchema, paginatedResponseSchema } from "./common";
import {
  InterviewStyleV32Schema,
  InterviewDirectionV32Schema,
  InterviewDirectionSchema,
  InterviewDurationV32Schema,
  DirectionFrameworkSchema,
} from "./frameworks";

// ===== sessions.py enum =====

/**
 * Mirror of Python InterviewSessionStatus (StrEnum).
 * 13 values — L0 lock: deletion forbidden.
 */
export const InterviewSessionStatusSchema = z.enum([
  "created",
  "session_started",
  "turn_recording",
  "turn_transcribing",
  "turn_evaluating",
  "turn_compressing",
  "next_question_ready",
  "paused",
  "ended",
  "exited_early",
  "report_generating",
  "report_ready",
  "failed",
]);

export type InterviewSessionStatus = z.infer<
  typeof InterviewSessionStatusSchema
>;

// ===== sessions.py schemas (9 models) =====

/**
 * Mirror of Python InterviewConfigRequest(SchemaModel).
 * ★ L0-4 LOCK ★: InterviewConfig 4+6+4 三轴锁.
 *   style: InterviewStyleV32 — 4 values locked (frameworks.ts).
 *   directions: list[InterviewDirectionV32] — 6 values, min_length=1, max_length=3.
 *   duration_minutes: InterviewDurationV32 — 4 values locked (15/30/45/60, frameworks.ts).
 *   direction: legacy v3.1 single InterviewDirection — optional, 3 values.
 * Note: field_validators for legacy promotion omitted per §E1 (not in LangGraph.js scope).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const InterviewConfigRequestSchema = z
  .object({
    style: InterviewStyleV32Schema, // ★ L0-4: 4 values locked
    direction: InterviewDirectionSchema.nullable().optional(), // legacy v3.1 single
    directions: z.array(InterviewDirectionV32Schema).min(1).max(3).default([]), // ★ L0-4: 6 values, 1-3 length
    duration_minutes: InterviewDurationV32Schema, // ★ L0-4: 4 values locked (15/30/45/60)
  })
  .strict();

export type InterviewConfigRequest = z.infer<
  typeof InterviewConfigRequestSchema
>;

/**
 * Mirror of Python InterviewConfigResponse(TimestampedResponse).
 * direction: InterviewDirectionV32 | InterviewDirection | None (union v3.2+v3.1).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const InterviewConfigResponseSchema = TimestampedResponseSchema.extend({
  interview_session_id: z.string().uuid(),
  style: InterviewStyleV32Schema,
  directions: z.array(InterviewDirectionV32Schema).default([]),
  duration_minutes: InterviewDurationV32Schema,
  direction: z
    .union([InterviewDirectionV32Schema, InterviewDirectionSchema])
    .nullable()
    .optional(),
}).strict();

export type InterviewConfigResponse = z.infer<
  typeof InterviewConfigResponseSchema
>;

/**
 * Mirror of Python CreateSessionRequest(SchemaModel).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const CreateSessionRequestSchema = z
  .object({
    asset_bundle_id: z.string().uuid(),
    config: InterviewConfigRequestSchema,
  })
  .strict();

export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

/**
 * Mirror of Python SessionListRequest(SchemaModel).
 * page: ge=1 default=1; page_size: ge=1 le=100 default=20.
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const SessionListRequestSchema = z
  .object({
    page: z.number().int().min(1).default(1),
    page_size: z.number().int().min(1).max(100).default(20),
    status: InterviewSessionStatusSchema.nullable().optional(),
  })
  .strict();

export type SessionListRequest = z.infer<typeof SessionListRequestSchema>;

/**
 * Mirror of Python CreateSessionResponse(SchemaModel).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const CreateSessionResponseSchema = z
  .object({
    session_id: z.string().uuid(),
    status: InterviewSessionStatusSchema,
    direction_framework: DirectionFrameworkSchema,
  })
  .strict();

export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;

/**
 * Mirror of Python SessionSummary(TimestampedResponse).
 * latest_weaknesses: max 2 items (per Pydantic max_length=2).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const SessionSummarySchema = TimestampedResponseSchema.extend({
  user_id: z.string().uuid(),
  candidate_asset_id: z.string().uuid(),
  status: InterviewSessionStatusSchema,
  started_at: z.string().datetime().nullable().optional(),
  ended_at: z.string().datetime().nullable().optional(),
  turn_count: z.number().int().min(0),
  config_snapshot: z.record(z.unknown()),
  latest_overall_score: z.number().int().min(0).max(100).nullable().optional(),
  latest_weaknesses: z.array(z.string()).max(2).default([]),
}).strict();

export type SessionSummary = z.infer<typeof SessionSummarySchema>;

/**
 * Mirror of Python SessionDetailResponse(SessionSummary).
 * Extends SessionSummary with config and direction_framework fields.
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const SessionDetailResponseSchema = SessionSummarySchema.extend({
  config: InterviewConfigResponseSchema.nullable().optional(),
  direction_framework: DirectionFrameworkSchema.nullable().optional(),
}).strict();

export type SessionDetailResponse = z.infer<typeof SessionDetailResponseSchema>;

/**
 * Mirror of Python SessionListResponse(PaginatedResponse[SessionSummary]).
 * Uses paginatedResponseSchema factory from common.ts.
 */
export const SessionListResponseSchema = paginatedResponseSchema(
  SessionSummarySchema,
);

export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;

/**
 * Mirror of Python EndSessionResponse(SchemaModel).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const EndSessionResponseSchema = z
  .object({
    session_id: z.string().uuid(),
    status: InterviewSessionStatusSchema,
    ended_at: z.string().datetime(),
  })
  .strict();

export type EndSessionResponse = z.infer<typeof EndSessionResponseSchema>;
