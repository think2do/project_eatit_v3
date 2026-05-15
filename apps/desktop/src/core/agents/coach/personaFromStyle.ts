/**
 * personaFromStyle — derives the L0-locked ReadableAnswerPersona from the
 * interview config style string.
 *
 * L0 persona lock: exactly 4 names — Sarah / Marcus / Lin / Daniel.
 * Fallback to "Sarah" for any unknown style (defensive but matches existing
 * PERSONA_NAME_BY_STYLE in InterviewPage / ReportPage).
 */

import type { ReadableAnswerPersona } from "@/core/agents/coach/prompts";

const PERSONA_BY_STYLE: Record<string, ReadableAnswerPersona> = {
  structured: "Sarah",
  pressure: "Marcus",
  friendly: "Lin",
  expert: "Daniel",
};

export function personaFromStyle(style: string): ReadableAnswerPersona {
  return PERSONA_BY_STYLE[style] ?? "Sarah";
}
