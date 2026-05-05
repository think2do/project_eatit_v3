import { z } from "zod";

// ===== MetaReportAgent I/O schemas =====
// §A11 PII guard: ALL object schemas use .strict() to reject unknown fields BEFORE LLM call.
// Mirrors Python apps/api/app/agents/meta_report/schemas.py

/**
 * 4-tier verdict enum (mirrors shared-types MetaReportVerdict).
 * weak < mixed < solid < strong — used for improvement_signals rank validation.
 */
export const MetaReportVerdictSchema = z.enum(["weak", "mixed", "solid", "strong"]);
export type MetaReportVerdict = z.infer<typeof MetaReportVerdictSchema>;

/**
 * Numeric rank map for verdict ordering — used in .refine() below.
 * Exported for use in tests.
 */
export const VERDICT_RANK: Record<MetaReportVerdict, number> = {
  weak: 0,
  mixed: 1,
  solid: 2,
  strong: 3,
};

// ===== Input schemas =====

/**
 * One interview session's data passed to MetaReportAgent.
 * config_snapshot_json and report_payload_json are JSON-stringified strings
 * (read from SQLite TEXT columns). userPrompt() parses them back for LLM readability.
 * ★ §A11: .strict() rejects any extra field before LLM call ★
 */
export const MetaReportAgentSessionInputSchema = z
  .object({
    session_id: z.string().min(1),
    session_created_at: z.string().datetime(),
    config_snapshot_json: z.string(),
    report_payload_json: z.string(),
  })
  .strict();

export type MetaReportAgentSessionInput = z.infer<
  typeof MetaReportAgentSessionInputSchema
>;

/**
 * Top-level input to MetaReportAgent.
 * sessions: at least 1 session required.
 * ★ §A11: .strict() rejects any extra field before LLM call ★
 */
export const MetaReportAgentInputSchema = z
  .object({
    sessions: z.array(MetaReportAgentSessionInputSchema).min(1),
  })
  .strict();

export type MetaReportAgentInput = z.infer<typeof MetaReportAgentInputSchema>;

// ===== Output sub-schemas =====

/**
 * One recurring weakness across multiple sessions.
 * occurrence_count must be ≥ 2 (single session cannot constitute "recurring").
 * ★ §A11: .strict() ★
 */
export const RecurringWeaknessSchema = z
  .object({
    aspect: z.string(),
    occurrence_count: z.number().int().min(2),
    session_ids: z.array(z.string()),
    evidence_quotes: z.array(z.string()),
  })
  .strict();

export type RecurringWeakness = z.infer<typeof RecurringWeaknessSchema>;

/**
 * One improvement signal: same aspect improved from an earlier session to a later one.
 * .refine() enforces strict verdict rank progression (weak < mixed < solid < strong).
 * Non-strict (same rank) is also rejected.
 * ★ §A11: .strict() on the base object ★
 */
export const ImprovementSignalSchema = z
  .object({
    aspect: z.string(),
    from_verdict: MetaReportVerdictSchema,
    to_verdict: MetaReportVerdictSchema,
    earlier_session_id: z.string(),
    later_session_id: z.string(),
  })
  .strict()
  .refine(
    (s) => VERDICT_RANK[s.to_verdict] > VERDICT_RANK[s.from_verdict],
    { message: "to_verdict must be strictly higher rank than from_verdict" },
  );

export type ImprovementSignal = z.infer<typeof ImprovementSignalSchema>;

/**
 * One point in the pass_probability time series.
 * pass_probability is taken verbatim from the source report (0–100 integer).
 * ★ §A11: .strict() ★
 */
export const PassProbabilityPointSchema = z
  .object({
    session_id: z.string(),
    session_created_at: z.string(),
    pass_probability: z.number().int().min(0).max(100),
  })
  .strict();

export type PassProbabilityPoint = z.infer<typeof PassProbabilityPointSchema>;

/**
 * One next-focus area recommended for the candidate.
 * ★ §A11: .strict() ★
 */
export const NextFocusAreaSchema = z
  .object({
    aspect: z.string(),
    reason: z.string(),
    suggested_prep: z.string(),
  })
  .strict();

export type NextFocusArea = z.infer<typeof NextFocusAreaSchema>;

// ===== Output schema =====

/**
 * Full output of MetaReportAgent.
 * ★ §A11: .strict() rejects any LLM hallucinated extra fields ★
 */
export const MetaReportAgentOutputSchema = z
  .object({
    overall_trend_summary: z.string(),
    recurring_weaknesses: z.array(RecurringWeaknessSchema),
    improvement_signals: z.array(ImprovementSignalSchema),
    pass_probability_series: z.array(PassProbabilityPointSchema),
    next_focus_areas: z.array(NextFocusAreaSchema),
  })
  .strict();

export type MetaReportAgentOutput = z.infer<typeof MetaReportAgentOutputSchema>;
