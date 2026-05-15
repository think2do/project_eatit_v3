// §C3: No process.env / getApiKey / keychain access here. LLM calls go through deps.llm only.

import {
  ReflectionAgentInputSchema,
  ReflectionAgentOutputSchema,
  _LLMReflectionOutputSchema,
  type ReflectionAgentInput,
  type ReflectionAgentOutput,
  type _LLMReflectionOutput,
  type PerQuestionCoaching,
  type DialogueTurn,
} from "@/core/schemas/reflection";
import { scanForbiddenTone, sanitizeTone } from "@/core/schemas/reports";
import type { LLMProvider, Message } from "@/core/llm/types";
import { getConfiguredModel } from "@/core/llm/configuredModel";
import { systemPrompt, userPrompt } from "./prompts";

// ===== Reflection-specific constants (not in core/schemas/reports.ts) =====

/**
 * Accusatory sentence-opening prefixes that must be rewritten to "建议下次注意:" form.
 * Verbatim from Python reflection/service.py line 59.
 * ★ Reflection-specific — NOT in core/schemas/reports.ts ★
 */
export const ACCUSATORY_PREFIXES = ["你犯", "你又", "你总", "你居然"] as const;

/**
 * Core terms from Report.ai_verdict that Reflection.diagnosis must not repeat verbatim.
 * Collisions are coerced to DIAGNOSIS_OVERLAP_FALLBACK.
 * Verbatim from Python reflection/service.py line 65-74.
 * ★ Reflection-specific — NOT in core/schemas/reports.ts ★
 */
export const AI_VERDICT_CORE_TERMS = [
  "结构不清晰",
  "缺乏逻辑",
  "偏离主题",
  "证据不足",
  "数据缺失",
  "表达冗长",
  "缺乏深度",
  "条理混乱",
] as const;

// ===== Verbatim fallback strings (translated from Python reflection/service.py line 77-87) =====

export const DIAGNOSIS_FALLBACK_PARTIAL = "可加强 STAR 框架的";

export const TEACHING_FALLBACK = "建议在下次回答中聚焦关键事实+一句结论";

export const EXEC_SUMMARY_FALLBACK =
  "建议围绕最薄弱的两个维度做一次专项练习," +
  "用 STAR 框架重做本场最得分项以巩固结构感。";

export const GROWTH_ADVICE_FALLBACK =
  "1) 用 STAR 框架重写本场最关键的 2 个回答;" +
  "2) 针对薄弱维度找 3 道相似题做即兴练习;" +
  "3) 在下次面试 24h 前再回看本份复盘。";

export const KEY_PHRASE_FALLBACK = "STAR 框架收尾";

export const DIALOGUE_FALLBACK = "(此句已根据教学语气护栏调整)";

// ===== Logger interface (minimal, optional — mirrors coach/index.ts pattern) =====

interface Logger {
  info?(msg: string, meta?: Record<string, unknown>): void;
  warn?(msg: string, meta?: Record<string, unknown>): void;
}

export interface ReflectionAgentDeps {
  llm: LLMProvider;
  logger?: Logger;
}

// ===== Inline sanitize helpers =====

/**
 * Sanitize one text field and emit WARN log on tone violation.
 * WARN log key: "reflection_tone_violation" + { field, forbidden_hits }
 * Verbatim from Python reflection/service.py line 94-102.
 */
function sanitizeField(
  text: string,
  fallback: string,
  field: string,
  logger?: Logger,
): string {
  const hits = scanForbiddenTone(text);
  if (hits.length > 0) {
    logger?.warn?.("reflection_tone_violation", { field, forbidden_hits: hits });
  }
  return sanitizeTone(text, fallback);
}

/**
 * Rewrite accusatory sentence openings to "建议下次注意:" form.
 * WARN log key: "reflection_accusatory_rewrite" + { prefix, len }
 * Verbatim from Python reflection/service.py line 105-121.
 *
 * Python lstrip strips leading: space, ASCII comma, fullwidth comma, fullwidth period.
 * TS equivalent uses replace with a regex stripping those chars from the start of the remainder string.
 *
 * Judgment call: "你犯了" strips "你犯" prefix and leaves "了..." — "了" is NOT in the strip set
 * because it is a regular Chinese character, not punctuation. Result: "建议下次注意:了..."
 * This matches Python behavior exactly (Python only strips ' ,。', not '了').
 */
export function rewriteAccusatoryToTeaching(text: string, logger?: Logger): string {
  for (const prefix of ACCUSATORY_PREFIXES) {
    if (text.startsWith(prefix)) {
      logger?.warn?.("reflection_accusatory_rewrite", { prefix, len: text.length });
      const remainder = text.slice(prefix.length).replace(/^[\s,,。、]*/, "");
      return `建议下次注意:${remainder}`;
    }
  }
  return text;
}

/**
 * Scan diagnosis text for collisions with AI_VERDICT_CORE_TERMS (and verbatim ai_verdict).
 * Returns array of matched terms. Empty array = clean.
 * Verbatim from Python reflection/service.py line 124-135.
 */
export function scanOverlapWithVerdict(
  text: string,
  ai_verdict: string | null | undefined,
): string[] {
  const hits: string[] = AI_VERDICT_CORE_TERMS.filter((t) => text.includes(t));
  if (ai_verdict) {
    for (const t of AI_VERDICT_CORE_TERMS) {
      if (ai_verdict.includes(t) && text.includes(t) && !hits.includes(t)) {
        hits.push(t);
      }
    }
  }
  return hits;
}

/**
 * 2-stage sanitization for per-question diagnosis:
 *   Stage 1: sanitize forbidden tone words → "可加强 STAR 框架的结构表达" fallback
 *   Stage 2: check overlap with ai_verdict core terms → "可加强 STAR 框架的STAR 收尾节奏" fallback
 * WARN log key: "reflection_overlap_with_report_verdict" + { turn_index, overlap_terms }
 * Verbatim from Python reflection/service.py line 138-150.
 */
export function sanitizeDiagnosis(
  text: string,
  ai_verdict: string | null | undefined,
  turn_index: number,
  logger?: Logger,
): string {
  // Stage 1: tone scan (uses its own WARN log via sanitizeField)
  const afterTone = sanitizeField(
    text,
    DIAGNOSIS_FALLBACK_PARTIAL + "结构表达",
    "diagnosis",
    logger,
  );
  // Stage 2: no-overlap check
  const overlap = scanOverlapWithVerdict(afterTone, ai_verdict);
  if (overlap.length > 0) {
    logger?.warn?.("reflection_overlap_with_report_verdict", {
      turn_index,
      overlap_terms: overlap,
    });
    return DIAGNOSIS_FALLBACK_PARTIAL + "STAR 收尾节奏";
  }
  return afterTone;
}

/**
 * Trim + deduplicate resource items, preserving original order.
 * Python regex check is permissive (no-op for Chinese) — omitted here.
 * Verbatim from Python reflection/service.py line 156-173.
 */
export function normalizeResources(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const s = item.trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * Apply full per-question coaching sanitization pipeline.
 * Mirrors Python sanitize_per_question (reflection/service.py line 176-201).
 *
 * mistakes_to_avoid gets DOUBLE PASS:
 *   (1) sanitizeTone: 12 forbidden words → TEACHING_FALLBACK
 *   (2) rewriteAccusatoryToTeaching: 4 prefixes → "建议下次注意:" prepend
 * Both passes are independent and sequential.
 */
export function sanitizePerQuestion(
  item: PerQuestionCoaching,
  ai_verdict: string | null | undefined,
  logger?: Logger,
): PerQuestionCoaching {
  return {
    turn_index: item.turn_index,
    question: item.question,
    your_answer_summary: item.your_answer_summary,
    diagnosis: sanitizeDiagnosis(item.diagnosis, ai_verdict, item.turn_index, logger),
    model_answer_outline: item.model_answer_outline.map((o) =>
      sanitizeField(o, TEACHING_FALLBACK, "model_answer_outline", logger),
    ),
    key_phrases_to_use: item.key_phrases_to_use.map((p) =>
      sanitizeField(p, KEY_PHRASE_FALLBACK, "key_phrases_to_use", logger),
    ),
    mistakes_to_avoid: item.mistakes_to_avoid.map((m) =>
      rewriteAccusatoryToTeaching(
        sanitizeField(m, TEACHING_FALLBACK, "mistakes_to_avoid", logger),
        logger,
      ),
    ),
    recommended_resources: normalizeResources(item.recommended_resources),
  };
}

/**
 * Top-level sanitization: apply tone + per-question + dialogue sanitization.
 * Mirrors Python sanitize_output (reflection/service.py line 204-233).
 *
 * Sanitized fields (7 total):
 *   1. executive_summary → EXEC_SUMMARY_FALLBACK
 *   2. per_question_coaching[].diagnosis → DIAGNOSIS_FALLBACK_PARTIAL + "结构表达" (tone) / + "STAR 收尾节奏" (overlap)
 *   3. per_question_coaching[].model_answer_outline[] → TEACHING_FALLBACK
 *   4. per_question_coaching[].key_phrases_to_use[] → KEY_PHRASE_FALLBACK
 *   5. per_question_coaching[].mistakes_to_avoid[] → TEACHING_FALLBACK (then accusatory rewrite)
 *   6. general_growth_advice → GROWTH_ADVICE_FALLBACK
 *   7. mock_followup_dialogue[].text → DIALOGUE_FALLBACK
 */
export function sanitizeOutput(
  llm: _LLMReflectionOutput,
  ai_verdict: string | null | undefined,
  logger?: Logger,
): _LLMReflectionOutput {
  return {
    executive_summary: sanitizeField(
      llm.executive_summary,
      EXEC_SUMMARY_FALLBACK,
      "executive_summary",
      logger,
    ),
    per_question_coaching: llm.per_question_coaching.map((c) =>
      sanitizePerQuestion(c, ai_verdict, logger),
    ),
    general_growth_advice: sanitizeField(
      llm.general_growth_advice,
      GROWTH_ADVICE_FALLBACK,
      "general_growth_advice",
      logger,
    ),
    mock_followup_dialogue: llm.mock_followup_dialogue.map(
      (t): DialogueTurn => ({
        role: t.role,
        text: sanitizeField(t.text, DIALOGUE_FALLBACK, "mock_followup_dialogue", logger),
      }),
    ),
  };
}

// ===== runReflectionAgent =====

/**
 * Run ReflectionAgent: validate input → audit log → build messages → generateObject
 *   → sanitizeOutput (4-step pipeline) → server-stamp metadata → return ReflectionAgentOutput.
 *
 * §A11 PII defense:
 *   ReflectionAgentInputSchema.strict().parse(input) rejects ANY unknown field BEFORE LLM call.
 *   ZodError propagates cleanly — LLM is never called on dirty input.
 *   6 allowed fields: session_id / report_id / report_payload / turns /
 *   parse_payload / research_payload.
 *
 * L0 条款 12 教学护栏:
 *   sanitizeOutput applies sanitizeField to 7 text fields with prescribed fallbacks.
 *   mistakes_to_avoid gets double pass: tone sanitize + accusatory rewrite.
 *
 * L0 条款 12 no-overlap:
 *   sanitizeDiagnosis checks diagnosis against AI_VERDICT_CORE_TERMS + input.report_payload.ai_verdict.
 *   Collisions coerce to "可加强 STAR 框架的STAR 收尾节奏".
 *
 * §C3: no secret access; all LLM calls go through deps.llm only.
 */
export async function runReflectionAgent(
  input: ReflectionAgentInput,
  deps: ReflectionAgentDeps,
): Promise<ReflectionAgentOutput> {
  // ★ L0 §A11: .strict() rejects ANY unknown field BEFORE LLM call ★
  const validated = ReflectionAgentInputSchema.parse(input); // throws ZodError on PII

  // Extract ai_verdict from report_payload (verbatim Python lines 242-248)
  const rawVerdict =
    validated.report_payload != null
      ? (validated.report_payload as Record<string, unknown>)["ai_verdict"]
      : null;
  const ai_verdict: string | null =
    typeof rawVerdict === "string" ? rawVerdict : null;

  // Audit log — NEVER log report_payload content or turns content (§A11)
  deps.logger?.info?.("reflection_request", {
    session_id: validated.session_id,
    turn_count: validated.turns.length,
    has_research: validated.research_payload != null,
  });

  const messages: Message[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: userPrompt(validated) },
  ];

  const rawLLMOut = await deps.llm.generateObject({
    schema: _LLMReflectionOutputSchema,
    messages,
    model: await getConfiguredModel(),
  });

  const sanitized = sanitizeOutput(rawLLMOut, ai_verdict, deps.logger);

  // Server-stamp metadata + final schema validation
  return ReflectionAgentOutputSchema.parse({
    ...sanitized,
    report_id: validated.report_id,
    session_id: validated.session_id,
    generated_at: new Date().toISOString(),
    status: "ok",
  });
}
