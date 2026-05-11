# v3.4 上架前 UX 优化 — Section Specs

> **总纲**:M6.5(Archive 上传 App Store)前的 6 项体验稳态改造。用户在 2026-05-12 当面盲测后提出,**优先级在 M6.5 之前** — 体验不稳就不上架。
> **红线**:沿用 [`v34-macos-port-constraints.md`](v34-macos-port-constraints.md)。不引入新的红线。
>
> 共 **1 个 milestone(M8)**,**6 个 ralph 节点**(全 developer 主导)。每个节点 = 一个 ralph loop = 一个 commit。
>
> 节点拆分纪律(继承 v34):单节点 ≤ 200 行 / ≤ 8 文件 / spec ≤ 150 行 markdown,避免 Stream Idle Timeout。

---

## Spec 字段说明

每个节点包含以下段:

- **Lead Agent**:`architect` / `developer` / `tester` / `product-manager`
- **Helper Agents**(可选)
- **Parallel-safe**:`yes` / `no`
- **Deps**:依赖的前置节点
- **Goal**:一句话说为什么做
- **Files**:绝对路径列表 + modify/new/delete 标注
- **Key Interfaces**:Swift / TS 关键代码片段
- **Deliverables**:本节点完成后可见的具体产物清单
- **Acceptance**:可执行命令清单
- **Commit**:Conventional Commits 前缀

---

## Execution Order Master Table

### M8 — v3.4 上架前 UX 优化(1 周,6 节点)

| # | 节点 | Lead | Parallel | Deps | Commit prefix |
|---|---|---|---|---|---|
| 1 | M8.1 面试结束跳主页 + Toast + 后台分析 | developer | no | M6.X(已 [x])| `feat(F-501): finalize session in background with toast` |
| 2 | M8.2 Coach prompt 重写为纯可朗读答案 + Markdown | developer | yes | — | `feat(F-502): rewrite coach prompt for readable markdown answer` |
| 3 | M8.3 参考答案题目一出立即并发生成 + 切题取消 | developer | no | M8.2 | `feat(F-503): pre-stream reference answer with switch-question cancel` |
| 4 | M8.4 ReportPage 简化(纯 AI 答案 + 折叠原始作答 + 维度侧栏)| developer | yes | — | `refactor(F-504): simplify ReportPage to ai-answer-first layout` |
| 5 | M8.5 流式 Markdown 加粗实时渲染 | developer | no | M8.2 | `feat(F-505): land streaming markdown bold renderer` |
| 6 | M8.6 题目预加载流水线(Q3 看 Q1, Q4 看 Q2+Q3 滑窗)| developer | no | M8.3 | `feat(F-506): land question prefetch pipeline with sliding window context` |

---

## M8.1 — 面试结束跳主页 + Toast + 后台分析

**Lead Agent**: developer
**Helper Agents**: —
**Parallel-safe**: no
**Deps**: M6.X(已完成)

**Goal.** 面试结束后用户不用干等 30 秒看分析生成。点"结束面试" → 立刻跳回主页 → toast 提示"上一轮面试分析生成中…" → 后台跑完 → 第二个 toast "分析完成,点击查看" + Sidebar 「面试记录」入口加 unread badge。

**Files:**
- `apps/desktop/src/pages/InterviewPage.tsx` (modify) — handleEndSession 改为 fire-and-forget,立刻 `navigate("/")`
- `apps/desktop/src/core/sessions/runInterviewSession.ts` (modify) — finalize 阶段放到独立 Promise,不 await
- `apps/desktop/src/stores/sessionStatus-store.ts` (new) — Zustand store,字段 `analyzingSessions: Map<sessionId, status>`
- `apps/desktop/src/components/Toast.tsx` (new,若 ds 没有) — 简单右下角 toast 容器 + `showToast(message, opts)` API
- `apps/desktop/src/components/AppShell.tsx` (modify) — 挂载 Toast 容器
- `apps/desktop/src/components/Sidebar.tsx` (modify) — 「面试记录」加 unread badge,绑 sessionStatus-store
- `apps/desktop/src/api/sessions.ts` (modify) — `finalizeSession()` 改异步,完成时触发 store update + toast

**Key Interfaces.**

```ts
// sessionStatus-store.ts
interface SessionStatusStore {
  analyzing: Set<string>;
  unreadReports: Set<string>;
  markAnalyzing: (sessionId: string) => void;
  markReady: (sessionId: string) => void;
  markRead: (sessionId: string) => void;
}

// Toast.tsx (minimal)
export function showToast(message: string, opts?: { actionLabel?: string; onAction?: () => void; durationMs?: number }): void;
```

```ts
// InterviewPage.tsx handleEndSession
const handleEndSession = useCallback(() => {
  setEndConfirmOpen(false);
  const sid = sessionId!;
  sessionStatusStore.markAnalyzing(sid);
  // fire-and-forget: 后台完成时 store 更新触发 toast
  void finalizeSession(sid).then(() => {
    sessionStatusStore.markReady(sid);
    showToast("上一轮面试分析完成", {
      actionLabel: "查看",
      onAction: () => navigate(`/report/${sid}`),
    });
  });
  showToast("上一轮面试分析生成中…");
  send({ type: "END_SESSION" });
  navigate("/");
}, [sessionId, send, navigate]);
```

**Deliverables.**
- 点结束面试后 < 200ms 内回到主页
- 主页可见 Sidebar 「面试记录」右上 unread badge
- 30 秒后弹"分析完成"toast,点击进 Report

**Acceptance.**
- `cd eatit/apps/desktop && pnpm test -- sessionStatus-store Toast` 全绿
- 手动:开一场面试 → 立刻结束 → 验证立即跳主页 + 后台 toast 完成

**Commit.** `feat(F-501): finalize session in background with toast`

---

## M8.2 — Coach prompt 重写为纯可朗读答案 + Markdown

**Lead Agent**: developer
**Helper Agents**: —
**Parallel-safe**: yes
**Deps**: —

**Goal.** Coach Agent 当前输出含"建议/注意/可以从X切入"等元话,用户要的是**可直接朗读的完整答案**。同时输出格式锁为 Markdown(关键词用 `**加粗**`),为 M8.5 流式加粗渲染铺路。

**Files:**
- `apps/desktop/src/core/agents/coach/prompts.ts` (modify) — system prompt 重写
- `apps/desktop/src/core/agents/coach/index.ts` (modify, 若需要) — output schema 加 `ai_suggested_answer_markdown: string`
- `apps/desktop/src/core/schemas/reports.ts` (modify) — RoundReviewV2Schema 加 markdown 字段
- `apps/desktop/src/core/agents/coach/__tests__/coachAgent.teaching.test.ts` (modify) — fuzz test 禁止词改为禁"建议你"/"可以从"/"注意"/"提醒"等元话

**Key Interfaces.**

```ts
// prompts.ts — 新 system prompt 大纲
const SYSTEM = `
你是面试官 {{persona}},在用户答完一题后,给出**你本人作为受访者会怎么答**的范本。

【输出硬约束】
- 第一人称,自然口语,可直接朗读
- 1 段开场陈述(20-40 字)+ 2~3 个并列要点(标 "1." / "2." / "3.")
- 总长 ≤ 250 字
- 关键名词用 Markdown **加粗**(每段 1-2 处,过多失焦)
- 禁词:建议你 / 可以从 / 注意 / 提醒 / 应该 / 推荐 / 你可以这样
- 不写"理解问题"/"答题思路"/"采分点"等元 meta

输出 JSON: { "ai_suggested_answer_markdown": "string(纯 markdown 文本)" }
`;
```

**Deliverables.**
- Coach 输出全是可朗读答案,无任何 "建议你..." 类元话
- 输出含 markdown `**` 加粗标记(每段 1-2 处)
- Fuzz test 通过(50 次抽样,禁词命中率 = 0)

**Acceptance.**
- `pnpm test -- coachAgent.teaching` 全绿
- 手动跑一次面试,看 Report 里 ai_suggested_answer_markdown 字段含 `**` 标记

**Commit.** `feat(F-502): rewrite coach prompt for readable markdown answer`

---

## M8.3 — 参考答案题目一出立即并发生成 + 切题取消

**Lead Agent**: developer
**Helper Agents**: —
**Parallel-safe**: no
**Deps**: M8.2

**Goal.** 当前 Coach Agent 在用户答完才跑。改造为:**问题一出立即并发 trigger Coach drafting,边生成边流式渲染到右侧"AI 参考"面板**。用户切下一题时取消未完成的流,节省 token。

**Files:**
- `apps/desktop/src/core/sessions/runInterviewSession.ts` (modify) — turn_graph 加 `reference_drafter` 并发节点
- `apps/desktop/src/core/graphs/turnGraph.ts` (modify) — 并发分支:`question_generated → [user_answering, reference_drafting]`
- `apps/desktop/src/pages/InterviewPage.tsx` (modify) — 监听 `referenceChunk` stream event,渲染到 ReferencePanel
- `apps/desktop/src/pages/interview/ReferencePanel.tsx` (modify) — 接收 streamingText prop,流式 append
- `apps/desktop/src/core/agents/coach/index.ts` (modify) — 暴露 streaming 接口:`*streamCoachAnswer(question, persona): AsyncGenerator<string>`
- `apps/desktop/src/__tests__/contracts/coach-streaming.contract.test.ts` (new) — 验证 streaming + cancel 契约

**Key Interfaces.**

```ts
// runInterviewSession.ts
function* runInterview(...): AsyncGenerator<SessionEvent> {
  // ...
  while (currentTurn < totalTurns) {
    const q = await generateQuestion(...);
    yield { type: "question_ready", turnIndex, text: q };

    // ★ 并发启动 Coach drafting,AbortController 控制取消
    const draftController = new AbortController();
    void streamCoachDraft(q, persona, draftController.signal, (chunk) => {
      yield { type: "reference_chunk", turnIndex, chunk };
    });

    const answer = await waitForUserAnswer();
    // 用户提交答案 → 不取消 draft(让它跑完,作为最终 reference)

    // 用户切到下一题(未答,直接 next) → 取消
    if (answer === SKIPPED) draftController.abort();

    yield { type: "answer_submitted", ... };
    currentTurn++;
  }
}
```

**Deliverables.**
- 问题显示后 < 500ms 看到 "AI 参考" 面板开始流式打字
- 用户提交答案 OR 切下一题时,正在 drafting 的流被合理终止/收尾
- AbortController 真的中断 LLM SSE 流(测试验证 token 计数)

**Acceptance.**
- `pnpm test -- coach-streaming.contract` 全绿
- 手动跑一次面试,问题出现 < 1s 内右侧开始有文字流入

**Commit.** `feat(F-503): pre-stream reference answer with switch-question cancel`

---

## M8.4 — ReportPage 简化(纯 AI 答案 + 折叠原始作答 + 维度侧栏)

**Lead Agent**: developer
**Helper Agents**: —
**Parallel-safe**: yes
**Deps**: —

**Goal.** 当前 ReportPage 每题 4 字段并列,显得冗余。重排为:**AI 建议答案为主(大字)+ 用户原始作答折叠在下方(默认收起)+ 维度评分挪到侧栏**。

**Files:**
- `apps/desktop/src/pages/ReportPage.tsx` (modify) — 主区改为 AI-answer-first 布局,维度评分挪侧栏
- `apps/desktop/src/pages/report/QuestionReview.tsx` (modify) — 4 字段卡片改为单主答案 + `<details>` 包原始作答
- `apps/desktop/src/pages/report/DimensionSidebar.tsx` (new) — 抽出维度评分组件,5 维条形 + 总分
- `apps/desktop/src/pages/report/__tests__/ReportPage.test.tsx` (modify) — 更新快照

**Key Interfaces.**

```tsx
// QuestionReview.tsx 新结构
<section className="round-review">
  <div className="question-line">问 {n}. {question}</div>

  <div className="ai-answer-main">
    <h3>{persona} 这样回答</h3>
    <MarkdownStream text={ai_suggested_answer_markdown} />
  </div>

  <details className="raw-answer-fold">
    <summary>我的原始作答</summary>
    <pre>{raw_answer}</pre>
  </details>
</section>
```

```tsx
// ReportPage.tsx 顶层布局
<div className="report-layout">
  <main className="rounds">{rounds.map(r => <QuestionReview key={r.turn_index} {...r} />)}</main>
  <aside className="dimension-sidebar"><DimensionSidebar dims={overall_dimensions} /></aside>
</div>
```

**Deliverables.**
- ReportPage 每题主体显示 AI 答案 1 个区块,不再 4 字段并列
- 原始作答默认收起,点开可见
- 5 维评分在右侧栏(屏幕宽度 < 1100 px 时降级折叠)

**Acceptance.**
- `pnpm test -- ReportPage` 全绿
- 手动查看一份已生成的 Report,验证布局

**Commit.** `refactor(F-504): simplify ReportPage to ai-answer-first layout`

---

## M8.5 — 流式 Markdown 加粗实时渲染

**Lead Agent**: developer
**Helper Agents**: —
**Parallel-safe**: no
**Deps**: M8.2

**Goal.** Coach Agent 输出含 `**加粗**` 标记,但当前前端直接当纯文本渲染。需要一个支持**流式增量解析**的 markdown renderer,关键词随流到达实时变粗。

**Files:**
- `apps/desktop/src/components/MarkdownStream.tsx` (new) — 流式 markdown 组件,只处理 `**bold**`,不引入完整 markdown 库
- `apps/desktop/src/components/__tests__/MarkdownStream.test.tsx` (new) — 测试 token 边界(`**` 单独到达时不闪烁)
- `apps/desktop/src/pages/interview/ReferencePanel.tsx` (modify) — 用 MarkdownStream 渲染 streamingText
- `apps/desktop/src/pages/report/QuestionReview.tsx` (modify) — Report 里也用 MarkdownStream(传 isComplete=true)

**Key Interfaces.**

```tsx
// MarkdownStream.tsx — 最小可用流式 bold 解析器
interface Props {
  text: string;          // 当前累积的全部文本(可能含半个 ** token)
  isComplete?: boolean;  // 流是否结束(true 时即便有未闭合 ** 也按字面渲染)
}

export function MarkdownStream({ text, isComplete }: Props): JSX.Element {
  // 状态机:扫描 text,**xxx** 之间的内容包 <strong>。
  // 未闭合的尾部 `**xx` 在 isComplete=false 时**不渲染加粗**(避免闪烁),
  // 等下个 token 到达再决定。isComplete=true 时按字面字符渲染。
  const segments = parseBoldSegments(text, isComplete ?? false);
  return <span>{segments.map((s, i) => s.bold ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>)}</span>;
}
```

**Deliverables.**
- 一段 markdown `"今天**很重要**的一点是"` 边输入边渲染,token 边界不闪烁
- 测试覆盖:`**`、`**a`、`**ab`、`**abc**` 四个增量状态
- ReferencePanel + ReportPage 两处都用上

**Acceptance.**
- `pnpm test -- MarkdownStream` 全绿(≥ 8 个测试)
- 手动跑面试,看右侧参考答案的加粗实时出现

**Commit.** `feat(F-505): land streaming markdown bold renderer`

---

## M8.6 — 题目预加载流水线(Q3 看 Q1, Q4 看 Q2+Q3 滑窗)

**Lead Agent**: developer
**Helper Agents**: architect(若 graph 改动大)
**Parallel-safe**: no
**Deps**: M8.3

**Goal.** 当前每题之间用户等几秒 LLM 生成下一题。改造为**流水线**:
- 配置阶段就开始预生成 Q1/Q2/Q3(开放性,不依赖用户答案)
- 每答完一题,后台并发预热下一题(N+3 始终领先)
- 第 3 轮起 context 滚动:Q3 看 Q1 答案;Q4 看 Q2+Q3 答案(紧邻前 2 轮滑窗)

**Files:**
- `apps/desktop/src/core/agents/interviewer/index.ts` (modify) — `generateQuestion` 支持 `previousTurns: Turn[]` 参数(滑窗)
- `apps/desktop/src/core/agents/interviewer/prompts.ts` (modify) — 前 2 轮 vs 第 3+ 轮 prompt 分支(模板里 `{% if turn_index <= 2 %}...开放性...{% else %}...基于前 N 轮...{% endif %}`)
- `apps/desktop/src/core/sessions/QuestionQueue.ts` (new) — pipeline 抽象,getter `next() / peek(offset)` + `prefetch(turnIndex, context)`
- `apps/desktop/src/core/sessions/runInterviewSession.ts` (modify) — 用 QuestionQueue 替代当前串行 generate;config 阶段 dispatch 前 3 个 prefetch
- `apps/desktop/src/api/sessions.ts` (modify) — `createSession` 返回后立刻 trigger `queue.prefetch([1,2,3])`
- `apps/desktop/src/pages/ConfigPage.tsx` (modify) — 点"开始面试"后跳转前 await createSession + 已 dispatch prefetch
- `apps/desktop/src/__tests__/contracts/question-pipeline.contract.test.ts` (new) — 验证不变式 `queue.peek(currentIdx+2)` 始终 ready 或 in-flight

**Key Interfaces.**

```ts
// QuestionQueue.ts
class QuestionQueue {
  private cache = new Map<number, Promise<string>>();
  private static readonly LOOKAHEAD = 3;

  constructor(private gen: (idx: number, context: Turn[]) => Promise<string>) {}

  /** Trigger prefetch for turn indices, with context (empty for first 2). */
  prefetch(idx: number, context: Turn[]): void {
    if (this.cache.has(idx)) return;
    this.cache.set(idx, this.gen(idx, context));
  }

  /** Wait for the given turn index, blocking until ready. */
  async next(idx: number): Promise<string> {
    if (!this.cache.has(idx)) {
      throw new Error(`Q${idx} not prefetched — pipeline broken`);
    }
    return this.cache.get(idx)!;
  }

  /** Schedule N+LOOKAHEAD prefetch after the user answers turn N. */
  scheduleNext(currentIdx: number, allTurnsSoFar: Turn[]): void {
    const target = currentIdx + this.LOOKAHEAD;
    if (target > totalTurns) return;
    // 上下文滑窗:第 3 轮起,context = 紧邻前 2 轮
    const ctx = target <= 2 ? [] : allTurnsSoFar.slice(-2);
    this.prefetch(target, ctx);
  }
}
```

```ts
// runInterviewSession.ts (核心改动)
const queue = new QuestionQueue(generateQuestion);

// 启动时立即并发 Q1/Q2/Q3(空 context)
queue.prefetch(1, []);
queue.prefetch(2, []);
queue.prefetch(3, []);

while (currentIdx < totalTurns) {
  const q = await queue.next(currentIdx);
  yield { type: "question_ready", ... };

  const answer = await waitForAnswer();
  turns.push({ turnIndex: currentIdx, answer });

  // 立即预热 currentIdx+3(滑窗 context)
  queue.scheduleNext(currentIdx, turns);

  currentIdx++;
}
```

**Deliverables.**
- 配置页 → 面试页跳转时,Q1 已经 ready,< 200ms 显示
- 每题用户答完后切下一题,无可见 loading
- 第 3 轮起 prompt 含前轮答案的引用(可在 LLM input 日志验证)

**Acceptance.**
- `pnpm test -- question-pipeline.contract` 全绿(≥ 6 个测试覆盖不变式)
- 手动跑完整面试(9 轮),记录每次切题等待时长,平均 < 500ms

**Commit.** `feat(F-506): land question prefetch pipeline with sliding window context`

---

## 退场标准(EXIT_SIGNAL: true 触发条件)

ralph 在以下条件全部达成时收口本 milestone:

1. M8.1 ~ M8.6 六个节点全部 [x](fix_plan.md 验证)
2. `pnpm test` 全绿(单元 + contract + smoke)
3. `xcodebuild build` 成功
4. 手动 acceptance:从 ConfigPage 完成一次完整 9 轮面试,观察:
   - 跳到 InterviewPage 时 Q1 < 200ms 显示
   - 问题一出右侧 ReferencePanel 立刻有文字流入(加粗实时)
   - 每题切换无可见 loading
   - 结束面试立刻跳主页,toast 提示
   - 后台分析完成后 toast + sidebar badge
   - ReportPage 显示 AI 答案为主,原始作答可折叠展开

全部达成后 ralph 报告 `EXIT_SIGNAL: true`,主控权回到用户。
