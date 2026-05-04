import { z } from "zod";
import { InterviewDirectionV32Schema } from "./frameworks";

// ===== coach/schemas.py enums =====

export const UserInsightStatusSchema = z.enum([
  "pending",
  "running",
  "ok",
  "failed",
  "skipped",
]);

export type UserInsightStatus = z.infer<typeof UserInsightStatusSchema>;

// ===== coach/schemas.py models =====

/**
 * ★ L0 A11 PRIVACY GUARD ★
 * Mirror of Python CoachAgentInput with extra="forbid".
 * .strict() rejects ANY unknown field including PII fields.
 * Only 5 fields allowed: user_id / based_on_session_count /
 * based_on_last_session_id / recent_reports / candidate_profile.
 */
export const CoachAgentInputSchema = z
  .object({
    user_id: z.string().min(1),
    based_on_session_count: z.number().int().min(3),
    based_on_last_session_id: z.string().min(1),
    recent_reports: z.array(z.record(z.unknown())).min(3).max(10),
    candidate_profile: z.record(z.unknown()).nullable().optional(),
  })
  .strict();

export type CoachAgentInput = z.infer<typeof CoachAgentInputSchema>;

export const UserInsightCacheSchema = z
  .object({
    user_id: z.string().min(1),
    based_on_session_count: z.number().int().min(3),
    based_on_last_session_id: z.string().min(1),
    headline: z.string().max(80),
    headline_detail: z.string().max(240),
    recurring_weaknesses: z.array(z.string()).max(5).default([]),
    improvement_signals: z.array(z.string()).max(5).default([]),
    next_focus_areas: z.array(InterviewDirectionV32Schema).max(3).default([]),
    generated_at: z.string().datetime(),
    status: UserInsightStatusSchema.default("ok"),
  })
  .strict();

export type UserInsightCache = z.infer<typeof UserInsightCacheSchema>;

// CoachAgentOutput is identical to UserInsightCache (Pydantic: class CoachAgentOutput(UserInsightCache): pass)
export const CoachAgentOutputSchema = UserInsightCacheSchema;

export type CoachAgentOutput = z.infer<typeof CoachAgentOutputSchema>;

// LLM-output slice; metadata fields server-stamped
export const _LLMCoachOutputSchema = z
  .object({
    headline: z.string().max(80),
    headline_detail: z.string().max(240),
    recurring_weaknesses: z.array(z.string()).max(5).default([]),
    improvement_signals: z.array(z.string()).max(5).default([]),
    next_focus_areas: z.array(InterviewDirectionV32Schema).max(3).default([]),
  })
  .strict();

export type _LLMCoachOutput = z.infer<typeof _LLMCoachOutputSchema>;
