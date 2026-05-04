// L0 #6 — Persona 4-name lock: Sarah / Marcus / Lin / Daniel ↔ structured / pressure / friendly / expert
// Three-layer enforcement: ① TS Literal type, ② Object.freeze + as const, ③ contract test.
// Any rename = immediate fail. Per v34-macos-port-sections.md §M3.3.1.dev.a.

export type InterviewStyleV32 = "structured" | "pressure" | "friendly" | "expert";
export type PersonaName = "Sarah" | "Marcus" | "Lin" | "Daniel";

export interface InterviewerPersona {
  name: PersonaName;
  style: InterviewStyleV32;
  keywords: readonly [string, string, string];
}

export const PERSONA_MAP: Readonly<Record<InterviewStyleV32, InterviewerPersona>> = Object.freeze({
  structured: { name: "Sarah",  style: "structured", keywords: ["逻辑清晰", "节奏稳定", "客观中立"] as const },
  pressure:   { name: "Marcus", style: "pressure",   keywords: ["直接犀利", "连续追问", "质疑判断"] as const },
  friendly:   { name: "Lin",    style: "friendly",   keywords: ["引导式", "协助展开", "适度肯定"] as const },
  expert:     { name: "Daniel", style: "expert",     keywords: ["行业视角", "案例迁移", "商业本质"] as const },
} as const);

export function getPersona(style: string): InterviewerPersona {
  return (PERSONA_MAP as Record<string, InterviewerPersona>)[style] ?? PERSONA_MAP.structured;
}
