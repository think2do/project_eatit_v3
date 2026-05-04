import { z } from "zod";
import { TimestampedResponseSchema } from "./common";
import { PredictedQuestionBankSchema } from "./frameworks";

// ===== parse.py sub-schemas (legacy — L0 A10 retained) =====

/**
 * Mirror of Python JobRequirement(SchemaModel).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const JobRequirementSchema = z
  .object({
    title: z.string(),
    detail: z.string(),
  })
  .strict();

export type JobRequirement = z.infer<typeof JobRequirementSchema>;

/**
 * Mirror of Python CandidateHighlight(SchemaModel).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const CandidateHighlightSchema = z
  .object({
    title: z.string(),
    detail: z.string(),
  })
  .strict();

export type CandidateHighlight = z.infer<typeof CandidateHighlightSchema>;

/**
 * Mirror of Python CandidateRisk(SchemaModel).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const CandidateRiskSchema = z
  .object({
    title: z.string(),
    detail: z.string(),
  })
  .strict();

export type CandidateRisk = z.infer<typeof CandidateRiskSchema>;

/**
 * Mirror of Python ProjectHook(SchemaModel).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const ProjectHookSchema = z
  .object({
    project_name: z.string(),
    reason: z.string(),
    focus_points: z.array(z.string()),
  })
  .strict();

export type ProjectHook = z.infer<typeof ProjectHookSchema>;

// ===== v3.2 sub-schemas (F-301) =====

/**
 * Mirror of Python MatchScore(SchemaModel) with cross-field validator.
 * ★ CROSS-FIELD ★: score < 60 → LOW; 60 ≤ score < 76 → MID; score ≥ 76 → HIGH.
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const MatchScoreSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    level: z.enum(["LOW", "MID", "HIGH"]),
    one_line: z.string().max(80),
  })
  .strict()
  .refine(
    (data) => {
      if (data.score < 60) return data.level === "LOW";
      if (data.score < 76) return data.level === "MID";
      return data.level === "HIGH";
    },
    { message: "score must align with level: <60→LOW, 60-75→MID, ≥76→HIGH" },
  );

export type MatchScore = z.infer<typeof MatchScoreSchema>;

/**
 * Mirror of Python MatchAdvantage(SchemaModel).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const MatchAdvantageSchema = z
  .object({
    label: z.string().max(30),
    tag: z.enum(["强匹配", "匹配"]),
    evidence: z.string().max(200),
  })
  .strict();

export type MatchAdvantage = z.infer<typeof MatchAdvantageSchema>;

/**
 * Mirror of Python Gap(SchemaModel).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const GapSchema = z
  .object({
    label: z.string().max(30),
    tag: z.enum(["需补充", "待评估"]),
    evidence: z.string().max(200),
  })
  .strict();

export type Gap = z.infer<typeof GapSchema>;

/**
 * Mirror of Python InterviewFocus(SchemaModel).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const InterviewFocusSchema = z
  .object({
    direction_id: z.enum([
      "ai-insight",
      "data-driven",
      "cross-func",
      "zero-to-one",
      "user-research",
      "strategy",
    ]),
    priority: z.enum(["high", "mid", "low"]),
    title: z.string().max(30),
    description: z.string().max(120),
  })
  .strict();

export type InterviewFocus = z.infer<typeof InterviewFocusSchema>;

/**
 * Mirror of Python ProjectHookV32(SchemaModel).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const ProjectHookV32Schema = z
  .object({
    name: z.string().max(50),
    why: z.string().max(120),
  })
  .strict();

export type ProjectHookV32 = z.infer<typeof ProjectHookV32Schema>;

/**
 * Mirror of Python CandidateProfile(SchemaModel).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const CandidateProfileSchema = z
  .object({
    role: z.string().max(40),
    years: z.number().int().min(0).max(60),
    companies: z.array(z.string()).max(10).default([]),
    domain_tags: z.array(z.string()).max(10).default([]),
  })
  .strict();

export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;

/**
 * Mirror of Python ParseResultPayload(SchemaModel).
 * Contains L0 privacy guard fields: jd_company_name / jd_role_title / jd_industry_hints.
 * ★ §A0.4 + §C JD privacy guards ★: max 80 / 80 / array max 5.
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const ParseResultPayloadSchema = z
  .object({
    // legacy (L0 A10 retained)
    job_requirements: z.array(JobRequirementSchema).default([]),
    candidate_highlights: z.array(CandidateHighlightSchema).default([]),
    candidate_risks: z.array(CandidateRiskSchema).default([]),
    project_hooks: z.array(ProjectHookSchema).default([]),
    match_summary: z.string().nullable().optional(),
    // v3.2 additions
    candidate_profile: CandidateProfileSchema.nullable().optional(),
    match_score: MatchScoreSchema.nullable().optional(),
    profile_summary: z.string().max(300).nullable().optional(),
    match_advantages: z.array(MatchAdvantageSchema).max(5).default([]),
    gaps: z.array(GapSchema).max(5).default([]),
    interview_focus: z.array(InterviewFocusSchema).max(3).default([]),
    project_hooks_v32: z.array(ProjectHookV32Schema).max(2).default([]),
    // M2.3.X audit-fix (F-320) — ★ L0 PRIVACY GUARD ★ jd_* fields
    jd_company_name: z.string().max(80).nullable().optional(), // §A0.4 + §C privacy guard: max 80
    jd_role_title: z.string().max(80).nullable().optional(), // §A0.4 + §C privacy guard: max 80
    jd_industry_hints: z.array(z.string()).max(5).default([]), // §A0.4 + §C privacy guard: max 5
  })
  .strict();

export type ParseResultPayload = z.infer<typeof ParseResultPayloadSchema>;

/**
 * Mirror of Python ParseRequestResponse(SchemaModel).
 * research_payload: z.unknown() forward-ref — TODO M3.1.1.d: replace with ResearchAgentOutputSchema.
 * predicted_questions: PredictedQuestionBankSchema (defined in frameworks.ts this loop).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const ParseRequestResponseSchema = z
  .object({
    asset_bundle_id: z.string().uuid(),
    status: z.string(),
    payload: ParseResultPayloadSchema,
    // TODO M3.1.1.d: replace z.unknown() with ResearchAgentOutputSchema once research.ts lands
    research_payload: z.unknown().nullable().optional(),
    predicted_questions: PredictedQuestionBankSchema.nullable().optional(),
  })
  .strict();

export type ParseRequestResponse = z.infer<typeof ParseRequestResponseSchema>;

/**
 * Mirror of Python ParseResultResponse(TimestampedResponse).
 * Zod has no schema inheritance — merge TimestampedResponse fields manually.
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const ParseResultResponseSchema = TimestampedResponseSchema.extend({
  candidate_asset_id: z.string().uuid(),
  status: z.string(),
  payload: ParseResultPayloadSchema,
}).strict();

export type ParseResultResponse = z.infer<typeof ParseResultResponseSchema>;

/**
 * Mirror of Python ParseResultPreview(SchemaModel).
 * ★ M3.1.1.a's assets.ts forward-ref points HERE ★
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const ParseResultPreviewSchema = z
  .object({
    match_summary: z.string(),
    candidate_risk_count: z.number().int().min(0),
    project_hook_count: z.number().int().min(0),
  })
  .strict();

export type ParseResultPreview = z.infer<typeof ParseResultPreviewSchema>;
