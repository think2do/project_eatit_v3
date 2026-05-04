import { z } from "zod";
import { TimestampedResponseSchema } from "./common";
import {
  NormalizedQuestionSchema,
  NormalizedAnswerSchema,
  NormalizedUserAssessmentSchema,
} from "./turns";
import { InterviewConfigRequestSchema } from "./sessions";

// ===== reports.py enums =====

/**
 * Mirror of Python InterviewReportStatus (4 values).
 * L0 lock — deletion forbidden.
 */
export const InterviewReportStatusSchema = z.enum([
  "pending",
  "generating",
  "ready",
  "failed",
]);

export type InterviewReportStatus = z.infer<typeof InterviewReportStatusSchema>;

/**
 * Mirror of Python ReportVerdict (Literal).
 * 4 values.
 */
export const ReportVerdictSchema = z.enum(["strong", "solid", "mixed", "weak"]);

export type ReportVerdict = z.infer<typeof ReportVerdictSchema>;

/**
 * ★ L0-2 LOCK ★: PassLikelihood 3 档 — 完全不可变.
 * Mirror of Python PassLikelihood = Literal["中上","中","中下"].
 */
export const PassLikelihoodSchema = z.enum(["中上", "中", "中下"]);

export type PassLikelihood = z.infer<typeof PassLikelihoodSchema>;

/**
 * ★ L0-1 LOCK ★: 5 维度 name — 完全不可变 protected path.
 * Mirror of Python DIMENSION_NAMES = Literal["专业深度","结构化表达","批判性思考","业务直觉","沟通节奏"].
 * Any character-level change = immediate stop + report.
 */
export const DimensionNameSchema = z.enum([
  "专业深度", // 不可改
  "结构化表达", // 不可改
  "批判性思考", // 不可改
  "业务直觉", // 不可改
  "沟通节奏", // 不可改
]);

export type DimensionName = z.infer<typeof DimensionNameSchema>;

// ===== L0-3: 12 禁止词 教学语气护栏 =====

/**
 * ★ L0-3 LOCK ★: FORBIDDEN_TONE_WORDS — 12 禁止词常量数组, 完全不可变.
 * post_report 教学语气护栏. M3.3 service layer applies sanitizeTone at runtime.
 * Schema layer exports constant + helpers; Zod does NOT auto-apply (per architect §L0-3 spec).
 */
export const FORBIDDEN_TONE_WORDS = [
  "不建议",
  "不推荐",
  "建议放弃",
  "不适合",
  "差距很大",
  "不合格",
  "淘汰",
  "无希望",
  "拒绝你",
  "失败者",
  "你不行",
  "太差",
] as const;

/**
 * Scan text for forbidden tone words.
 * Returns list of matched forbidden words found in the text.
 */
export function scanForbiddenTone(text: string): string[] {
  return FORBIDDEN_TONE_WORDS.filter((w) => text.includes(w));
}

/**
 * Sanitize text by replacing with fallback if any forbidden tone word is found.
 * M3.3 service layer calls this at runtime before persisting ai_verdict.
 */
export function sanitizeTone(text: string, fallback: string): string {
  return scanForbiddenTone(text).length > 0 ? fallback : text;
}

// ===== reports.py schemas (12 models) =====

/**
 * Mirror of Python RoundReview(SchemaModel).
 * Imports NormalizedQuestion/Answer/Assessment from turns.ts (no circular dep).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const RoundReviewSchema = z
  .object({
    question: NormalizedQuestionSchema,
    answer: NormalizedAnswerSchema,
    assessment: NormalizedUserAssessmentSchema,
  })
  .strict();

export type RoundReview = z.infer<typeof RoundReviewSchema>;

/**
 * Mirror of Python ReportReason(SchemaModel).
 * evidence_turn_index: ge=0.
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const ReportReasonSchema = z
  .object({
    aspect: z.string(),
    verdict: ReportVerdictSchema,
    evidence_turn_index: z.number().int().min(0),
    quote: z.string(),
  })
  .strict();

export type ReportReason = z.infer<typeof ReportReasonSchema>;

/**
 * Mirror of Python Chip(SchemaModel).
 * text: max_length=20.
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const ChipSchema = z
  .object({
    text: z.string().max(20),
    good: z.boolean(),
  })
  .strict();

export type Chip = z.infer<typeof ChipSchema>;

/**
 * Mirror of Python DimensionScore(SchemaModel).
 * name: ★ L0-1 DimensionNameSchema lock ★.
 * score: ge=0, le=100.
 * evidence_chips: min_length=1, max_length=6.
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const DimensionScoreSchema = z
  .object({
    name: DimensionNameSchema, // ★ L0-1 lock ★
    description: z.string(),
    score: z.number().int().min(0).max(100),
    evidence_chips: z.array(ChipSchema).min(1).max(6),
  })
  .strict();

export type DimensionScore = z.infer<typeof DimensionScoreSchema>;

/**
 * Mirror of Python RoundReviewV2(SchemaModel).
 * score: ge=0, le=100. tone: Literal["good","ok","warn"].
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const RoundReviewV2Schema = z
  .object({
    turn_index: z.number().int(),
    question_tag: z.string(),
    question_text: z.string(),
    score: z.number().int().min(0).max(100),
    tone: z.enum(["good", "ok", "warn"]),
    answer_summary: z.string(),
    ai_feedback: z.string(),
  })
  .strict();

export type RoundReviewV2 = z.infer<typeof RoundReviewV2Schema>;

/**
 * Mirror of Python NextActions(SchemaModel).
 * headline: max_length=20.
 * preset_config: InterviewConfigRequest — forward-ref resolved via direct import from "./sessions".
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const NextActionsSchema = z
  .object({
    headline: z.string().max(20),
    preset_config: InterviewConfigRequestSchema,
    reason: z.string(),
  })
  .strict();

export type NextActions = z.infer<typeof NextActionsSchema>;

/**
 * Mirror of Python InterviewReportPayload(SchemaModel).
 * ★ L0-2: pass_likelihood — PassLikelihoodSchema 3 档 ★
 * ★ L0-1: dimensions[].name — DimensionNameSchema 5 维度 ★
 * ★ L0-3: ai_verdict — nullable/optional; sanitizeTone applied at M3.3 service layer ★
 * dimensions: Pydantic uses default_factory=list with no min/max constraint;
 *   "严格 5 项 经过 normalize_dimensions 补齐 或空" invariant enforced in service layer, not schema.
 *   Schema accepts any length (including empty for v3.1 backward compat).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const InterviewReportPayloadSchema = z
  .object({
    overall_summary: z.string(),
    round_reviews: z.array(RoundReviewSchema).default([]),
    strengths: z.array(z.string()).default([]),
    improvements: z.array(z.string()).default([]),
    next_actions: z.array(z.string()).default([]),
    pass_probability: z.number().int().min(0).max(100).default(0),
    reasons: z.array(ReportReasonSchema).default([]),
    pass_likelihood: PassLikelihoodSchema.nullable().optional(), // ★ L0-2 ★
    overall_score: z.number().int().min(0).max(100).nullable().optional(),
    ai_verdict: z.string().nullable().optional(), // ★ L0-3: sanitizeTone at M3.3 service layer ★
    dimensions: z.array(DimensionScoreSchema).default([]), // ★ L0-1: name locked per DimensionNameSchema ★
    round_reviews_v2: z.array(RoundReviewV2Schema).default([]),
    next_actions_v2: NextActionsSchema.nullable().optional(),
  })
  .strict();

export type InterviewReportPayload = z.infer<
  typeof InterviewReportPayloadSchema
>;

/**
 * Mirror of Python TriggerReportRequest(SchemaModel).
 * force_regenerate: bool = False.
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const TriggerReportRequestSchema = z
  .object({
    force_regenerate: z.boolean().default(false),
  })
  .strict();

export type TriggerReportRequest = z.infer<typeof TriggerReportRequestSchema>;

/**
 * Mirror of Python TriggerReportResponse(SchemaModel).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const TriggerReportResponseSchema = z
  .object({
    session_id: z.string().uuid(),
    status: InterviewReportStatusSchema,
    requested_at: z.string().datetime(),
  })
  .strict();

export type TriggerReportResponse = z.infer<typeof TriggerReportResponseSchema>;

/**
 * Mirror of Python InterviewReportResponse(TimestampedResponse).
 * Extends TimestampedResponse with session + report fields.
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const InterviewReportResponseSchema = TimestampedResponseSchema.extend({
  interview_session_id: z.string().uuid(),
  status: InterviewReportStatusSchema,
  requested_at: z.string().datetime().nullable().optional(),
  generated_at: z.string().datetime().nullable().optional(),
  payload: InterviewReportPayloadSchema,
}).strict();

export type InterviewReportResponse = z.infer<
  typeof InterviewReportResponseSchema
>;

/**
 * Mirror of Python ReportStatusResponse(SchemaModel).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const ReportStatusResponseSchema = z
  .object({
    session_id: z.string().uuid(),
    status: InterviewReportStatusSchema,
    has_payload: z.boolean(),
  })
  .strict();

export type ReportStatusResponse = z.infer<typeof ReportStatusResponseSchema>;

// ===== ReportAgent I/O — added in M3.3.3.dev.a (mirrors Python apps/api/app/agents/report/schemas.py) =====

// ReportTurnAssessmentSnippet — Python schemas.py line 8-9
export const ReportTurnAssessmentSnippetSchema = z
  .object({ summary: z.string() })
  .strict();
export type ReportTurnAssessmentSnippet = z.infer<typeof ReportTurnAssessmentSnippetSchema>;

// ReportTurnRecord — Python schemas.py line 12-15
export const ReportTurnRecordSchema = z
  .object({
    question: z.string(),
    answer: z.string(),
    assessment: ReportTurnAssessmentSnippetSchema.nullable().optional(),
  })
  .strict();
export type ReportTurnRecord = z.infer<typeof ReportTurnRecordSchema>;

// ReportAgentInput — Python schemas.py line 18-22
// ★ L0 §A11 ★: .strict() rejects ANY unknown field including PII (resume_text / candidate_email / etc.)
export const ReportAgentInputSchema = z
  .object({
    parse_payload_json: z.string(),
    framework_json: z.string(),
    turns: z.array(ReportTurnRecordSchema),
    long_term_summary: z.string().nullable().optional(),
  })
  .strict();
export type ReportAgentInput = z.infer<typeof ReportAgentInputSchema>;

// ReportAgentOutput — Python schemas.py line 35-63
// pass_likelihood: z.string() (lenient at LLM boundary; coercePassLikelihood maps to PassLikelihoodSchema 3 档 post-LLM)
// dimensions: array of DimensionScoreSchema (name locked per L0-1); normalize_dimensions pads to 5 post-LLM
// ai_verdict: nullable string; sanitizeTone + regex applied post-LLM
export const ReportAgentOutputSchema = z
  .object({
    pass_probability: z.number().int().min(0).max(100),
    summary: z.string(),
    reasons: z.array(ReportReasonSchema),
    next_actions: z.array(z.string()),
    pass_likelihood: z.string().nullable().optional(), // ★ lenient; coerced post-LLM ★
    overall_score: z.number().int().min(0).max(100).nullable().optional(),
    ai_verdict: z.string().nullable().optional(), // ★ sanitizeTone + regex post-LLM ★
    dimensions: z.array(DimensionScoreSchema).default([]), // ★ L0-1 name lock; normalize_dimensions post-LLM ★
    round_reviews_v2: z.array(RoundReviewV2Schema).default([]),
    next_actions_v2: NextActionsSchema.nullable().optional(),
  })
  .strict();
export type ReportAgentOutput = z.infer<typeof ReportAgentOutputSchema>;
