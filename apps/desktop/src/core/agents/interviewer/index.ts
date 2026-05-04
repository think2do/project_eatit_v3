import {
  InterviewerAgentInputSchema,
  InterviewerAgentOutputSchema,
  type InterviewerAgentInput,
  type InterviewerAgentOutput,
} from "@/core/schemas/turns";
import type { LLMProvider, Message } from "@/core/llm/types";
import type { InterviewStyleV32 } from "./personas";
import { getPersona } from "./personas";
import { systemPrompt, userPrompt, extractPredictedQuestions } from "./prompts";

// §C3: No process.env / getApiKey / keychain access here. LLM calls go through deps.llm only.

export interface InterviewerAgentDeps {
  llm: LLMProvider;
}

const KNOWN_STYLES = new Set<InterviewStyleV32>(["structured", "pressure", "friendly", "expert"]);

/**
 * Parse the interview style from framework_json.
 * Tries framework.style ∪ framework.pace_plan?.style ∪ framework.interview_style.
 * Falls back to "structured" (Sarah) on parse error or unknown style.
 */
export function parseInterviewStyle(frameworkJson: string): InterviewStyleV32 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(frameworkJson);
  } catch {
    return "structured";
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return "structured";
  const obj = parsed as Record<string, unknown>;

  const candidates = [
    obj.style,
    (obj.pace_plan as Record<string, unknown> | undefined)?.style,
    obj.interview_style,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && KNOWN_STYLES.has(candidate as InterviewStyleV32)) {
      return candidate as InterviewStyleV32;
    }
  }
  return "structured";
}

/**
 * Run InterviewerAgent: validate input → resolve persona → build messages → generateObject → return.
 * No timeout (Python service.py has no asyncio.wait_for) — plain LLM call.
 *
 * §C3: no secret access; LLM call goes through deps.llm.
 * §A11: InterviewerAgentInputSchema.strict() rejects extra PII fields.
 */
export async function runInterviewerAgent(
  input: InterviewerAgentInput,
  deps: InterviewerAgentDeps,
): Promise<InterviewerAgentOutput> {
  const validated = InterviewerAgentInputSchema.parse(input);

  const styleId = parseInterviewStyle(validated.framework_json);
  const persona = getPersona(styleId);
  const predictedQuestions = extractPredictedQuestions(validated.framework_json);

  const messages: Message[] = [
    { role: "system", content: systemPrompt(persona) },
    { role: "user", content: userPrompt(validated, predictedQuestions) },
  ];

  return deps.llm.generateObject({
    schema: InterviewerAgentOutputSchema,
    messages,
    model: "doubao-seed-1-6-250615",
  });
}
