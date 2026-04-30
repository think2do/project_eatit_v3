/**
 * F-308 InterviewerPersona — frontend mirror.
 *
 * Names (Sarah / Marcus / Lin / Daniel) are an A6 L0 red line. The
 * backend source of truth is
 * `apps/api/app/agents/interviewer/personas.py`; the
 * `scripts/persona_name_guard.py` CI hook greps that file for drift,
 * and the desktop side simply re-exports the same constants typed
 * against `InterviewerPersonaName` from `@eatit/shared-types`.
 *
 * If you find yourself adding `Alice` / `Emma` / `Bob` here — stop.
 * That's an A6 violation. New agents (Coach / Reflection / etc.) live
 * on their own persona module.
 */
import type {
  InterviewerPersona,
  InterviewStyleV32,
} from "@eatit/shared-types";

export const PERSONA_MAP: Readonly<
  Record<InterviewStyleV32, InterviewerPersona>
> = {
  structured: {
    name: "Sarah",
    style: "structured",
    keywords: ["逻辑清晰", "节奏稳定", "客观中立"],
  },
  pressure: {
    name: "Marcus",
    style: "pressure",
    keywords: ["直接犀利", "连续追问", "质疑判断"],
  },
  friendly: {
    name: "Lin",
    style: "friendly",
    keywords: ["引导式", "协助展开", "适度肯定"],
  },
  expert: {
    name: "Daniel",
    style: "expert",
    keywords: ["行业视角", "案例迁移", "商业本质"],
  },
};

/** Defensive default: unknown style → Sarah/structured (matches the
 * backend `get_persona` fallback). */
export function getPersona(style: string): InterviewerPersona {
  if (style in PERSONA_MAP) {
    return PERSONA_MAP[style as InterviewStyleV32];
  }
  return PERSONA_MAP.structured;
}
