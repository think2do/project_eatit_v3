import { z } from "zod";

// ===== research/schemas.py enums =====

export const SignalTypeSchema = z.enum([
  "funding",
  "product",
  "personnel",
  "market",
  "regulation",
]);

export type SignalType = z.infer<typeof SignalTypeSchema>;

export const CompanyStageSchema = z.enum([
  "seed",
  "growth",
  "mature",
  "listed",
  "unknown",
]);

export type CompanyStage = z.infer<typeof CompanyStageSchema>;

export const ConfidenceSchema = z.enum(["high", "mid", "low"]);

export type Confidence = z.infer<typeof ConfidenceSchema>;

// ===== research/schemas.py models =====

export const SignalSchema = z
  .object({
    type: SignalTypeSchema,
    summary: z.string().max(200),
    occurred_at: z.string().datetime().nullable().optional(),
    source_url: z.string().nullable().optional(),
  })
  .strict();

export type Signal = z.infer<typeof SignalSchema>;

export const CompanyProfileSchema = z
  .object({
    name: z.string().max(80),
    business_model: z.string().max(200),
    stage: CompanyStageSchema,
    recent_signals: z.array(SignalSchema).max(8).default([]),
    evidence_links: z.array(z.string()).max(10).default([]),
    confidence: ConfidenceSchema,
  })
  .strict();

export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;

export const IndustryProfileSchema = z
  .object({
    name: z.string().max(60),
    landscape_summary: z.string().max(200),
    key_metrics: z.array(z.string()).min(3).max(6).default([]),
    typical_pain_points: z.array(z.string()).min(2).max(5).default([]),
    competitors_in_jd_ctx: z.array(z.string()).max(8).default([]),
  })
  .strict();

export type IndustryProfile = z.infer<typeof IndustryProfileSchema>;

/**
 * ★ L0 A11 PRIVACY GUARD ★
 * Mirror of Python ResearchAgentInput with extra="forbid".
 * .strict() rejects ANY unknown field including resume_text, candidate_email,
 * candidate_phone, 身份证号, address, etc.
 * Only 3 fields allowed: company_name / role_title / industry_hints.
 */
export const ResearchAgentInputSchema = z
  .object({
    company_name: z.string().min(1).max(80),
    role_title: z.string().min(1).max(80),
    industry_hints: z.array(z.string()).min(1).max(5),
  })
  .strict();

export type ResearchAgentInput = z.infer<typeof ResearchAgentInputSchema>;

export const ResearchAgentOutputSchema = z
  .object({
    company: CompanyProfileSchema,
    industry: IndustryProfileSchema,
    fetched_at: z.string().datetime(),
    cache_key: z.string().min(8).max(64),
    degraded: z.boolean().default(false),
    degraded_reason: z.string().nullable().optional(),
  })
  .strict();

export type ResearchAgentOutput = z.infer<typeof ResearchAgentOutputSchema>;
