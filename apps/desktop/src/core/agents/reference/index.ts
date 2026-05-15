import {
  ReferenceAgentInputSchema,
  ReferenceAgentOutputSchema,
  type ReferenceAgentInput,
  type ReferenceAgentOutput,
} from "@/core/schemas/turns";
import type { LLMProvider, Message } from "@/core/llm/types";
import { getConfiguredModel } from "@/core/llm/configuredModel";
import { systemPrompt, userPrompt } from "./prompts";

// Minimal logger interface — inline for M3.2.2; can migrate to shared utility later.
export interface Logger {
  warn(msg: string, ...args: unknown[]): void;
}

export interface ReferenceAgentDeps {
  llm: LLMProvider;
  logger?: Logger;
}

/**
 * Run ReferenceAgent: validate input → build messages → call LLM → return output.
 * Pure pass-through — no fallback helpers (simpler than M3.2.1 Parse Agent).
 * §A0.4 + §C: No secret access; LLM call goes through deps.llm (ArkProvider → Swift Bridge → Keychain).
 * §A11 privacy: question/job_context/candidate_answer are user-provided text inputs only.
 */
export async function runReferenceAgent(
  input: ReferenceAgentInput,
  deps: ReferenceAgentDeps,
): Promise<ReferenceAgentOutput> {
  const validated = ReferenceAgentInputSchema.parse(input);

  const messages: Message[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: userPrompt(validated) },
  ];

  return deps.llm.generateObject({
    schema: ReferenceAgentOutputSchema,
    messages,
    model: await getConfiguredModel(),
  });
}
