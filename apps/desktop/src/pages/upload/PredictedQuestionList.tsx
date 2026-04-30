// V32.M2.3.5 (F-321) — Predicted question bank, grouped by category.
//
// Each question has a "为什么会问" expander that toggles individually.
// Questions with no examples in the bank's category render under a
// muted "—" placeholder so the four-bucket header stays even when
// only some categories produced output.
import { useState } from "react";
import { ChevronDown } from "lucide-react";

import type {
  PredictedQuestion,
  PredictedQuestionBank,
  PredictedQuestionCategory,
  PredictedQuestionSource,
} from "@eatit/shared-types";

interface Props {
  bank: PredictedQuestionBank;
}

const CATEGORY_LABEL: Record<PredictedQuestionCategory, string> = {
  "company-business": "公司业务",
  "industry-judgment": "行业判断",
  "project-deepdive": "项目深挖",
  "general-pm": "通用产品",
};

const CATEGORY_ORDER: PredictedQuestionCategory[] = [
  "company-business",
  "industry-judgment",
  "project-deepdive",
  "general-pm",
];

const SOURCE_LABEL: Record<PredictedQuestionSource, string> = {
  jd: "岗位 JD",
  resume: "简历",
  research: "联网情报",
};

export function PredictedQuestionList({ bank }: Props): JSX.Element {
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set());

  const groups = groupByCategory(bank.questions);

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <section
      className="card card-pad"
      data-testid="predicted-question-list"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <header className="row between" style={{ alignItems: "center" }}>
        <div>
          <div className="eyebrow">预测面试题库 · F-321</div>
          <h3 className="h3" style={{ margin: "4px 0 0" }}>
            可能会被问到的 {bank.questions.length} 道题
          </h3>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {bank.sources.map((src) => (
            <span
              key={src}
              className="tag tag-line"
              data-testid="predicted-source"
              style={{ fontSize: 10.5 }}
            >
              {SOURCE_LABEL[src]}
            </span>
          ))}
        </div>
      </header>

      <div
        style={{ display: "flex", flexDirection: "column", gap: 18 }}
      >
        {CATEGORY_ORDER.map((category) => {
          const questions = groups.get(category) ?? [];
          return (
            <CategoryBlock
              key={category}
              category={category}
              questions={questions}
              openIds={openIds}
              onToggle={toggle}
            />
          );
        })}
      </div>
    </section>
  );
}

interface CategoryBlockProps {
  category: PredictedQuestionCategory;
  questions: PredictedQuestion[];
  openIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
}

function CategoryBlock({
  category,
  questions,
  openIds,
  onToggle,
}: CategoryBlockProps): JSX.Element {
  return (
    <div data-testid={`predicted-category-${category}`}>
      <div
        className="row between"
        style={{ alignItems: "center", marginBottom: 8 }}
      >
        <span className="eyebrow">{CATEGORY_LABEL[category]}</span>
        <span className="muted" style={{ fontSize: 11.5 }}>
          {questions.length} 道
        </span>
      </div>
      {questions.length === 0 ? (
        <span className="muted" style={{ fontSize: 13 }}>
          —
        </span>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {questions.map((q, i) => {
            const id = `${category}-${i}`;
            const open = openIds.has(id);
            return (
              <li
                key={id}
                data-testid="predicted-question"
                style={{
                  background: "var(--bg-elev)",
                  borderRadius: "var(--r-md)",
                  padding: "10px 12px",
                }}
              >
                <button
                  type="button"
                  className="row between"
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    textAlign: "left",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                  onClick={() => onToggle(id)}
                  aria-expanded={open}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      color: "var(--ink-900)",
                    }}
                  >
                    {q.question}
                  </span>
                  <ChevronDown
                    size={14}
                    style={{
                      flexShrink: 0,
                      color: "var(--ink-500)",
                      transform: open ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 120ms ease",
                    }}
                  />
                </button>
                {open ? (
                  <div
                    data-testid="predicted-question-detail"
                    style={{
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: "1px solid var(--line)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div className="muted" style={{ fontSize: 12 }}>
                      <span className="eyebrow" style={{ marginRight: 4 }}>
                        为什么会问
                      </span>
                      {q.why_likely}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      <span className="eyebrow" style={{ marginRight: 4 }}>
                        证据线索
                      </span>
                      {q.related_evidence}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function groupByCategory(
  questions: PredictedQuestion[],
): Map<PredictedQuestionCategory, PredictedQuestion[]> {
  const groups = new Map<PredictedQuestionCategory, PredictedQuestion[]>();
  for (const q of questions) {
    const bucket = groups.get(q.category) ?? [];
    bucket.push(q);
    groups.set(q.category, bucket);
  }
  return groups;
}
