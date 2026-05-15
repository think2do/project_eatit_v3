# v3.4 上架前 UX 二轮优化 — Section Specs(M9)

> **来源**:2026-05-15 内部演示会议(`会议记录/05-15 内部会议_ AI面试系统开发与优化.txt`)。老板演示给同事看的过程中,在 00:14:24 明确归纳了 4 件事(原话引用见各节点)。
> **红线**:沿用 [`v34-macos-port-constraints.md`](v34-macos-port-constraints.md)。
> **硬性约束**:M9 全部 [x] 之前**不要碰 M6.5 Archive 上传**(体验不稳就不上架)。
>
> 共 **1 个 milestone(M9)**,**4 个 ralph 节点**(全 developer 主导)。

---

## Execution Order Master Table

### M9 — 演示反馈 UX 优化(1-1.5 天,4 节点)

| # | 节点 | 老板原话 | Lead | Parallel | Deps | Commit |
|---|---|---|---|---|---|---|
| 1 | **M9.1** 答题中冻结参考答案 | "回答的过程不允许改变状态" | developer | yes | — | `fix(F-507): freeze reference panel after user_answering` |
| 2 | **M9.2** 前两题静态预热(零 LLM 延迟)| "提前两条最最简单的开场介绍和项目介绍这两个问题必问。那这两条做提前的预热缓存" | developer | yes | — | `feat(F-508): hardcode opening 2 questions to skip LLM` |
| 3 | **M9.3** 结束态卡片正中央放大 | "在面试结束后的那个状态,把它给放在正中间,稍微大一点" | developer | yes | — | `feat(F-509): center-stage analyzing card on HomePage` |
| 4 | **M9.4** History list 加生成中状态 | "在 list 里面去加一个生成缓存中的一个状态" | developer | yes | — | `feat(F-510): badge generating sessions in history list` |

---

## M9.1 · 答题中冻结参考答案 ★ 致命 bug ★

**Lead Agent**: developer
**Parallel-safe**: yes
**Deps**: —

**Goal.** 用户开始念答案/打字之后,右侧 AI 参考答案面板**冻结**,不再接受新的 stream chunk 更新。会议 00:13:15 老板说:"我念念着呢,你突然给了我一个更完整的回答,但是你中断了我当时非常必要的一个操作,这是不行的"。

**Files:**
- `apps/desktop/src/pages/InterviewPage.tsx` — 添加 `frozenTurnIndex` 状态;在 reference.chunk 事件 handler 中,若 `event.turnIndex === frozenTurnIndex` 则**不**调 `setCurrentTurnStreamingText`(让屏幕快照保留)
- `apps/desktop/src/statecharts/interview-machine.ts` — `SERVER_REFERENCE` 顶层 action 加 guard:若 `state.matches("user_answering")` 则 **drop** event(不覆盖 referenceAnswer)
- `apps/desktop/src/__tests__/InterviewPage.freezeReference.test.tsx` (new) — 验证答题态下 stream chunk 不再触发 setState

**Key Interfaces.**

```tsx
// InterviewPage.tsx
const [frozenTurnIndex, setFrozenTurnIndex] = useState<number | null>(null);
useEffect(() => {
  if (state.matches("user_answering")) {
    setFrozenTurnIndex(state.context.currentTurnIndex);
  } else if (state.matches("next_question") || state.matches("scoring")) {
    setFrozenTurnIndex(null);
  }
}, [state.value, state.context.currentTurnIndex]);

case "reference.chunk": {
  if (frozenTurnIndex !== null && event.turnIndex === frozenTurnIndex) break;
  // ... existing setCurrentTurnStreamingText logic
}
```

```ts
// interview-machine.ts SERVER_REFERENCE assign
referenceAnswer: ({ context, event, self }) => {
  if (event.type !== "SERVER_REFERENCE") return context.referenceAnswer;
  if (event.payload.turn_index !== context.currentTurnIndex) return context.referenceAnswer;
  // M9.1: 冻结答题中的 reference,不让"更完整的版本"中途覆盖用户正在念的快照
  if (self.getSnapshot().matches("user_answering")) return context.referenceAnswer;
  return event.payload;
},
```

**Acceptance.**
- `pnpm test -- InterviewPage.freezeReference` 全绿(≥ 3 test cases:进 user_answering 前 stream 正常 → 进 user_answering 后 stream 被吞 → 切下一题解冻)
- 手动:开面试,问题出现等 1-2 秒 → 点击 textarea 开始打字 → 右侧 reference 内容**不再变化**

**Commit.** `fix(F-507): freeze reference panel after user_answering`

---

## M9.2 · 前两题静态预热(零 LLM 延迟)

**Lead Agent**: developer
**Parallel-safe**: yes
**Deps**: —

**Goal.** 自我介绍 + 核心项目介绍是面试不变的开场,**没必要调 LLM**。直接 hardcode 模板,Q0/Q1 切换零延迟 + 零失败可能。会议 00:14:40 老板原话:"提前两条最最简单的开场介绍和项目介绍这两个问题必问"。

**Files:**
- `apps/desktop/src/core/sessions/staticOpeningQuestions.ts` (new) — 4 persona × 2 题共 8 个预设 InterviewerAgentOutput
- `apps/desktop/src/core/sessions/QuestionQueue.ts` (modify) — `registerSessionPrefetch` 加 `persona: Persona` 参数;`gen` 函数对 idx ∈ {0, 1} 短路返回静态题(不调 runInterviewerAgent + 不走 withRetryAndTimeout)
- `apps/desktop/src/core/sessions/runInterviewSession.ts` (modify) — `registerSessionPrefetch` 调用处传入 `personaName`
- `apps/desktop/src/core/sessions/__tests__/staticOpeningQuestions.test.ts` (new) — 4 persona × 2 题 = 8 case 快照测试 + 字段完整性(question 非空、should_end=false、expected_depth 合法)

**Key Interfaces.**

```ts
// staticOpeningQuestions.ts
import type { InterviewerAgentOutput } from "@/core/schemas/turns";
import type { ReadableAnswerPersona } from "@/core/agents/coach";

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
```

```ts
// QuestionQueue.ts
export interface RegisterSessionPrefetchArgs {
  sessionId: string;
  totalTurns: number;
  llm: LLMProvider;
  frameworkJson: string;
  durationMinutes: number;
  persona: ReadableAnswerPersona;  // ★ new
}

const queue = new QuestionQueue({
  totalTurns: args.totalTurns,
  gen: async (idx, context) => {
    // M9.2:前两题不走 LLM,直接返回静态预设题
    if (idx <= 1) {
      return staticOpeningQuestion(idx as 0 | 1, args.persona);
    }
    // ... existing LLM-backed gen path (with withRetryAndTimeout) for idx >= 2
  },
});
```

**Acceptance.**
- `pnpm test -- staticOpeningQuestions` 全绿(8 case)
- 手动:从 ConfigPage 点"开始面试" → Q0 < 500ms 显示(纯前端跳转 + 静态题)
- 手动:Q0 答完切 Q1 → 无 loading 动画

**Commit.** `feat(F-508): hardcode opening 2 questions to skip LLM`

---

## M9.3 · 结束态卡片正中央放大

**Lead Agent**: developer
**Parallel-safe**: yes
**Deps**: —

**Goal.** 用户结束面试跳回主页后,"分析生成中" 提示当前位置/字号都让老板演示时**没察觉到**。改为主页**正中央大卡片**,字号 ≥ 20px,带 spinner。会议 00:14:58 老板原话:"在面试结束后的那个状态,把它给放在正中间,稍微大一点"。

**Files:**
- `apps/desktop/src/pages/home/AnalyzingHeroCard.tsx` (new) — 居中大卡片组件,maxWidth 560px,padding 28px,标题 20px + spinner + 说明文案
- `apps/desktop/src/pages/HomePage.tsx` (modify) — 顶部条件渲染 `<AnalyzingHeroCard />`(基于 `useSessionStatusStore((s) => s.analyzing.size > 0)`)
- `apps/desktop/src/components/Toast.tsx` (modify) — 检测 toast message 含"分析生成中"则**不显示**(避免和 HeroCard 重复)
- `apps/desktop/src/pages/home/__tests__/AnalyzingHeroCard.test.tsx` (new) — analyzing.size > 0 显示;= 0 不显示

**Key Interfaces.**

```tsx
// AnalyzingHeroCard.tsx
import { Spinner } from "@/components/Spinner";
import { useSessionStatusStore } from "@/stores/sessionStatus-store";

export function AnalyzingHeroCard(): JSX.Element | null {
  const analyzingCount = useSessionStatusStore((s) => s.analyzing.size);
  if (analyzingCount === 0) return null;
  return (
    <section
      style={{
        margin: "32px auto",
        padding: "28px 32px",
        maxWidth: 560,
        background: "var(--bg-elev)",
        border: "1px solid var(--brand)",
        borderRadius: "var(--r-lg)",
        textAlign: "center",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
        <Spinner size={24} />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
        上一场面试分析生成中
      </h2>
      <p style={{ fontSize: 14, color: "var(--ink-500)", marginTop: 8, lineHeight: 1.6 }}>
        AI 正在整理逐题复盘 + 五维评分,通常需要 30-60 秒。
        <br />
        完成后可在「面试记录」中查看,或开启新一场面试。
      </p>
    </section>
  );
}
```

**Acceptance.**
- `pnpm test -- AnalyzingHeroCard` 全绿
- 手动:结束面试 → 跳主页 → 正中央 ≥ 480px 宽的大卡片清晰可见 → 分析完成后自动消失

**Commit.** `feat(F-509): center-stage analyzing card on HomePage`

---

## M9.4 · History list 加生成中状态

**Lead Agent**: developer
**Parallel-safe**: yes
**Deps**: —

**Goal.** 面试记录列表(`/history`)里,**正在生成报告的那条**显示明显的"生成中" badge + spinner,用户知道"过会儿点"。会议 00:15:02 老板原话:"在 list 里面去加一个生成缓存中的一个状态"。

**Files:**
- `apps/desktop/src/pages/HistoryPage.tsx` (modify) — 每条 list item 检查 `sessionStatus-store.analyzing.has(item.id)`,是则在右侧渲染 `<Chip tone="muted" icon={<Spinner size={12} />}>生成中</Chip>`
- `apps/desktop/src/components/Chip.tsx` (modify, 若需要加 icon prop / muted tone) — 支持 icon 字段
- `apps/desktop/src/pages/history/__tests__/HistoryPage.generatingState.test.tsx` (new) — store 设了 analyzing → 对应 item 渲染 chip;store 没设 → chip 不存在

**Key Interfaces.**

```tsx
// HistoryPage.tsx list item
import { useSessionStatusStore } from "@/stores/sessionStatus-store";
import { Spinner } from "@/components/Spinner";

const analyzing = useSessionStatusStore((s) => s.analyzing);
const unreadReports = useSessionStatusStore((s) => s.unreadReports);

{sessions.map((s) => (
  <li key={s.id} className="history-item" onClick={() => navigate(`/report/${s.id}`)}>
    <div className="history-meta">
      <div className="history-title">{s.job_title}</div>
      <div className="history-time">{formatRelativeTime(s.created_at)}</div>
    </div>
    {analyzing.has(s.id) ? (
      <span className="chip chip-muted">
        <Spinner size={12} /> 生成中
      </span>
    ) : unreadReports.has(s.id) ? (
      <span className="chip chip-brand">新</span>
    ) : null}
  </li>
))}
```

**Acceptance.**
- `pnpm test -- HistoryPage.generatingState` 全绿
- 手动:刚结束面试 → 进面试记录 → 第一条带 spinner + "生成中" → 30-60 秒后 spinner 消失,变成"新" badge

**Commit.** `feat(F-510): badge generating sessions in history list`

---

## 退场标准(EXIT_SIGNAL: true)

ralph 在以下条件全部达成时收口 M9:

1. M9.1 ~ M9.4 全部 [x](fix_plan.md 验证)
2. `cd apps/desktop && pnpm test` 全绿(新增 4 个测试文件 + 既有 1730+ 测试不回归)
3. `cd apps/macos && xcodebuild build -scheme Eatit` 成功
4. 手动 acceptance(用户跑,不在 ralph 范围):
   - 答题中 reference 真冻结
   - Q0 / Q1 切换瞬间(< 500ms)
   - 主页大卡片可见
   - 历史 list 生成中状态可见

完成后才能推进 M6.5(App Store Archive 上传)。
