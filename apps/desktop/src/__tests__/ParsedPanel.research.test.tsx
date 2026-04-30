// V32.M2.3.X audit-fix (G5) — ParsedPanel research-cards gating tests.
//
// Pre-audit there was no test that the 3 联网情报 cards
// (CompanyCard / IndustryCard / PredictedQuestionList) actually depend
// on BOTH researchOptIn=true AND the corresponding payload being
// non-null. These tests pin all three branches.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type {
  ParseResultPayload,
  PredictedQuestionBank,
  ResearchResult,
} from "@eatit/shared-types";

import { ParsedPanel } from "@/pages/upload/ParsedPanel";
import { useAppStore } from "@/stores/app-store";

const PAYLOAD: ParseResultPayload = {
  job_requirements: [],
  candidate_highlights: [],
  candidate_risks: [],
  project_hooks: [],
  match_summary: null,
  candidate_profile: null,
  match_score: { score: 70, level: "MID", one_line: "整体匹配度中等" },
  profile_summary: "测试简介",
  match_advantages: [],
  gaps: [],
  interview_focus: [],
  project_hooks_v32: [],
};

const RESEARCH: ResearchResult = {
  company: {
    name: "字节跳动",
    business_model: "短视频与社交平台",
    stage: "mature",
    recent_signals: [],
    evidence_links: [],
    confidence: "mid",
  },
  industry: {
    name: "短视频",
    landscape_summary: "存量竞争阶段",
    key_metrics: ["DAU", "时长", "ARPU"],
    typical_pain_points: ["内容审核", "创作者生态"],
    competitors_in_jd_ctx: [],
  },
  fetched_at: "2026-04-30T00:00:00Z",
  cache_key: "0123456789abcdef",
  degraded: false,
  degraded_reason: null,
};

const BANK: PredictedQuestionBank = {
  questions: Array.from({ length: 8 }, (_, i) => ({
    category: "company-business",
    question: `预测题 ${i + 1}`,
    why_likely: "JD 提到此方向",
    related_evidence: "JD",
  })),
  generated_at: "2026-04-30T00:00:00Z",
  sources: ["jd"],
};

afterEach(() => {
  cleanup();
  useAppStore.getState().resetSelectedFocusIds();
});

describe("ParsedPanel research-cards gating", () => {
  it("hides all 3 cards when researchOptIn=false (even with payloads)", () => {
    const { queryByTestId } = render(
      <ParsedPanel
        payload={PAYLOAD}
        parsedAt={Date.now()}
        onReparse={() => {}}
        onContinue={() => {}}
        researchPayload={RESEARCH}
        predictedQuestions={BANK}
        researchOptIn={false}
      />,
    );
    expect(queryByTestId("company-card")).toBeNull();
    expect(queryByTestId("industry-card")).toBeNull();
    expect(queryByTestId("predicted-question-list")).toBeNull();
  });

  it("hides all 3 cards when researchOptIn=true but researchPayload=null", () => {
    const { queryByTestId } = render(
      <ParsedPanel
        payload={PAYLOAD}
        parsedAt={Date.now()}
        onReparse={() => {}}
        onContinue={() => {}}
        researchPayload={null}
        predictedQuestions={null}
        researchOptIn={true}
      />,
    );
    expect(queryByTestId("company-card")).toBeNull();
    expect(queryByTestId("industry-card")).toBeNull();
    expect(queryByTestId("predicted-question-list")).toBeNull();
  });

  it("renders all 3 cards when researchOptIn=true AND payloads non-null", () => {
    const { queryByTestId } = render(
      <ParsedPanel
        payload={PAYLOAD}
        parsedAt={Date.now()}
        onReparse={() => {}}
        onContinue={() => {}}
        researchPayload={RESEARCH}
        predictedQuestions={BANK}
        researchOptIn={true}
      />,
    );
    expect(queryByTestId("company-card")).not.toBeNull();
    expect(queryByTestId("industry-card")).not.toBeNull();
    expect(queryByTestId("predicted-question-list")).not.toBeNull();
  });
});
