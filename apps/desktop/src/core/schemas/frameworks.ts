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
