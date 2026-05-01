// V32.M2.2.4 — ParsedPanel orchestrates the v3.2 解析结果 layout:
// header meta strip (F-305) + MatchDial + AI 画像摘要 + StrengthGapList
// 双栏 + 三张 FocusCard (F-302) + 底部 CTA. Replaces the v3.1
// ParseResultCard.
//
// V32.M2.3.5 (F-320 / F-321) — when researchOptIn=true AND the upstream
// pipeline produced a ResearchResult, we render CompanyCard +
// IndustryCard + PredictedQuestionList between profile_summary and the
// strength/gap row. None of those are gated on each other; missing
// data ⇒ that specific card hides while siblings stay.
import type {
  InterviewDirectionV32,
  ParseResultPayload,
  PredictedQuestionBank,
  ResearchResult,
} from "@eatit/shared-types";

import { CompanyCard } from "@/pages/upload/CompanyCard";
import { FocusCard } from "@/pages/upload/FocusCard";
import { IndustryCard } from "@/pages/upload/IndustryCard";
import { MatchDial } from "@/pages/upload/MatchDial";
import { ParsedMetaBar } from "@/pages/upload/ParsedMetaBar";
import { PredictedQuestionList } from "@/pages/upload/PredictedQuestionList";
import { StrengthGapList } from "@/pages/upload/StrengthGapList";
import { useAppStore } from "@/stores/app-store";

interface Props {
  payload: ParseResultPayload;
  parsedAt: Date | string | number;
  onReparse: () => void;
  onContinue: () => void;
  reparseDisabled?: boolean;
  continueDisabled?: boolean;
  // V32.M2.3.5 (F-320) — Research output. When null / undefined, the
  // 联网情报 cards do not render. Tests can pass these directly; the
  // production caller (UploadPage) reads them from the store.
  researchPayload?: ResearchResult | null;
  predictedQuestions?: PredictedQuestionBank | null;
  // V32.M2.3.5 (F-320) — opt-in gate. When false the cards stay hidden
  // even if researchPayload happens to be present. Defaults to false
  // so any existing call site keeps the v3.2 (no-research) layout.
  researchOptIn?: boolean;
}

export function ParsedPanel({
  payload,
  parsedAt,
  onReparse,
  onContinue,
  reparseDisabled = false,
  continueDisabled = false,
  researchPayload = null,
  predictedQuestions = null,
  researchOptIn = false,
}: Props): JSX.Element {
  const selectedFocusIds = useAppStore((s) => s.selectedFocusIds);
  const toggleSelectedFocusId = useAppStore((s) => s.toggleSelectedFocusId);

  const showResearchCards = researchOptIn && researchPayload !== null;
  const showCompanyCard = showResearchCards;
  const showIndustryCard = showResearchCards;
  const showPredictedQuestions =
    researchOptIn && predictedQuestions !== null;
  return (
    <section className="card" data-testid="parsed-panel">
      <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--line)" }}>
        <ParsedMetaBar
          parsedAt={parsedAt}
          onReparse={onReparse}
          disabled={reparseDisabled}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "320px 1fr",
        }}
      >
        <aside
          style={{
            padding: "28px",
            borderRight: "1px solid var(--line)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div className="eyebrow">整体匹配度</div>
          {payload.match_score ? (
            <>
              <MatchDial
                score={payload.match_score.score}
                level={payload.match_score.level}
              />
              <div
                className="muted"
                style={{ fontSize: 12.5, textAlign: "center", marginTop: 8 }}
              >
                {payload.match_score.one_line}
              </div>
            </>
          ) : (
            <div
              className="muted"
              style={{ fontSize: 12.5, marginTop: 12, textAlign: "center" }}
            >
              AI 暂未给出整体匹配度。
            </div>
          )}
        </aside>

        <div
          style={{
            padding: "28px 32px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          {payload.profile_summary ? (
            <div>
              <div className="eyebrow">AI 画像摘要</div>
              <p
                style={{
                  fontFamily: "var(--f-serif)",
                  fontSize: 19,
                  lineHeight: 1.55,
                  margin: "8px 0 0",
                  color: "var(--ink-900)",
                }}
              >
                {payload.profile_summary}
              </p>
            </div>
          ) : null}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 20,
            }}
          >
            <StrengthGapList
              title="匹配优势"
              items={payload.match_advantages}
              tint="green"
            />
            <StrengthGapList title="潜在差距" items={payload.gaps} tint="warn" />
          </div>

          {showCompanyCard ? (
            <CompanyCard
              company={researchPayload!.company}
              degraded={researchPayload!.degraded}
            />
          ) : null}
          {showIndustryCard ? (
            <IndustryCard industry={researchPayload!.industry} />
          ) : null}
          {showPredictedQuestions ? (
            <PredictedQuestionList bank={predictedQuestions!} />
          ) : null}
        </div>
      </div>

      <hr className="divider" style={{ margin: 0 }} />

      <div style={{ padding: "22px 28px" }}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <h3 className="h3" style={{ margin: 0 }}>
            建议面试侧重
          </h3>
          <span className="tag tag-line">可编辑</span>
        </div>
        {payload.interview_focus.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
            }}
          >
            {payload.interview_focus.map((focus) => (
              <FocusCard
                key={focus.direction_id}
                focus={focus}
                selected={selectedFocusIds.includes(
                  focus.direction_id as InterviewDirectionV32,
                )}
                onToggle={() =>
                  toggleSelectedFocusId(
                    focus.direction_id as InterviewDirectionV32,
                  )
                }
              />
            ))}
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 12.5 }}>
            AI 暂未给出建议侧重,请直接进入配置页手动选择方向。
          </div>
        )}
        <div
          className="row between"
          style={{
            marginTop: 24,
            paddingTop: 18,
            borderTop: "1px solid var(--line)",
            alignItems: "center",
          }}
        >
          <div className="muted" style={{ fontSize: 12, maxWidth: 480 }}>
            解析结果仅作为 AI 面试官出题参考,不会影响你的真实简历。
          </div>
          <button
            type="button"
            className="btn btn-brand btn-lg"
            onClick={onContinue}
            disabled={continueDisabled}
            data-testid="parsed-panel-continue"
          >
            进入面试配置 →
          </button>
        </div>
      </div>
    </section>
  );
}
