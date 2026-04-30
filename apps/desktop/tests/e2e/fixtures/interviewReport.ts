import type { InterviewReportResponse } from "@eatit/shared-types";

// Hardcoded smoke fixture — pinned to schema shapes from
// `packages/shared-types/src/index.ts`. Numbers (overall_score / dimension
// scores) are intentionally varied across F-314 normalization bands so
// the HeroScoreCard renders both score + 通过可能性 ("中上") with no
// 0–100% appearing on the page.
export const mockInterviewReport: InterviewReportResponse = {
  id: "mock-report-1",
  created_at: "2026-05-01T08:00:00Z",
  updated_at: "2026-05-01T08:01:00Z",
  interview_session_id: "mock-session-1",
  status: "ready",
  requested_at: "2026-05-01T08:00:00Z",
  generated_at: "2026-05-01T08:01:00Z",
  payload: {
    overall_summary:
      "整体表达清晰,在批判性思考与业务直觉两项上的回答尤其有亮点;沟通节奏稍偏快。",
    overall_score: 82,
    pass_likelihood: "中上",
    ai_verdict: "整体处于中上水位",
    pass_probability: 0,
    round_reviews: [],
    strengths: ["案例选取贴合岗位"],
    improvements: ["第三轮可补充指标量化"],
    next_actions: ["针对追问练习 1 次"],
    reasons: [],
    dimensions: [
      {
        name: "专业深度",
        description: "对技术与业务概念的掌握扎实。",
        score: 84,
        evidence_chips: [],
      },
      {
        name: "结构化表达",
        description: "STAR / 金字塔结构基本清晰。",
        score: 78,
        evidence_chips: [],
      },
      {
        name: "批判性思考",
        description: "能识别隐藏假设并主动反问。",
        score: 86,
        evidence_chips: [],
      },
      {
        name: "业务直觉",
        description: "对指标与业务边界的判断比较稳。",
        score: 80,
        evidence_chips: [],
      },
      {
        name: "沟通节奏",
        description: "节奏偏快,偶尔需要给对方留出回应窗口。",
        score: 72,
        evidence_chips: [],
      },
    ],
    round_reviews_v2: [],
    next_actions_v2: null,
  },
};
