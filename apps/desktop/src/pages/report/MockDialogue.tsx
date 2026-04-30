import type { DialogueTurn } from "@eatit/shared-types";

// F-322 V32.M3.2.3 — Reflection 输出的 mock_followup_dialogue 渲染。
// Bubble pattern: 面试官气泡靠左 + 中性灰底,候选人气泡靠右 + brand-soft
// 浅绿底。两端约束 ≤ 200 字 / ≤ 12 条由 schema 守住。

export type MockDialogueProps = {
  dialogue: DialogueTurn[];
};

export function MockDialogue({ dialogue }: MockDialogueProps): JSX.Element {
  if (dialogue.length === 0) {
    return (
      <div
        className="muted"
        data-testid="mock-dialogue-empty"
        style={{ fontSize: 12, padding: "12px 0" }}
      >
        本场暂无追问演练片段。
      </div>
    );
  }

  return (
    <div
      data-testid="mock-dialogue"
      className="col"
      style={{ gap: 10 }}
    >
      {dialogue.map((turn, idx) => {
        const isInterviewer = turn.role === "interviewer";
        return (
          <div
            key={idx}
            data-testid={`mock-dialogue-${turn.role}-${idx}`}
            data-role={turn.role}
            className="row"
            style={{
              justifyContent: isInterviewer ? "flex-start" : "flex-end",
              alignItems: "flex-start",
              gap: 8,
            }}
          >
            <div
              style={{
                maxWidth: "75%",
                padding: "10px 14px",
                borderRadius: "var(--r-md)",
                background: isInterviewer
                  ? "var(--bg-sunken)"
                  : "var(--brand-softer)",
                border: isInterviewer
                  ? "1px solid var(--line)"
                  : "1px solid var(--brand-soft)",
                fontSize: 13,
                color: "var(--ink-900)",
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
              }}
            >
              <div
                className="eyebrow"
                style={{ fontSize: 10, marginBottom: 4 }}
              >
                {isInterviewer ? "面试官" : "候选人"}
              </div>
              {turn.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}
