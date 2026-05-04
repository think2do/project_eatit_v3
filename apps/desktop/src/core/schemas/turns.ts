import { z } from "zod";

// ===== turns.py schemas (5 models) =====

/**
 * Mirror of Python NormalizedQuestion(SchemaModel).
 * turn_index: ge=1.
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const NormalizedQuestionSchema = z
  .object({
    turn_index: z.number().int().min(1),
    stage_name: z.string(),
    question_tag: z.string(),
    question_text: z.string(),
  })
  .strict();

export type NormalizedQuestion = z.infer<typeof NormalizedQuestionSchema>;

/**
 * Mirror of Python NormalizedAnswer(SchemaModel).
 * turn_index: ge=1.
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const NormalizedAnswerSchema = z
  .object({
    turn_index: z.number().int().min(1),
    transcript_text: z.string(),
    cleaned_sentences: z.array(z.string()),
    key_points: z.array(z.string()),
  })
  .strict();

export type NormalizedAnswer = z.infer<typeof NormalizedAnswerSchema>;

/**
 * Mirror of Python NormalizedUserAssessment(SchemaModel).
 * turn_index: ge=1. score_optional: float | None.
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const NormalizedUserAssessmentSchema = z
  .object({
    turn_index: z.number().int().min(1),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    risks: z.array(z.string()),
    suggestions: z.array(z.string()),
    evidence: z.array(z.string()),
    score_optional: z.number().nullable().optional(),
  })
  .strict();

export type NormalizedUserAssessment = z.infer<
  typeof NormalizedUserAssessmentSchema
>;

/**
 * Mirror of Python CompressedTurnSummary(SchemaModel).
 * turn_index: ge=1. All array fields default to [].
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const CompressedTurnSummarySchema = z
  .object({
    turn_index: z.number().int().min(1),
    question_tag: z.string(),
    candidate_claims: z.array(z.string()).default([]),
    metrics_mentioned: z.array(z.string()).default([]),
    strengths: z.array(z.string()).default([]),
    weaknesses: z.array(z.string()).default([]),
    followup_candidates: z.array(z.string()).default([]),
    toxicity_or_risk: z.array(z.string()).default([]),
  })
  .strict();

export type CompressedTurnSummary = z.infer<typeof CompressedTurnSummarySchema>;

/**
 * Mirror of Python ReferenceAnswer(SchemaModel).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const ReferenceAnswerSchema = z
  .object({
    checkpoints: z.array(z.string()),
    expected_project_familiarity: z.string(),
    expected_confidence: z.string(),
    answer_script: z.string(),
  })
  .strict();

export type ReferenceAnswer = z.infer<typeof ReferenceAnswerSchema>;

// M3.2.2: Reference Agent contract input
// §A11 PII guard: .strict() rejects extra fields (resume_text / candidate_email / candidate_phone etc.)
export const ReferenceAgentInputSchema = z
  .object({
    question: z.string().min(1),
    job_context: z.string().nullable().optional(),
    candidate_answer: z.string().nullable().optional(),
  })
  .strict();
export type ReferenceAgentInput = z.infer<typeof ReferenceAgentInputSchema>;

// M3.2.2: Reference Agent contract output (LLM-generated reference answer payload)
export const ReferenceAgentOutputSchema = z
  .object({
    answer_outline: z.array(z.string()),
    ideal_answer: z.string(),
    key_evaluation_points: z.array(z.string()),
    common_pitfalls: z.array(z.string()),
  })
  .strict();
export type ReferenceAgentOutput = z.infer<typeof ReferenceAgentOutputSchema>;
