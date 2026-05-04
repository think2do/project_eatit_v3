import { z } from "zod";

// ===== reflection/schemas.py enums =====

export const ReflectionStatusSchema = z.enum([
  "pending",
  "running",
  "ok",
  "failed",
]);

export type ReflectionStatus = z.infer<typeof ReflectionStatusSchema>;

// ===== reflection/schemas.py models =====

export const PerQuestionCoachingSchema = z
  .object({
    turn_index: z.number().int().min(0),
    question: z.string().max(300),
    your_answer_summary: z.string().max(300),
    diagnosis: z.string().max(300),
    model_answer_outline: z.array(z.string()).min(2).max(5),
    key_phrases_to_use: z.array(z.string()).min(2).max(5),
    mistakes_to_avoid: z.array(z.string()).min(1).max(4),
    recommended_resources: z.array(z.string()).max(3).default([]),
  })
  .strict();

export type PerQuestionCoaching = z.infer<typeof PerQuestionCoachingSchema>;

export const DialogueTurnSchema = z
  .object({
    role: z.enum(["interviewer", "candidate"]),
    text: z.string().max(200),
  })
  .strict();

export type DialogueTurn = z.infer<typeof DialogueTurnSchema>;

export const ReflectionReportSchema = z
  .object({
    report_id: z.string().min(1),
    session_id: z.string().min(1),
    executive_summary: z.string().max(400),
    per_question_coaching: z.array(PerQuestionCoachingSchema).default([]),
    general_growth_advice: z.string().max(300),
    mock_followup_dialogue: z.array(DialogueTurnSchema).max(12).default([]),
    generated_at: z.string().datetime(),
    status: ReflectionStatusSchema.default("ok"),
  })
  .strict();

export type ReflectionReport = z.infer<typeof ReflectionReportSchema>;

/**
 * ★ L0 A11 PRIVACY GUARD ★
 * Mirror of Python ReflectionAgentInput with extra="forbid".
 * .strict() rejects ANY unknown field including PII fields.
 * Only 6 fields allowed: session_id / report_id / report_payload /
 * turns / parse_payload / research_payload.
 */
export const ReflectionAgentInputSchema = z
  .object({
    session_id: z.string().min(1),
    report_id: z.string().min(1),
    report_payload: z.record(z.unknown()),
    turns: z.array(z.record(z.unknown())).max(30).default([]),
    parse_payload: z.record(z.unknown()).nullable().optional(),
    research_payload: z.record(z.unknown()).nullable().optional(),
  })
  .strict();

export type ReflectionAgentInput = z.infer<typeof ReflectionAgentInputSchema>;

// ReflectionAgentOutput is identical to ReflectionReport (Pydantic: class ReflectionAgentOutput(ReflectionReport): pass)
export const ReflectionAgentOutputSchema = ReflectionReportSchema;

export type ReflectionAgentOutput = z.infer<typeof ReflectionAgentOutputSchema>;

// LLM-output slice; metadata fields server-stamped
export const _LLMReflectionOutputSchema = z
  .object({
    executive_summary: z.string().max(400),
    per_question_coaching: z.array(PerQuestionCoachingSchema).default([]),
    general_growth_advice: z.string().max(300),
    mock_followup_dialogue: z.array(DialogueTurnSchema).max(12).default([]),
  })
  .strict();

export type _LLMReflectionOutput = z.infer<typeof _LLMReflectionOutputSchema>;
