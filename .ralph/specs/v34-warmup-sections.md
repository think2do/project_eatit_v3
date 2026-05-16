# v3.4 面试预热(Warmup)统一加载 — Section Specs(M10)

> **来源**:2026-05-16 用户反馈。原话:"我们计划一下怎么实现预热,在生成面试题目框架之后,然后面试题目和提示生成之后才开始显示,这一块主要要提前预热出两道题目"。
> **红线**:沿用 [`v34-macos-port-constraints.md`](v34-macos-port-constraints.md)。
> **硬性约束**:M10 全部 [x] 之前**不要碰 M6.5 Archive 上传**(体验不稳就不上架,与 M9 同纪律)。
>
> 共 **1 个 milestone(M10)**,**5 个 ralph 节点**(全 developer 主导)。

---

## 背景与问题

点「开始面试」后:
1. `createSession()` 阻塞 ~40–90s 跑 `runFrameworkAgent`(`apps/desktop/src/api/sessions.ts:57-60`),期间 ConfigPage 仅变灰、无任何进度反馈。
2. 进 InterviewPage 后 Q0 题目是 M9.2 静态题,秒出;但「提示/参考答案」是进界面**之后**才由 `runInterviewSession` 异步触发的 LLM 调用(`startReference` / `startStreamingDraft`,`runInterviewSession.ts:219-287`,在 bootstrap 322-324 行 question 已 emit 之后才 fire),导致参考面板先空着、几秒后才姗姗来迟地流式刷出来。

**目标**(用户已确认 3 项):
- 全程统一预热界面 + 阶段进度,覆盖最耗时的框架生成。
- 就绪门槛 = **Q0 题目 + Q0 提示**就绪才进面试;Q1 题目后台预热(M9.2 已天然满足)。
- 提示仍**保留逐字加粗流式动画**,门槛卡在「首个 reference chunk 到达」而非「流完」—— 面试界面出现的那一刻提示已在流。

**架构约束**:框架生成必须留在 `createSession()` 内 —— `sessionId` 在其内部 `crypto.randomUUID()`(sessions.ts:89)生成,未 resolve 前没有 `/interview/:id` 可跳。故 Stage-1(框架)由 ConfigPage 把关,Stage-2/3(Q0 题目/提示)由 InterviewPage + 状态机新增 `warming` 态把关,两处复用**同一个** `WarmupOverlay` 组件保证视觉连续。

---

## Execution Order Master Table

### M10 — 面试预热统一加载(1 天,5 节点) — ★ 排在 M6.5 之前 ★

| # | 节点 | Lead | Parallel | Deps | Commit |
|---|---|---|---|---|---|
| 1 | **M10.1** `WarmupOverlay` 纯展示组件 | developer | yes | — | `feat(F-511): WarmupOverlay staged loading component` |
| 2 | **M10.2** runInterviewSession 一次性 `reference.started` 事件 | developer | yes | — | `feat(F-512): emit one-shot reference.started per turn` |
| 3 | **M10.3** interview-machine `warming` 态 + `REFERENCE_STARTED` | developer | yes | — | `feat(F-513): add warming state gating Q0 reference` |
| 4 | **M10.4** ConfigPage 接入 stage-1 预热屏 | developer | no | M10.1 | `feat(F-514): show warmup overlay during framework gen` |
| 5 | **M10.5** InterviewPage 整合(overlay + 8s 超时 + 事件分发) | developer | no | M10.1, M10.2, M10.3, M10.4 | `feat(F-515): gate interview view on Q0 + reference warmup` |

> Ralph 按 top-down 第一个未勾消费。M10 5 节点放在 M6.5 之前确保先做 M10。M10.1~M10.3 互不依赖可并行;M10.4 依赖 M10.1;M10.5 依赖前 4 节点。

---

## M10.1 · WarmupOverlay 纯展示组件

**Lead Agent**: developer
**Parallel-safe**: yes
**Deps**: —

**Goal.** 一个零状态、零 effect、零 async 的展示组件,渲染三段式阶段进度 + tips 轮播。ConfigPage 和 InterviewPage 复用同一个组件,跨页面导航视觉连续无闪烁。

**Files:**
- `apps/desktop/src/components/WarmupOverlay.tsx` (new) — 纯展示组件
- `apps/desktop/src/components/__tests__/WarmupOverlay.test.tsx` (new) — stage 1/2/3 各渲染态 + error 态 + onBack 回调

**Key Interfaces.**

```tsx
import { Spinner } from "@/components/Spinner";
import { TipsCarousel } from "@/components/TipsCarousel";   // 复用现有
import { selectTips } from "@/.../tips";                     // selectTips 忽略 context 参数,tips.ts 不改

interface Props {
  stage: 1 | 2 | 3;          // 当前已到达的最高阶段
  error?: string | null;     // 仅 stage 1 框架失败时有值
  onBack?: () => void;       // error 时显示「返回配置」
}

const STAGES = [
  { id: 1, active: "正在生成面试框架…",   done: "面试框架已就绪" },
  { id: 2, active: "正在准备开场问题…",   done: "开场问题已就绪" },
  { id: 3, active: "正在预热参考答案…",   done: "参考答案已接通" },
] as const;

export function WarmupOverlay({ stage, error, onBack }: Props): JSX.Element {
  // 居中卡片:标题「正在为你准备这场面试…」+ 副标题「通常 30~90 秒,请稍候。」
  //   复用 UploadPage 现有居中 loader 的 className/结构(parsing 态那块)
  // 三行清单:s.id < stage → ✓(var(--brand)) + done 文案
  //           s.id === stage → error ? (⚠ + error + onBack「返回配置」) : (<Spinner/> + active 文案)
  //           s.id > stage → 灰点 + active 文案(pending)
  // 底部:<TipsCarousel tips={selectTips("parsing", 0)} size="large" />
}
```

**Acceptance.**
- `cd apps/desktop && pnpm test -- WarmupOverlay` 全绿(≥ 5 case:stage=1 row1 spinner / stage=2 row1 ✓ row2 spinner / stage=3 row1+2 ✓ row3 spinner / error 时 row1 显示 error+返回按钮 / onBack 点击回调触发)
- 组件无 `useState`/`useEffect`/`fetch`(纯展示,review 确认)

**Commit.** `feat(F-511): WarmupOverlay staged loading component`

---

## M10.2 · runInterviewSession 一次性 reference.started 事件

**Lead Agent**: developer
**Parallel-safe**: yes
**Deps**: —

**Goal.** 在 reference「有生命迹象」(首个 stream chunk **或** 结构化 agent 返回,先到为准)时,每轮 emit **一次** `reference.started` 事件,供状态机判定「提示已接通」。现有 `reference.chunk/ready/streamComplete` 完全不动 → ReferencePanel 流式加粗动画零回归。

**Files:**
- `apps/desktop/src/core/sessions/runInterviewSession.ts` (modify) — 加事件类型 + `markReferenceStarted` 守卫

**Key Interfaces.**

```ts
// InterviewSessionEvent union 加:
| { type: "reference.started"; turnIndex: number }

// IIFE 作用域(void (async () => { ... })() 内,turns/turnIndex 同级):
const referenceStartedTurns = new Set<number>();
const markReferenceStarted = (idx: number): void => {
  if (referenceStartedTurns.has(idx)) return;
  referenceStartedTurns.add(idx);
  events.push({ type: "reference.started", turnIndex: idx });
};

// startStreamingDraft 的 for await 循环,首个 chunk push 前:
if (controller.signal.aborted) break;
markReferenceStarted(capturedTurnIndex);                 // ★ new
events.push({ type: "reference.chunk", turnIndex: capturedTurnIndex, delta: chunk });

// startReference 的 .then,push reference.ready 前:
markReferenceStarted(capturedTurnIndex);                 // ★ new(覆盖 stream 软失败)
events.push({ type: "reference.ready", turnIndex: capturedTurnIndex, payload: value });
```

**Acceptance.**
- `cd apps/desktop && pnpm test` 既有 runInterviewSession/session 相关测试不回归
- 新增/补充 1 个测试:模拟首个 chunk → 收到恰好 1 个 `reference.started`(同轮多 chunk 不重复 emit);模拟 stream 直接抛但 startReference resolve → 仍收到 1 个 `reference.started`
- review 确认 `reference.chunk/ready/streamComplete` 三个事件的 payload/时序未改

**Commit.** `feat(F-512): emit one-shot reference.started per turn`

---

## M10.3 · interview-machine warming 态 + REFERENCE_STARTED

**Lead Agent**: developer
**Parallel-safe**: yes
**Deps**: —

**Goal.** 状态机新增**唯一** 1 个状态 `warming` + 1 个事件 `REFERENCE_STARTED`。`ready` 收到 `SERVER_QUESTION` 后不再直接进 `user_answering`,而是先进 `warming`(此时 currentQuestion 已填好),等 `REFERENCE_STARTED` 才放行 → 保证揭幕时题目+提示同屏且提示已在流。

**Files:**
- `apps/desktop/src/statecharts/interview-machine.ts` (modify) — 事件 union + 1 个新状态
- `apps/desktop/src/statecharts/__tests__/interview-machine.warming.test.ts` (new) — warming 进出 + guard + 兜底事件

**Key Interfaces.**

```ts
// InterviewEvent union(~line 88)加:
| { type: "REFERENCE_STARTED"; turn_index: number }

// ready 态原 SERVER_QUESTION 的 target: "user_answering" 改为 target: "warming"
//   (保留原有 assign:currentQuestion / currentTurnIndex / referenceAnswer:null 等不变)

// 新增 warming 状态(置于 ready 与 user_answering 之间):
warming: {
  on: {
    REFERENCE_STARTED: {
      guard: ({ context, event }) =>
        event.type === "REFERENCE_STARTED" &&
        event.turn_index === context.currentTurnIndex,
      target: "user_answering",
    },
    END_SESSION: { target: "ended" },
    WS_ERROR: {
      target: "user_answering",
      actions: assign({
        error: ({ event }) =>
          event.type === "WS_ERROR" ? event.message : null,
      }),
    },
  },
},
// 顶层 on.SERVER_REFERENCE / SERVER_OBSERVATION(machine ~line 152)对所有态生效,
// warming 期间 reference chunk 照常累积,无需在 warming 内重复声明。
```

**Acceptance.**
- `cd apps/desktop && pnpm test -- interview-machine` 全绿(≥ 4 case:ready+SERVER_QUESTION→warming / warming+REFERENCE_STARTED(turn 匹配)→user_answering / warming+REFERENCE_STARTED(turn 不匹配)→停留 warming / warming+WS_ERROR→user_answering 带 error)
- 既有 interview-machine 测试不回归(原 ready→user_answering 直达的用例需同步改为 ready→warming→user_answering)

**Commit.** `feat(F-513): add warming state gating Q0 reference`

---

## M10.4 · ConfigPage 接入 stage-1 预热屏

**Lead Agent**: developer
**Parallel-safe**: no
**Deps**: M10.1

**Goal.** 点「开始面试」后,在 `await createSession()`(框架生成 40–90s)期间显示 `WarmupOverlay stage=1`,替换现有的 opacity 变灰。成功后置 stage=2 并 `navigate(..., { state:{ warming:true } })` 把进度交棒给 InterviewPage(视觉连续)。框架失败 → overlay 显示错误行 + 「返回配置」。

**Files:**
- `apps/desktop/src/pages/ConfigPage.tsx` (modify) — 提交处理(~153-168)+ 渲染早返回

**Key Interfaces.**

```tsx
const [warmStage, setWarmStage] = useState<1 | 2 | 3 | null>(null);
const [warmError, setWarmError] = useState<string | null>(null);

// 提交 handler(保留现有 setSubmitting / requestMicPermission 不动):
setWarmStage(1); setWarmError(null);
try {
  const response = await createSession({ /* 调用参数不变 */ });
  setWarmStage(2);                                   // stage1 done,交棒
  navigate(`/interview/${response.session_id}`, { state: { warming: true } });
} catch (err) {
  setWarmError(extractError(err));                   // overlay row1 显示 error
} finally {
  setSubmitting(false);
}

// 渲染:在原 body 渲染位置(AppShell 内)早返回,替换原 opacity:0.45 逻辑
if (warmStage !== null) {
  return (
    <WarmupOverlay
      stage={warmStage}
      error={warmError}
      onBack={() => { setWarmStage(null); setWarmError(null); }}
    />
  );
}
```

**Acceptance.**
- `cd apps/desktop && pnpm test` ConfigPage 相关测试不回归(若有 submit 流测试需适配 overlay)
- 手动:点开始面试 → 立即出现 WarmupOverlay row1 转圈「正在生成面试框架…」(不再是变灰);框架失败时 row1 显错误 + 返回配置,点击回到表单且选择保留,不跳 `/interview`
- review:原 opacity-dim 逻辑已删除(无残留)

**Commit.** `feat(F-514): show warmup overlay during framework gen`

---

## M10.5 · InterviewPage 整合(overlay + 8s 超时 + 事件分发)

**Lead Agent**: developer
**Parallel-safe**: no
**Deps**: M10.1, M10.2, M10.3, M10.4

**Goal.** InterviewPage 消费 `reference.started` → 派 `REFERENCE_STARTED`;`warming` 期间渲染 `WarmupOverlay`(stage 2/3);8s 超时兜底防卡死;历史/刷新重开(无 `location.state.warming`)单 tick 穿过 warming 不显 overlay。揭幕时面试体 + 已在流式的 ReferencePanel 一次性出现。

**Files:**
- `apps/desktop/src/pages/InterviewPage.tsx` (modify)

**Key Interfaces.**

```tsx
const WARMUP_REFERENCE_TIMEOUT_MS = 8000;   // 模块常量

const location = useLocation();
const isWarmupEntry = Boolean((location.state as { warming?: boolean } | null)?.warming);

// generator switch(~337-420)新增 case:
case "reference.started":
  send({ type: "REFERENCE_STARTED", turn_index: event.turnIndex });
  break;

// question.generated case 内、SERVER_QUESTION 之后:历史/刷新重开单 tick 穿过 warming
if (!isWarmupEntry) {
  send({ type: "REFERENCE_STARTED", turn_index: /* 该题 idx */ });
}

// 8s 兜底 effect:
useEffect(() => {
  if (!state.matches("warming")) return;
  const t = window.setTimeout(() => {
    send({ type: "REFERENCE_STARTED", turn_index: state.context.currentTurnIndex });
  }, WARMUP_REFERENCE_TIMEOUT_MS);
  return () => window.clearTimeout(t);
}, [state.value, state.context.currentTurnIndex, send]);

// overlay 渲染(置于 if(!sessionId) 占位返回附近):
const warmStage: 1 | 2 | 3 | null = !isWarmupEntry
  ? null
  : (state.matches("idle") || state.matches("connecting") || state.matches("ready"))
    ? 2
    : state.matches("warming")
      ? 3
      : null;
if (warmStage !== null) {
  return <WarmupOverlay stage={warmStage} error={state.context.error} />;
}
```

**Acceptance.**
- `cd apps/desktop && pnpm test` InterviewPage 相关测试不回归
- `cd apps/macos && xcodebuild build -scheme Eatit` 成功
- 手动(M10 退场前用户跑,见下「退场标准」7 场景)

**Commit.** `feat(F-515): gate interview view on Q0 + reference warmup`

---

## 不做项(显式记录,避免 ralph 自作主张)

**Q1 提示预热:不做。** Q1 *题目*已由 M9.2 `staticOpeningQuestion` + `registerSessionPrefetch` 的 `queue.prefetch(1,[])` 天然秒出。Q1 *提示*若在 Q0 期间并发,会与 Q0 reference 抢同一 `llm` singleton / ARK 配额,反而拖慢正在 gate 的 Q0 首 chunk 并触发 429。维持现状:用户提交 Q0 后现有 per-turn 管线即触发 Q1 提示,评分/过渡动画几秒已掩盖延迟。属 surgical 取舍,后续产品坚持再单开节点。

---

## 退场标准(EXIT_SIGNAL: true)

ralph 在以下条件全部达成时收口 M10:

1. M10.1 ~ M10.5 全部 [x](fix_plan.md 验证)
2. `cd apps/desktop && pnpm test` 全绿(新增 3 个测试文件:WarmupOverlay / interview-machine.warming / runInterviewSession reference.started 补测;既有 1730+ 测试不回归)
3. `cd apps/macos && xcodebuild build -scheme Eatit` 成功
4. 手动 acceptance(用户跑,不在 ralph 范围):
   1. 冷启动 happy path:点开始面试 → overlay 立现 row1 转圈;~40–90s 后 row1 ✓ 跳转、row2 无闪烁(tips 持续轮播);~1s row2 ✓ row3 转圈;1–3s 内 row3 ✓,面试界面出现且参考面板**正在流式加粗**(确认 mid-stream 非已流完)
   2. 慢 LLM:row3 约 8s 仍转 → 准时进面试,提示稍后流入,无报错无死锁,机在 user_answering
   3. 提示全失败:强制 reference 两路均抛 → 8s 超时进面试,题目可答,参考面板空态,无崩溃
   4. 框架失败:强制 FrameworkAgent 抛 → overlay row1 错误 + 返回配置,点回保留选择,不跳转
   5. 预热中途返回:row3 时浏览器后退 → 无 console 错误,无迟到 send 警告,generator 已 abort
   6. 历史重开:从历史打开旧 session → 不显 overlay,直接进面试
   7. 第二题延迟:答完 Q0 提交 → Q1 题目秒现,Q1 提示稍后流入(符合「不做项」)

完成后才能推进 M6.5(App Store Archive 上传)。
