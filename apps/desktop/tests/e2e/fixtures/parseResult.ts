import type { ParseResultPayload } from "@eatit/shared-types";

// Minimal but schema-valid Parse fixture. Only used by the
// upload-to-config smoke; the real ParseResultPayload has many fields
// (research, gaps, interview_focus, …) — the smoke just needs enough
// for ParsedPanel not to crash if anything renders.
export const mockParseResultPayload: ParseResultPayload = {
  job_requirements: [],
  candidate_highlights: [],
  candidate_risks: [],
  project_hooks: [],
  match_summary: null,
  candidate_profile: {
    role: "高级产品经理",
    years: 5,
    companies: ["Mock Co."],
    domain_tags: ["AI", "B 端"],
  },
  match_score: null,
  profile_summary: "5 年产品经验,聚焦 AI / B 端方向。",
  match_advantages: [],
  gaps: [],
  interview_focus: [],
  project_hooks_v32: [],
};
