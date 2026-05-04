import {
  FORBIDDEN_TONE_WORDS,
  PassLikelihoodSchema,
  DimensionNameSchema,
  sanitizeTone,
  scanForbiddenTone,
  type PassLikelihood,
  type DimensionScore,
  type ReportAgentOutput,
} from "@/core/schemas/reports";

// §C3: No process.env / getApiKey / keychain access here. Sanitization only.

// ===== Logger interface (minimal, optional for production) =====

interface Logger {
  warn?(msg: string, meta?: Record<string, unknown>): void;
  info?(msg: string, meta?: Record<string, unknown>): void;
}

// ===== Step 1: coercePassLikelihood =====

/**
 * Map of LLM free-form pass_likelihood strings → canonical 3-tier values.
 * Mirrors Python domain/reports/service.py coerce_pass_likelihood + LITERAL_MAP (§7.4).
 */
export const LITERAL_PASS_LIKELIHOOD_MAP: Record<string, PassLikelihood> = {
  中上: "中上",
  高于中等: "中上",
  应该会过: "中上",
  倾向通过: "中上",
  较高概率通过: "中上",
  中: "中",
  持平: "中",
  中等: "中",
  不确定: "中",
  五五开: "中",
  中下: "中下",
  低于中等: "中下",
  倾向不通过: "中下",
  应该不会过: "中下",
  较低概率通过: "中下",
};

/**
 * Derive pass_likelihood from scores when raw value is unrecognizable.
 * Mirrors Python derive_pass_likelihood (domain/reports/service.py line 94-100).
 */
function derivePassLikelihood(overallScore: number | null | undefined): PassLikelihood {
  const o = overallScore ?? 0;
  if (o >= 80) return "中上";
  if (o >= 65) return "中";
  return "中下";
}

/**
 * Coerce LLM free-form pass_likelihood string to canonical 3-tier PassLikelihood.
 * Step 1 of applyReportSanitization pipeline.
 *
 * Priority order:
 *   1. LITERAL_MAP lookup (covers both verbatim and synonyms)
 *   2. Score-based fallback via derivePassLikelihood
 *
 * @param raw - Raw string from LLM (may be null/undefined/empty/unmapped)
 * @param overall_score - Overall score for fallback derivation
 * @param _matchScore - Unused; kept for API parity with Python signature
 * @param logger - Optional logger for WARN on illegal values
 */
export function coercePassLikelihood(
  raw: string | null | undefined,
  overall_score: number | null | undefined,
  _matchScore?: number | null,
  logger?: Logger,
): PassLikelihood {
  if (raw != null && raw !== "") {
    const mapped = LITERAL_PASS_LIKELIHOOD_MAP[raw];
    if (mapped != null) {
      return mapped;
    }
  }

  // Score-based fallback
  const derived = derivePassLikelihood(overall_score);
  if (raw != null && raw !== "") {
    // Only warn when there was a non-empty unmapped value
    logger?.warn?.("pass_likelihood_illegal_value", { raw, derived, overall_score });
  }
  return derived;
}

// ===== Step 2: normalizeDimensions =====

/**
 * Canonical 5-dimension order.
 * ★ L0-1 LOCK ★ — do NOT reorder or rename these values.
 * Mirrors Python DEFAULT_DIMENSION_NAMES (domain/reports/service.py line 104).
 */
export const DEFAULT_DIMENSION_NAMES = [
  "专业深度",
  "结构化表达",
  "批判性思考",
  "业务直觉",
  "沟通节奏",
] as const;

/**
 * Normalize dimensions array to exactly 5 items in canonical order.
 * Missing dimensions are padded with a neutral placeholder (score=50).
 * Step 2 of applyReportSanitization pipeline.
 *
 * Mirrors Python normalize_dimensions (domain/reports/service.py line 104-120).
 */
export function normalizeDimensions(
  dims: DimensionScore[],
  logger?: Logger,
): DimensionScore[] {
  const byName = new Map<string, DimensionScore>(dims.map((d) => [d.name, d]));
  return DEFAULT_DIMENSION_NAMES.map((name) => {
    const existing = byName.get(name);
    if (existing != null) return existing;
    logger?.warn?.("dimension_missing_padded", { name });
    return {
      name: DimensionNameSchema.parse(name),
      description: "评分异常,默认中性",
      score: 50,
      evidence_chips: [{ text: "数据不足", good: false }],
    } satisfies DimensionScore;
  });
}

// ===== Step 3: applyToneSanitization =====

/**
 * Apply sanitizeTone to all text fields in the ReportAgentOutput.
 * Each field has a prescribed fallback string (spec §7.4 table).
 * Step 3 of applyReportSanitization pipeline.
 */
export function applyToneSanitization(
  output: ReportAgentOutput,
  logger?: Logger,
): ReportAgentOutput {
  function sanitize(text: string, fallback: string, field: string): string {
    const hits = scanForbiddenTone(text);
    if (hits.length > 0) {
      logger?.warn?.("report_tone_violation", { field, forbidden_hits: hits });
    }
    return sanitizeTone(text, fallback);
  }

  const summary = sanitize(
    output.summary,
    "本场表现已综合记录,建议查看维度评分了解细节",
    "summary",
  );

  const next_actions = output.next_actions.map((action, i) =>
    sanitize(action, "建议针对薄弱维度做专项训练", `next_actions[${i}]`),
  );

  const ai_verdict =
    output.ai_verdict != null
      ? sanitize(output.ai_verdict, "请教练查看维度评分综合评估", "ai_verdict")
      : output.ai_verdict;

  const reasons = output.reasons.map((r, i) => ({
    ...r,
    quote: sanitize(r.quote, "(评估证据已记录)", `reasons[${i}].quote`),
    aspect: sanitize(r.aspect, "综合表现", `reasons[${i}].aspect`),
  }));

  const dimensions = output.dimensions.map((d, i) => ({
    ...d,
    description: sanitize(d.description, "维度详情已记录", `dimensions[${i}].description`),
  }));

  const round_reviews_v2 = output.round_reviews_v2.map((rv, i) => ({
    ...rv,
    ai_feedback: sanitize(rv.ai_feedback, "建议参考维度评分", `round_reviews_v2[${i}].ai_feedback`),
    answer_summary: sanitize(rv.answer_summary, "已记录", `round_reviews_v2[${i}].answer_summary`),
  }));

  return {
    ...output,
    summary,
    next_actions,
    ai_verdict,
    reasons,
    dimensions,
    round_reviews_v2,
  };
}

// ===== Step 4: aiVerdictRegexScan =====

/**
 * Regex pattern for banned words in ai_verdict.
 * Applied AFTER sanitizeTone (step 3) to catch LLM outputs that slipped through.
 * Spec §7.4 Step 4.
 */
export const AI_VERDICT_BANNED_REGEX = /(差|失败|不及格|不行|不通过|垃圾|废物|拉胯|烂)/;

/**
 * Scan ai_verdict with banned regex; replace with fallback if matched.
 * Returns null if input is null, empty string if input is empty string.
 * Step 4 of applyReportSanitization pipeline.
 */
export function aiVerdictRegexScan(
  text: string | null | undefined,
  logger?: Logger,
): string | null {
  if (text == null || text === "") return text ?? null;
  if (AI_VERDICT_BANNED_REGEX.test(text)) {
    logger?.warn?.("ai_verdict_regex_match", {
      matched_pattern: AI_VERDICT_BANNED_REGEX.source,
      original_text_length: text.length,
    });
    return "请教练查看维度评分综合评估";
  }
  return text;
}

// ===== applyReportSanitization: orchestrates 4 steps =====

/**
 * Apply the full 4-step post-LLM sanitization pipeline to a raw ReportAgentOutput.
 *
 * Step 1: coercePassLikelihood — map free-form pass_likelihood → canonical 3-tier
 * Step 2: normalizeDimensions — pad dimensions to exactly 5 in canonical order
 * Step 3: applyToneSanitization — sanitize forbidden tone words across all text fields
 * Step 4: aiVerdictRegexScan — regex check on ai_verdict after tone sanitize
 *
 * Mirrors Python domain/reports/service.py post-LLM logic (line 88-182).
 */
export function applyReportSanitization(
  raw: ReportAgentOutput,
  logger?: Logger,
): ReportAgentOutput {
  // Step 1: coerce pass_likelihood
  const pass_likelihood = coercePassLikelihood(raw.pass_likelihood, raw.overall_score, undefined, logger);

  // Step 2: normalize dimensions
  const dimensions = normalizeDimensions(raw.dimensions, logger);

  // Step 3: tone sanitize all text fields (using normalized dimensions)
  const afterTone = applyToneSanitization({ ...raw, dimensions }, logger);

  // Step 4: regex scan on already-tone-sanitized ai_verdict
  const ai_verdict = aiVerdictRegexScan(afterTone.ai_verdict, logger);

  return {
    ...afterTone,
    pass_likelihood,
    ai_verdict,
  };
}
