import {
  MetaReportAgentInputSchema,
  MetaReportAgentOutputSchema,
  type MetaReportAgentInput,
  type MetaReportAgentOutput,
} from "@/core/schemas/meta-report";
import type { LLMProvider, Message } from "@/core/llm/types";
import { systemPrompt, userPrompt } from "./prompts";

// §C3 / §A0.4: No process.env / getApiKey / keychain access here. LLM calls go through deps.llm only.

export interface MetaReportAgentDeps {
  llm: LLMProvider;
}

/**
 * Run MetaReportAgent: validate input → build messages → generateObject → return.
 *
 * §A11 PII defense:
 *   MetaReportAgentInputSchema.strict().parse(input) rejects ANY unknown field BEFORE LLM call.
 *   Nested MetaReportAgentSessionInputSchema is also .strict() — nested PII fields are blocked.
 *   ZodError propagates cleanly — LLM is never called on dirty input.
 *
 * §C3: no secret access; all LLM calls go through deps.llm (ArkProvider → Swift Bridge → Keychain).
 */
export async function runMetaReportAgent(
  input: MetaReportAgentInput,
  deps: MetaReportAgentDeps,
): Promise<MetaReportAgentOutput> {
  // ★ L0 §A11: schema-level — .strict() rejects ANY unknown field BEFORE LLM call ★
  const validated = MetaReportAgentInputSchema.parse(input);

  const messages: Message[] = [
    { role: "system", content: systemPrompt(validated.sessions.length) },
    { role: "user", content: userPrompt(validated) },
  ];

  return await deps.llm.generateObject({
    schema: MetaReportAgentOutputSchema,
    messages,
    model: "doubao-seed-1-6-250615",
  });
}
