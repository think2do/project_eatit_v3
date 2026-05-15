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
//
// candidate_profile_json(2026-05-13 加入):BYOK 产品下,用户自己的简历摘要走自己的 ARK key 发给 LLM,
// 数据未出本机生态。让 ReferenceAgent 基于候选人真实经历生成可朗读的第一人称答案,而不是凭空捏"6 年经验"。
export const ReferenceAgentInputSchema = z
  .object({
    question: z.string().min(1),
    job_context: z.string().nullable().optional(),
    candidate_answer: z.string().nullable().optional(),
    candidate_profile_json: z.string().nullable().optional(),
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

// M3.2.3: Compression Agent contract (turn input + agent input/output)
// §A11 PII guard: .strict() rejects extra fields (resume_text / candidate_email / etc.)
export const CompressionTurnSchema = z
  .object({
    question: z.string(),
    answer: z.string(),
  })
  .strict();
export type CompressionTurn = z.infer<typeof CompressionTurnSchema>;

export const CompressionAgentInputSchema = z
  .object({
    previous_summary: z.string().nullable().optional(),
    turns: z.array(CompressionTurnSchema),
  })
  .strict();
export type CompressionAgentInput = z.infer<typeof CompressionAgentInputSchema>;

export const CompressionAgentOutputSchema = z
  .object({
    summary: z.string(),
    preserved_keywords: z.array(z.string()),
    open_threads: z.array(z.string()),
  })
  .strict();
export type CompressionAgentOutput = z.infer<typeof CompressionAgentOutputSchema>;

// M3.2.4: Observer Agent contract (tone enum + agent input/output)
// §A11 PII guard: .strict() rejects extra fields (resume_text / candidate_email / etc.)
export const ObserverToneSchema = z.enum(["support", "alert", "pivot"]);
export type ObserverTone = z.infer<typeof ObserverToneSchema>;

export const ObserverAgentInputSchema = z
  .object({
    turn_index: z.number().int().nonnegative(),
    question: z.string(),
    answer: z.string(),
    remaining_minutes: z.number().int().nullable().optional(),
    long_term_summary: z.string().nullable().optional(),
  })
  .strict();
export type ObserverAgentInput = z.infer<typeof ObserverAgentInputSchema>;

export const ObserverAgentOutputSchema = z
  .object({
    observation: z.string().min(1).max(60),
    tone: ObserverToneSchema,
    actionable: z.boolean(),
  })
  .strict();
export type ObserverAgentOutput = z.infer<typeof ObserverAgentOutputSchema>;

// M3.3.1: Interviewer Agent contract schemas
// §A11 PII guard: .strict() rejects extra fields (resume_text / candidate_email / etc.)

export const TurnAssessmentSchema = z
  .object({
    summary: z.string(),
    strengths: z.array(z.string()).default([]),
    weaknesses: z.array(z.string()).default([]),
  })
  .strict();
export type TurnAssessment = z.infer<typeof TurnAssessmentSchema>;

export const TurnAssessmentSnippetSchema = z
  .object({ summary: z.string() })
  .strict();
export type TurnAssessmentSnippet = z.infer<typeof TurnAssessmentSnippetSchema>;

export const TurnRecordSchema = z
  .object({
    question: z.string(),
    answer: z.string(),
    assessment: TurnAssessmentSnippetSchema.nullable().optional(),
  })
  .strict();
export type TurnRecord = z.infer<typeof TurnRecordSchema>;

export const InterviewerAgentInputSchema = z
  .object({
    framework_json: z.string(),
    recent_turns: z.array(TurnRecordSchema),
    long_term_summary: z.string().nullable().optional(),
    remaining_minutes: z.number().int().nullable().optional(),
    /** M8.6 修复:Q0/Q1/Q2 用空 recent_turns,LLM 看不到差异会重复出"自我介绍"。
     * 传入目标 turn_index,prompt 按 idx 给不同开场 hint 强制题目分化。 */
    target_turn_index: z.number().int().nonnegative().optional(),
  })
  .strict();
export type InterviewerAgentInput = z.infer<typeof InterviewerAgentInputSchema>;

export const InterviewerAgentOutputSchema = z
  .object({
    question: z.string(),
    intent: z.string(),
    expected_depth: z.enum(["surface", "tactical", "strategic"]),
    followup_hint: z.string().nullable().optional(),
    should_end: z.boolean().default(false),
    followup_hints: z
      .array(z.string().max(8))
      .max(3)
      .refine(
        (arr) => arr.length === 0 || (arr.length >= 2 && arr.length <= 3),
        { message: "followup_hints must be empty or 2-3 items" },
      )
      .default([]),
    live_observation: z.string().max(30).nullable().optional(),
  })
  .strict();
export type InterviewerAgentOutput = z.infer<typeof InterviewerAgentOutputSchema>;
