// TODO M3.x: deps.logger interface unification across all agents

import {
  ReportAgentInputSchema,
  ReportAgentOutputSchema,
  type ReportAgentInput,
  type ReportAgentOutput,
} from "@/core/schemas/reports";
import type { LLMProvider, Message } from "@/core/llm/types";
import { getConfiguredModel } from "@/core/llm/configuredModel";
import { systemPrompt, userPrompt } from "./prompts";
import { applyReportSanitization } from "./sanitizers";

// §C3: No process.env / getApiKey / keychain access here. LLM calls go through deps.llm only.

export interface ReportAgentDeps {
  llm: LLMProvider;
}

/**
 * Run ReportAgent: validate input → build messages → generateObject → sanitize → return.
 *
 * §A11 PII defense:
 *   ReportAgentInputSchema.strict().parse(input) rejects ANY unknown field BEFORE LLM call.
 *   ZodError propagates cleanly — LLM is never called on dirty input.
 *
 * Post-LLM 4-step sanitization pipeline (applyReportSanitization):
 *   Step 1: coercePassLikelihood — map free-form → canonical 3-tier PassLikelihood
 *   Step 2: normalizeDimensions — pad to exactly 5 dims in canonical order
 *   Step 3: applyToneSanitization — sanitize forbidden tone words across all text fields
 *   Step 4: aiVerdictRegexScan — regex check on ai_verdict after tone sanitize
 *
 * §C3: no secret access; all LLM calls go through deps.llm (ArkProvider → Swift Bridge → Keychain).
 * L0-1: dimensions[].name locked to DimensionNameSchema 5 values (normalize_dimensions enforces).
 * L0-2: pass_likelihood coerced to PassLikelihoodSchema 3 tiers post-LLM.
 * L0-3: FORBIDDEN_TONE_WORDS sanitized across all text fields post-LLM.
 */
export async function runReportAgent(
  input: ReportAgentInput,
  deps: ReportAgentDeps,
): Promise<ReportAgentOutput> {
  // ★ L0 §A11: schema-level — .strict() rejects ANY unknown field BEFORE LLM call ★
  const validated = ReportAgentInputSchema.parse(input); // throws ZodError on PII

  const messages: Message[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: userPrompt(validated) },
  ];

  const rawOutput = await deps.llm.generateObject({
    schema: ReportAgentOutputSchema,
    messages,
    model: await getConfiguredModel(),
  });

  return applyReportSanitization(rawOutput);
}
