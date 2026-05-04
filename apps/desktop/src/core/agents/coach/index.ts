// §C3: No process.env / getApiKey / keychain access here. LLM calls go through deps.llm only.

import {
  CoachAgentInputSchema,
  CoachAgentOutputSchema,
  _LLMCoachOutputSchema,
  type CoachAgentInput,
  type CoachAgentOutput,
  type _LLMCoachOutput,
} from "@/core/schemas/coach";
import { scanForbiddenTone, sanitizeTone } from "@/core/schemas/reports";
import type { LLMProvider, Message } from "@/core/llm/types";
import { systemPrompt, userPrompt } from "./prompts";

// ===== Verbatim fallback strings (translated from Python coach/service.py line 52-58) =====

const HEADLINE_FALLBACK =
  "继续围绕薄弱维度做专项训练,保持现有节奏稳步累积";

const HEADLINE_DETAIL_FALLBACK =
  "近期面试展现出多个进步信号,建议在数据驱动与项目深度方向上巩固," +
  "针对易失分维度做 2-3 场专项训练。";

const WEAKNESS_FALLBACK = "可加强结构化表达";

const SIGNAL_FALLBACK = "保持目前的练习节奏";

// ===== Logger interface (minimal, optional — mirrors sanitizers.ts pattern) =====

interface Logger {
  info?(msg: string, meta?: Record<string, unknown>): void;
  warn?(msg: string, meta?: Record<string, unknown>): void;
}

export interface CoachAgentDeps {
  llm: LLMProvider;
  logger?: Logger;
}

// ===== Inline sanitize helper (mirrors Python sanitize_output, line 84-106) =====

/**
 * Sanitize one text field and emit WARN log on tone violation.
 * WARN log key: "coach_tone_violation" + { field, forbidden_hits }
 * (Verbatim from Python coach/service.py line 78.)
 */
function sanitizeField(
  text: string,
  fallback: string,
  field: string,
  logger?: Logger,
): string {
  const hits = scanForbiddenTone(text);
  if (hits.length > 0) {
    logger?.warn?.("coach_tone_violation", { field, forbidden_hits: hits });
  }
  return sanitizeTone(text, fallback);
}

/**
 * Apply tone sanitization to the 4 text fields of _LLMCoachOutput.
 * next_focus_areas is NOT sanitized — already enum-locked by _LLMCoachOutputSchema.
 * Mirrors Python sanitize_output (coach/service.py line 84-106) verbatim.
 */
function sanitizeOutput(llmOut: _LLMCoachOutput, logger?: Logger): _LLMCoachOutput {
  return {
    headline: sanitizeField(llmOut.headline, HEADLINE_FALLBACK, "headline", logger),
    headline_detail: sanitizeField(
      llmOut.headline_detail,
      HEADLINE_DETAIL_FALLBACK,
      "headline_detail",
      logger,
    ),
    recurring_weaknesses: llmOut.recurring_weaknesses.map((w) =>
      sanitizeField(w, WEAKNESS_FALLBACK, "recurring_weaknesses", logger),
    ),
    improvement_signals: llmOut.improvement_signals.map((s) =>
      sanitizeField(s, SIGNAL_FALLBACK, "improvement_signals", logger),
    ),
    next_focus_areas: llmOut.next_focus_areas, // NOT sanitized — already enum-locked
  };
}

// ===== runCoachAgent =====

/**
 * Run CoachAgent: validate input → audit log → build messages → generateObject
 *   → sanitize 4 text fields → server-stamp metadata → return CoachAgentOutput.
 *
 * §A11 PII defense:
 *   CoachAgentInputSchema.strict().parse(input) rejects ANY unknown field BEFORE LLM call.
 *   ZodError propagates cleanly — LLM is never called on dirty input.
 *   5 allowed fields: user_id / based_on_session_count / based_on_last_session_id /
 *   recent_reports / candidate_profile.
 *
 * L0 条款 12 教学护栏:
 *   sanitizeOutput applies sanitizeTone to 4 text fields with prescribed fallbacks.
 *   next_focus_areas passes through unchanged (enum-locked at schema level).
 *
 * §C3: no secret access; all LLM calls go through deps.llm only.
 */
export async function runCoachAgent(
  input: CoachAgentInput,
  deps: CoachAgentDeps,
): Promise<CoachAgentOutput> {
  // ★ L0 §A11: .strict() rejects ANY unknown field BEFORE LLM call ★
  const validated = CoachAgentInputSchema.parse(input); // throws ZodError on PII

  // Audit log — NEVER log user_id plaintext or recent_reports content
  deps.logger?.info?.("coach_request", {
    based_on_session_count: validated.based_on_session_count,
    has_candidate_profile:
      validated.candidate_profile !== null &&
      validated.candidate_profile !== undefined,
  });

  const messages: Message[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: userPrompt(validated) },
  ];

  const rawLLMOut = await deps.llm.generateObject({
    schema: _LLMCoachOutputSchema,
    messages,
    model: "doubao-seed-1-6-250615",
  });

  const sanitized = sanitizeOutput(rawLLMOut, deps.logger);

  // Server-stamp metadata + final schema validation
  return CoachAgentOutputSchema.parse({
    ...sanitized,
    user_id: validated.user_id,
    based_on_session_count: validated.based_on_session_count,
    based_on_last_session_id: validated.based_on_last_session_id,
    generated_at: new Date().toISOString(),
    status: "ok",
  });
}
