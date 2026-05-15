import {
  ObserverAgentInputSchema,
  ObserverAgentOutputSchema,
  type ObserverAgentInput,
  type ObserverAgentOutput,
} from "@/core/schemas/turns";
import type { LLMProvider, Message } from "@/core/llm/types";
import { getConfiguredModel } from "@/core/llm/configuredModel";
import { systemPrompt, userPrompt } from "./prompts";

// L0 red line A9 lock — re-export the canonical 7-word list so observer
// consumers can rely on the lock without depending on lib/. Editing the
// source list (apps/desktop/src/lib/fillerWords.ts) requires a coordinated
// L0 review per the comment in that file.
export { FILLER_WORDS_CN, FILLER_WORDS_LENGTH, type FillerWord } from "@/lib/fillerWords";

export interface ObserverAgentDeps {
  llm: LLMProvider;
}

/**
 * Run ObserverAgent: validate input → build messages → generateObject → return.
 * No timeout (Python source has no asyncio.wait_for) — straight LLM call.
 *
 * §A0.4 / §C: no secret access; LLM call goes through deps.llm.
 * §A11: ObserverAgentInputSchema.strict() rejects extra PII fields (resume_text/email/etc.).
 */
export async function runObserverAgent(
  input: ObserverAgentInput,
  deps: ObserverAgentDeps,
): Promise<ObserverAgentOutput> {
  const validated = ObserverAgentInputSchema.parse(input);

  const messages: Message[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: userPrompt(validated) },
  ];

  return deps.llm.generateObject({
    schema: ObserverAgentOutputSchema,
    messages,
    model: await getConfiguredModel(),
  });
}
