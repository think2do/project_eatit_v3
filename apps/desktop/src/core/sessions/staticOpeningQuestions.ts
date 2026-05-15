/**
 * staticOpeningQuestions — zero-LLM opening question templates (M9.2 / F-508).
 *
 * Q0 (自我介绍) and Q1 (核心项目介绍) are invariant opening questions in every
 * interview.  Pre-hardcoding them eliminates LLM latency and failure risk for
 * the two most critical early moments of the session.
 *
 * L0 persona lock: exactly 4 names — Sarah / Marcus / Lin / Daniel.
 * No 12-禁止词 appear in these templates (守护: no "不建议/不推荐/建议放弃/不适合/
 * 差距很大/不合格/淘汰/无希望/拒绝你/失败者/你不行/太差").
 */

import type { InterviewerAgentOutput } from "@/core/schemas/turns";
import type { ReadableAnswerPersona } from "@/core/agents/coach/prompts";

const OPENING_TEMPLATES: Record<ReadableAnswerPersona, [string, string]> = {
  Sarah: [
    "请先做一个简短的自我介绍,重点说明你的核心工作年限 + 最相关的赛道方向。",
    "选一个你最近主导的核心项目,用 STAR 结构介绍背景、你的角色和落地成果。",
  ],
  Marcus: [
    "先说说你自己,过往最有挑战的工作经历是什么?",
    "挑一个你认为最能体现你能力的项目,讲清楚你具体做了什么、结果如何。",
  ],
  Lin: [
    "你好,我们先聊聊你的背景吧,介绍一下你自己和你最熟悉的领域。",
    "可以分享一个你最有成就感的项目吗?业务背景、你的角色和最终成果都讲讲。",
  ],
  Daniel: [
    "请简单介绍下自己 + 你过往最核心的工作经历。",
    "你最深入的项目是哪一个?业务背景、个人角色和成果聊聊。",
  ],
};

export function staticOpeningQuestion(
  idx: 0 | 1,
  persona: ReadableAnswerPersona,
): InterviewerAgentOutput {
  return {
    question: OPENING_TEMPLATES[persona][idx],
    intent: idx === 0 ? "open_warmup" : "core_project_discovery",
    expected_depth: idx === 0 ? "surface" : "tactical",
    followup_hint: null,
    followup_hints: [],
    should_end: false,
    live_observation: null,
  };
}
