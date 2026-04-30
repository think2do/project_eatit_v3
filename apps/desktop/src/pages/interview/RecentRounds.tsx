export type RecentRoundTone = "good" | "risk" | "normal";

export interface RecentRound {
  index: number;
  question: string;
  answerSummary: string;
  tone: RecentRoundTone;
  toneLabel: string;
}

const TONE_CLASS: Record<RecentRoundTone, string> = {
  good: "tag tag-green",
  risk: "tag tag-warn",
  normal: "tag tag-line",
};

/**
 * Last-3-rounds digest pinned below the active question.
 * Signals continuity ("we were just talking about X") without forcing
 * the user to scroll the full transcript. The full record lives on
 * the post-interview ReportPage; this strip is intentionally lossy.
 */
export function RecentRounds({
  rounds,
}: {
  rounds: RecentRound[];
}): JSX.Element | null {
  if (rounds.length === 0) return null;
  return (
    <div>
      <div className="row between" style={{ marginBottom: 10 }}>
        <span className="eyebrow">近几轮问答摘要</span>
        <span className="muted" style={{ fontSize: 11.5 }}>
          仅展示最近 3 轮 · 完整记录在报告中查看
        </span>
      </div>
      <div className="col" style={{ gap: 10 }}>
        {rounds.slice(-3).map((r) => (
          <div
            key={r.index}
            className="card"
            style={{ padding: "12px 16px" }}
          >
            <div className="row between" style={{ marginBottom: 4 }}>
              <div className="row" style={{ gap: 8 }}>
                <span
                  className="mono"
                  style={{ fontSize: 11, color: "var(--ink-400)" }}
                >
                  Q{r.index}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  {r.question}
                </span>
              </div>
              <span className={TONE_CLASS[r.tone]}>{r.toneLabel}</span>
            </div>
            <div
              className="muted"
              style={{ fontSize: 12.5, marginLeft: 26 }}
            >
              {r.answerSummary}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
