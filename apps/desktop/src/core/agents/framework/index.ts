import {
  FrameworkAgentInputSchema,
  FrameworkAgentOutputSchema,
  type FrameworkAgentInput,
  type FrameworkAgentOutput,
} from "@/core/schemas/frameworks";
import type { LLMProvider, Message } from "@/core/llm/types";
import { systemPrompt, userPrompt } from "./prompts";

// §C3: No process.env / getApiKey / keychain access here. LLM calls go through deps.llm only.

export interface FrameworkAgentDeps {
  llm: LLMProvider;
}

/**
 * Run FrameworkAgent: validate input → build messages → generateObject → return.
 * No timeout (Python service.py has no asyncio.wait_for) — plain LLM call.
 *
 * §C3: no secret access; LLM call goes through deps.llm.
 * §A11: FrameworkAgentInputSchema.strict() rejects extra PII fields.
 *       FrameworkConfigInputSchema.strict() nested — independently rejects unknown fields.
 * §L0 #14: predicted_questions 8-15 lock enforced by FrameworkAgentOutputSchema
 *           (consumes PredictedQuestionBankSchema.questions.min(8).max(15)).
 */
export async function runFrameworkAgent(
  input: FrameworkAgentInput,
  deps: FrameworkAgentDeps,
): Promise<FrameworkAgentOutput> {
  const validated = FrameworkAgentInputSchema.parse(input);

  const messages: Message[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: userPrompt(validated) },
  ];

  return deps.llm.generateObject({
    schema: FrameworkAgentOutputSchema,
    messages,
    model: "doubao-seed-1-6-250615",
  });
}
