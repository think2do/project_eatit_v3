# v3.2+ P1/M2 Hard Constraints (M2.1 实时面试增强不可违反)

These are the architecture red lines for the **v3.2+ P1 / M2.1 batch** —
实时面试增强(F-306/F-309/F-310/F-311 + InterviewPage 顶部重构)。

**所有 [v32-p0-constraints.md](v32-p0-constraints.md) 的红线(A 架构 / B 工程 / C Secrets / D 设计系统 / E 迁移 / F 测试 / G 文档)继续生效**,本文件只补 M2.1 阶段的增量红线。

> ⚠️ M2.3 老板新需求(F-320/F-321 联网情报 + 题目预测)在另一批跑,届时新建 v32-p1b-constraints.md(含 L0 条款 11 联网隐私护栏)。本文件不涉及联网。

---

## A. Architecture(继承 P0 + 新增)

### A12 — `live_observation` 输出约束(F-309 新增)

**适用**:`InterviewerAgentOutput.live_observation` 字段。

- **长度**:`≤ 30 字`(Pydantic Field 校验,违规自动拒绝;比 Observer Agent 现有的 60 字更严)
- **首轮特殊**:`turn_index == 0` 时 `live_observation = None`(没有上一轮可观察)
- **教学语气**:不得评判式
  - ❌ "你回答得很差"
  - ❌ "缺乏深度"
  - ✅ "结构清晰,但优先级判断一带而过"
  - ✅ "举例具体,数据有支撑"

### A13 — Observer Agent 双轨 fallback 保留

PRD v3.2 Interviewer Agent 一次输出 `live_observation`(M2.1.1 实施)是首选。但 v3.1 已有的独立 Observer Agent + WS 事件 `server.coach.observation` **保留作 fallback**:

- `NextQuestion.live_observation` 字段非 null → 前端 `LiveObservationCard` 优先用此值
- `NextQuestion.live_observation` 字段是 null → 前端 listen `server.coach.observation` WS 事件兜底

不得删除 Observer Agent(L0 不删 schema/Agent)。

---

## B. Engineering(继承 P0)

继承 [v32-p0-constraints.md §B](v32-p0-constraints.md) 1-6 条。

---

## C. Secrets(继承 P0)

继承 [v32-p0-constraints.md §C](v32-p0-constraints.md)。

---

## D. Design System(继承 P0 + 强化使用)

继承 [v32-p0-constraints.md §D](v32-p0-constraints.md) D1-D5。

### D6 — M2.1 必须复用 P0 落地的共享 className(强化)

P0 阶段 M0.1a-f 已经在 `apps/desktop/src/index.css @layer components` 落地了 21 个共享 className(.btn / .card / .tag / .tile / .kbd / .input / .bar / .row / .col / .between / .h1 / .h2 / .h3 / .body / .muted 等)。

**M2.1 新增的所有组件必须直接 className 引用**:

```tsx
// ❌ 严禁
<div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px', borderBottom: '1px solid var(--line)' }}>...</div>

// ✅ 复用
<div className="row card-header">...</div>
```

落地新组件之前,先 grep 确认 `apps/desktop/src/index.css` 里有没有现成 className,有就直接用。

---

## E. Migration(继承 P0)

继承 [v32-p0-constraints.md §E](v32-p0-constraints.md)。M2.1 不涉及 Schema 大改,InterviewerAgentOutput 加新字段 `live_observation` 是只增不改。

---

## F. v3.2 P1/M2.1 Test Coverage Floor

| 测试 | 文件 | 必过 |
|---|---|---|
| live_observation ≤ 30 字 + 首轮 None + 教学语气样例 | `tests/agents/test_live_observation.py` | ✅ |
| TurnStats 字数计数与 ASR final 一致 | `apps/desktop/src/__tests__/useTurnStats.test.ts`(M2.1.2 起 Vitest)| ✅ |
| useGlobalKeymap input/textarea focus 时不响应 | `apps/desktop/src/__tests__/useGlobalKeymap.test.ts` | ✅ |
| TipsCarousel 自动切换 + "已完成 ✓" 过渡 | `apps/desktop/src/__tests__/TipsCarousel.test.tsx` | ✅ |
| TurnStats 填充词列表 = 7 个固定词 | `apps/desktop/src/__tests__/fillerWords.test.ts` | ✅ |

---

## G. PRD 与 AGENTS.md 同步

每个 M2.1 节点完成后,commit body 必须列出:

- `F-XXX:` 一句话变更
- 涉及 PRD 章节(如 PRD §6.3 InterviewPage 实时观察侧栏)
- 涉及 AGENTS.md 段落(如 §2 Agent 9 个的 Interviewer 行新加 `live_observation` 输出)

文档增量(FEATURES.md / ROADMAP.md)在 ralph 跑完 M2.1 全批后人工统一更新。

---

## 节点拆分纪律(实战经验,2026-04-30 P0 总结)

> P0 V32.M0.1 第一次跑触发 Anthropic API stream idle timeout($1.38),拆 6 子节点后零失败。本批节点遵守同样原则:

- 单节点 ≤ 200 行 / ≤ 8 文件
- spec ≤ 100 行 markdown(本 sections.md 中每节)
- 后端 schema + 前端 UI + 测试三件套要么是同一节点小做(纯前端 hook),要么拆"后端"+"前端"两个 loop(Schema 重构)

M2.1 节点设计上每个 ≤ 5 个文件,~80-150 行代码,符合纪律。
