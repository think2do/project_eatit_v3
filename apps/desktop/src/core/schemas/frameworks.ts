import { z } from "zod";

// ===== v3.1 Interview enums (StrEnum — L0 forbids deletion of any value) =====

/**
 * Mirror of Python InterviewStyle (StrEnum v3.1).
 * 3 values; L0 lock — deletion forbidden per §L0.
 */
export const InterviewStyleSchema = z.enum([
  "friendly_guided",
  "standard_professional",
  "high_pressure_followup",
]);

export type InterviewStyle = z.infer<typeof InterviewStyleSchema>;

/**
 * Mirror of Python InterviewDirection (StrEnum v3.1).
 * 3 values; L0 lock — deletion forbidden per §L0.
 */
export const InterviewDirectionSchema = z.enum([
  "role_match",
  "project_deep_dive",
  "behavioral_comprehensive",
]);

export type InterviewDirection = z.infer<typeof InterviewDirectionSchema>;

// ===== v3.2 Interview Literal types =====

/**
 * Mirror of Python InterviewStyleV32 (Literal).
 * 4 values introduced in v3.2.
 */
export const InterviewStyleV32Schema = z.enum([
  "structured",
  "pressure",
  "friendly",
  "expert",
]);

export type InterviewStyleV32 = z.infer<typeof InterviewStyleV32Schema>;

/**
 * Mirror of Python InterviewDirectionV32 (Literal).
 * 6 values introduced in v3.2.
 */
export const InterviewDirectionV32Schema = z.enum([
  "ai-insight",
  "data-driven",
  "cross-func",
  "zero-to-one",
  "user-research",
  "strategy",
]);

export type InterviewDirectionV32 = z.infer<typeof InterviewDirectionV32Schema>;

/**
 * Mirror of Python InterviewDurationV32 = Literal[15, 30, 45, 60].
 */
export const InterviewDurationV32Schema = z.union([
  z.literal(15),
  z.literal(30),
  z.literal(45),
  z.literal(60),
]);

export type InterviewDurationV32 = z.infer<typeof InterviewDurationV32Schema>;

// ===== frameworks.py schemas =====

/**
 * Mirror of Python FrameworkStage(SchemaModel).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const FrameworkStageSchema = z
  .object({
    name: z.string(),
    goal: z.string(),
    question_budget: z.number().int().min(1),
  })
  .strict();

export type FrameworkStage = z.infer<typeof FrameworkStageSchema>;

/**
 * Mirror of Python DirectionFramework(SchemaModel).
 * style: InterviewStyleV32 | InterviewStyle (union v3.2 + v3.1).
 * direction: InterviewDirectionV32 | InterviewDirection (union v3.2 + v3.1).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const DirectionFrameworkSchema = z
  .object({
    style: z.union([InterviewStyleV32Schema, InterviewStyleSchema]),
    direction: z.union([InterviewDirectionV32Schema, InterviewDirectionSchema]),
    duration_minutes: z.number().int().min(1),
    stages: z.array(FrameworkStageSchema),
    focus_points: z.array(z.string()),
    risk_points: z.array(z.string()),
  })
  .strict();

export type DirectionFramework = z.infer<typeof DirectionFrameworkSchema>;

// ===== agents/framework/schemas.py — PredictedQuestion subset =====

/**
 * Mirror of Python PredictedCategory (Literal).
 */
export const PredictedCategorySchema = z.enum([
  "company-business",
  "industry-judgment",
  "project-deepdive",
  "general-pm",
]);

export type PredictedCategory = z.infer<typeof PredictedCategorySchema>;

/**
 * Mirror of Python PredictedSource (Literal).
 */
export const PredictedSourceSchema = z.enum(["jd", "resume", "research"]);

export type PredictedSource = z.infer<typeof PredictedSourceSchema>;

/**
 * Mirror of Python PredictedQuestion(SchemaModel).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const PredictedQuestionSchema = z
  .object({
    category: PredictedCategorySchema,
    question: z.string().max(200),
    why_likely: z.string().max(80),
    related_evidence: z.string().max(120),
  })
  .strict();

export type PredictedQuestion = z.infer<typeof PredictedQuestionSchema>;

/**
 * Mirror of Python PredictedQuestionBank(SchemaModel).
 * ★ L0 LOCK ★: questions length 8-15 per architect spec line 1486.
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const PredictedQuestionBankSchema = z
  .object({
    questions: z.array(PredictedQuestionSchema).min(8).max(15), // ★ 8-15 lock per architect §spec line 1486 ★
    generated_at: z.string().datetime(), // ISO datetime per common.ts pattern
    sources: z.array(PredictedSourceSchema).min(1),
  })
  .strict();

export type PredictedQuestionBank = z.infer<typeof PredictedQuestionBankSchema>;

// ===== agents/framework/schemas.py — FrameworkAgent v3.4 (M3.3.2.dev.a) =====
// §A11 PII guard: all schemas below use .strict() — unknown fields are rejected at every level.
// §L0 #14: predicted_questions 8-15 lock is enforced in PredictedQuestionBankSchema above (consumed here).
// §C3: No secret access; schemas are data-shape contracts only.

/**
 * Mirror of Python FrameworkConfigInput(BaseModel).
 * .strict() rejects any extra field at the nested config level (§A11).
 */
export const FrameworkConfigInputSchema = z
  .object({
    level: z.string(),
    style: z.string(),
    duration_minutes: z.number().int().min(1),
  })
  .strict();
export type FrameworkConfigInput = z.infer<typeof FrameworkConfigInputSchema>;

/**
 * Mirror of Python FrameworkAgentInput(BaseModel).
 * research_payload_json mirrors Python `str | None = None` (F-321 — None when Research unavailable).
 * .strict() at both outer and nested config level (§A11 nested .strict()).
 */
export const FrameworkAgentInputSchema = z
  .object({
    parse_payload_json: z.string(),
    config: FrameworkConfigInputSchema,
    research_payload_json: z.string().nullable().optional(),
  })
  .strict();
export type FrameworkAgentInput = z.infer<typeof FrameworkAgentInputSchema>;

/**
 * Mirror of Python FocusCompetency(BaseModel).
 * .strict() enforces no extra fields (§A11).
 */
export const FocusCompetencySchema = z
  .object({ title: z.string(), why: z.string(), probe_hint: z.string() })
  .strict();

/**
 * Mirror of Python DeepDiveAnchor(BaseModel).
 * .strict() enforces no extra fields (§A11).
 */
export const DeepDiveAnchorSchema = z
  .object({ anchor: z.string(), probe_chain: z.array(z.string()) })
  .strict();

/**
 * Mirror of Python PaceSegment(BaseModel).
 * rough_minutes ge=1 per Python Field constraint.
 * .strict() enforces no extra fields (§A11).
 */
export const PaceSegmentSchema = z
  .object({ name: z.string(), rough_minutes: z.number().int().min(1), goal: z.string() })
  .strict();

/**
 * Mirror of Python PacePlan(BaseModel).
 * total_minutes ge=1 per Python Field constraint.
 * .strict() enforces no extra fields (§A11).
 */
export const PacePlanSchema = z
  .object({
    total_minutes: z.number().int().min(1),
    segments: z.array(PaceSegmentSchema),
  })
  .strict();

export type FocusCompetency = z.infer<typeof FocusCompetencySchema>;
export type DeepDiveAnchor = z.infer<typeof DeepDiveAnchorSchema>;
export type PaceSegment = z.infer<typeof PaceSegmentSchema>;
export type PacePlan = z.infer<typeof PacePlanSchema>;

/**
 * Mirror of Python FrameworkAgentOutput(BaseModel).
 * direction: 4-value enum lock (§L0 direction 4-value lock).
 * predicted_questions: nullable/optional — null is legitimate "no bank" case.
 * .strict() enforces no extra fields (§A11).
 */
export const FrameworkAgentOutputSchema = z
  .object({
    direction: z.enum(["project_deep_dive", "competency_probe", "culture_fit", "hybrid"]),
    focus_competencies: z.array(FocusCompetencySchema),
    opening_questions: z.array(z.string()),
    deep_dive_anchors: z.array(DeepDiveAnchorSchema),
    pace_plan: PacePlanSchema,
    predicted_questions: PredictedQuestionBankSchema.nullable().optional(),
  })
  .strict();
export type FrameworkAgentOutput = z.infer<typeof FrameworkAgentOutputSchema>;
