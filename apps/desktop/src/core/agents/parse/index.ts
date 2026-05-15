import {
  ParseAgentInputSchema,
  ParseOutputSchema,
  MatchScoreSchema,
  type ParseAgentInput,
  type ParseOutput,
  type MatchScore,
  type InterviewFocus,
} from "@/core/schemas/parse";
import type { LLMProvider } from "@/core/llm/types";
import { getConfiguredModel } from "@/core/llm/configuredModel";
import { systemPrompt, userPrompt } from "./prompts";

// Minimal logger interface — inline for M3.2.1; can migrate to shared utility later.
export interface Logger {
  warn(msg: string, ...args: unknown[]): void;
}

export interface ParseAgentDeps {
  llm: LLMProvider;
  logger?: Logger;
}

// Default interview focus items — translated from Python _DEFAULT_INTERVIEW_FOCUS constant.
const DEFAULT_INTERVIEW_FOCUS: readonly InterviewFocus[] = [
  {
    direction_id: "cross-func",
    priority: "high",
    title: "跨职能协作",
    description: "默认补位:验证跨团队推进与对齐能力。",
  },
  {
    direction_id: "zero-to-one",
    priority: "mid",
    title: "0→1 推动力",
    description: "默认补位:看候选人独立推进新项目的节奏。",
  },
];

/**
 * Derive a match score when the LLM omits it.
 * Translated from Python _derive_match_score(advantages_n, gaps_n).
 *
 * delta ≥ 2  → score=65, level="MID"
 * delta in [0,1] → score=50, level="LOW"
 * delta < 0  → score=40, level="LOW"
 *
 * Output is guaranteed to pass MatchScoreSchema.parse (cross-field refine aligned).
 */
export function deriveMatchScore(advantagesN: number, gapsN: number): MatchScore {
  const delta = advantagesN - gapsN;
  if (delta >= 2) {
    return MatchScoreSchema.parse({
      score: 65,
      level: "MID",
      one_line: "自动估算:优势略多于缺口",
    });
  }
  if (delta >= 0) {
    return MatchScoreSchema.parse({
      score: 50,
      level: "LOW",
      one_line: "自动估算:优劣势接近持平",
    });
  }
  return MatchScoreSchema.parse({
    score: 40,
    level: "LOW",
    one_line: "自动估算:缺口多于优势",
  });
}

/**
 * Ensure interview_focus has at least 2 items.
 * Translated from Python service.py post-LLM logic.
 * If fewer than 2 items, prepend the 2 default items and return combined list.
 */
export function ensureInterviewFocus(focus: InterviewFocus[]): InterviewFocus[] {
  if (focus.length >= 2) {
    return focus;
  }
  return [...DEFAULT_INTERVIEW_FOCUS, ...focus];
}

/**
 * Run ParseAgent: validate input → build messages → call LLM → apply fallbacks → return output.
 * §A0.4 + §C: No secret access; LLM call goes through deps.llm (ArkProvider → Swift Bridge → Keychain).
 * §A11 privacy: resume_text/jd_text are user-provided text inputs only; output contains no raw text.
 */
export async function runParseAgent(
  input: ParseAgentInput,
  deps: ParseAgentDeps,
): Promise<ParseOutput> {
  const validated = ParseAgentInputSchema.parse(input);

  const messages = [
    { role: "system" as const, content: systemPrompt() },
    { role: "user" as const, content: userPrompt(validated) },
  ];

  const result = await deps.llm.generateObject({
    schema: ParseOutputSchema,
    messages,
    model: await getConfiguredModel(),
  });

  // Fallback #1: derive match_score if LLM omitted it
  const matchScore =
    result.match_score ??
    deriveMatchScore(result.match_advantages.length, result.gaps.length);

  // Fallback #2: ensure interview_focus has at least 2 items
  const interviewFocus = ensureInterviewFocus(result.interview_focus);

  if (result.match_score == null) {
    deps.logger?.warn("[ParseAgent] match_score was null — derived from advantages/gaps delta");
  }
  if (result.interview_focus.length < 2) {
    deps.logger?.warn(
      "[ParseAgent] interview_focus had %d item(s) — prepended 2 defaults",
      result.interview_focus.length,
    );
  }

  return {
    ...result,
    match_score: matchScore,
    interview_focus: interviewFocus,
  };
}
