# v3.2+ P2/M3 Sections — Coach + Dashboard + Reflection 复盘报告

P2 / M3 = **跨场次成长追踪 + 教学版复盘**(老板 F-322 最后的需求)。共 **8 节点**,分两段:M3.1(Coach + Dashboard,5 节点)+ M3.2(Reflection,3 节点)。

所有节点遵守 [v32-p2-constraints.md](v32-p2-constraints.md) + [v32-p1-constraints.md](v32-p1-constraints.md) + [v32-p0-constraints.md](v32-p0-constraints.md) 全部红线。

## Execution order

| # | Section | Deps | Commit prefix |
|---|---|---|---|
| 1 | **V32.M3.1.1 Coach Agent + UserInsightCache schema** | — | `feat(F-318): Coach Agent + UserInsightCache schema + 教学语气护栏` |
| 2 | **V32.M3.1.2 post_report_graph + asyncio fire-and-forget** | M3.1.1 | `feat(F-318): post_report_graph coach_node + async trigger from report task` |
| 3 | **V32.M3.1.3 user_insight_cache 表 + GET /users/me/insights API** | M3.1.1, 2 | `feat(F-318): user_insight_cache alembic migration + insights GET API` |
| 4 | **V32.M3.1.4 Dashboard 整版重写** | M3.1.3 | `feat(F-316): Dashboard with StatCards + AICoach card + filter tabs + 6-col table` |
| 5 | **V32.M3.1.5 "复用上次配置" + 底部 CTA** | M3.1.4 | `feat(F-316): reuse-last-config skip-upload + history bottom CTA bar` |
| 6 | **V32.M3.2.1 Reflection Agent + ReflectionReport schema** | M3.1.* done | `feat(F-322): Reflection Agent + 教学语气护栏 + L0 条款 12 fuzz` |
| 7 | **V32.M3.2.2 post_report_graph 加 reflection_node + 表 + API** | M3.2.1, M3.1.2 | `feat(F-322): reflection_node parallel coach + reflection_reports table + API` |
| 8 | **V32.M3.2.3 ReportPage segment tab + ReflectionView** | M3.2.2 | `feat(F-322): ReportPage [评估] [详细复盘] tabs + ReflectionView state machine` |

---

## V32.M3.1.1 — Coach Agent + UserInsightCache schema

**Goal.** 新增 Coach Agent(第 9 个 Agent),输入近 N 场 InterviewReport + CandidateProfile,输出 UserInsightCache。教学语气护栏严守 L0(不评判式)。

**Files (new):**
- `apps/api/app/agents/coach/__init__.py`
- `apps/api/app/agents/coach/schemas.py` — `CoachAgentInput / CoachAgentOutput / UserInsightCache`
- `apps/api/app/agents/coach/service.py` — Service 层 + 教学语气负面词扫描
- `apps/api/app/prompts/coach/system.j2` — Prompt 模板,**严禁**评判式表述
- `apps/api/tests/agents/test_coach_ethics.py` — 教学语气 fuzz(12 个负面词类似 F-314)

**Files (modify):**
- `apps/api/app/agents/__init__.py` 或 AGENT_NAMES 常量 — 加 "coach" 到 AGENTS 集合(8 → 9)
- `packages/shared-types/src/index.ts` — 同步 UserInsightCache 类型

**Key Interfaces.**

```python
# apps/api/app/agents/coach/schemas.py
from typing import Literal
from datetime import datetime
from pydantic import BaseModel, Field
from app.models.enums import InterviewDirectionV32

class CoachAgentInput(BaseModel):
    user_id: str
    recent_reports: list[dict]  # 最近 N 场 InterviewReportPayload(N≥3)
    candidate_profile: dict | None = None
    model_config = {"extra": "forbid"}  # L0 隐私(不接受 PII)

class UserInsightCache(BaseModel):
    user_id: str
    based_on_session_count: int = Field(ge=3)  # < 3 不应调 Coach
    based_on_last_session_id: str  # 幂等检测
    headline: str = Field(max_length=80)  # 一句推荐(用于 Stat Cards 顶部)
    headline_detail: str = Field(max_length=240)
    recurring_weaknesses: list[str] = Field(min_length=0, max_length=5)
    improvement_signals: list[str] = Field(default_factory=list, max_length=5)
    next_focus_areas: list[InterviewDirectionV32] = Field(min_length=0, max_length=3)
    generated_at: datetime
    status: Literal["pending", "running", "ok", "failed", "skipped"] = "ok"

class CoachAgentOutput(UserInsightCache):
    pass
```

**Coach Prompt 关键约束**(在 system.j2):

```
## 教学语气护栏(L0 条款 12)
严禁评判式表述。禁止词:
- 不建议 / 不推荐 / 建议放弃 / 你不适合 / 差距很大 / 不合格

输出风格:
- ✅ "建议在 X 维度补强,可针对 Y 类问题练 3 场"
- ❌ "你不适合这个岗位"

headline 必须建设性(如 "继续深耕数据驱动方向" 而非 "你的弱项太多")。
```

**Acceptance** (从 `apps/api/`):

```bash
unset VIRTUAL_ENV
uv run python -m pytest tests/agents/test_coach_ethics.py -v  # ≥ 8 passed(12 个 fuzz + edge case)
uv run python -m pytest -q  # 全量 ≥ 385
```

**Commit.** `feat(F-318): Coach Agent + UserInsightCache schema + 教学语气护栏`

---

## V32.M3.1.2 — post_report_graph + asyncio fire-and-forget

**Goal.** 新建 `post_report_graph.py`(独立 LangGraph,起初单 `coach_node`,M3.2 加 reflection_node);`reports/service.py._generate_report_task` 末尾追加 `asyncio.create_task` 异步触发 Coach。

**Files (new):**
- `apps/api/app/orchestrator/post_report_graph.py` — `coach_node`,场次 < 3 时跳过
- `apps/api/app/domain/coach/__init__.py` 与 `apps/api/app/domain/coach/service.py` — `CoachService.maybe_trigger_after_report(user_id, last_session_id)` 幂等触发
- `apps/api/tests/orchestrator/test_post_report_graph_contract.py` — 节点名锁 `{"coach_node"}`(M3.2.2 后会扩到 `{"coach_node", "reflection_node"}`)
- `apps/api/tests/domain/test_coach_trigger.py` — 场次<3 跳过 / fire-and-forget 不阻塞 / Coach 失败 report 仍 ok

**Files (modify):**
- `apps/api/app/domain/reports/service.py._generate_report_task` 末尾追加:
  ```python
  asyncio.create_task(coach_service.maybe_trigger_after_report(user_id, session_id))
  ```
- 注意:`asyncio.create_task` 必须在 report status 写完 ok 之后,且**不 await**(fire-and-forget)

**Key Interfaces:**

```python
# apps/api/app/domain/coach/service.py
async def maybe_trigger_after_report(self, user_id: str, last_session_id: str):
    sessions = await self._repo.list_recent_reports(user_id, limit=5)
    if len(sessions) < 3:
        await self._repo.upsert_skipped(user_id, last_session_id)
        return  # 跳过,不调 LLM
    cache = await self._repo.get(user_id)
    if cache and cache.based_on_last_session_id == last_session_id:
        return  # 幂等:已基于这次 session 跑过
    await self._repo.upsert_running(user_id, last_session_id)
    try:
        result = await CoachAgentService().run(...)
        await self._repo.upsert_ok(user_id, result)
    except Exception as e:
        logger.warning("coach_failed", extra={"user_id": user_id, "error": str(e)})
        await self._repo.upsert_failed(user_id, last_session_id)
```

**Acceptance:**

```bash
cd apps/api
uv run python -m pytest tests/orchestrator/test_post_report_graph_contract.py tests/domain/test_coach_trigger.py -v  # ≥ 5 passed
uv run python -m pytest -q  # 全量 ≥ 390

# 关键:turn_graph 节点名锁不动
uv run python -m pytest tests/orchestrator/test_graph_contract.py -v
```

**Commit.** `feat(F-318): post_report_graph coach_node + async trigger from report task`

---

## V32.M3.1.3 — user_insight_cache 表 + GET /users/me/insights API

**Goal.** Alembic 迁移 user_insight_cache 表(based_on_last_session_id 幂等)+ GET API 路由。

**Files (new):**
- `apps/api/alembic/versions/mainline/<YYYYMMDD>_<NNNN>_user_insight_cache.py`
- `apps/api/app/models/user_insight_cache.py` — SQLAlchemy model
- `apps/api/app/repositories/user_insight_cache.py` — `get / upsert_*` methods
- `apps/api/app/api/routes/users_insights.py` — GET /api/v1/users/me/insights
- `apps/api/tests/api/test_users_insights_api.py` — API 层测试(场次<3 空态 + ok 渲染)

**Files (modify):**
- `apps/api/app/api/main.py`(或 router 注册处)— 注册 users_insights 路由

**Acceptance:**

```bash
cd apps/api
uv run alembic upgrade head  # migration 不报错
uv run python -m pytest tests/api/test_users_insights_api.py -v  # ≥ 5 passed
uv run python -m pytest -q  # ≥ 395
```

**Commit.** `feat(F-318): user_insight_cache alembic migration + insights GET API`

---

## V32.M3.1.4 — Dashboard 整版重写

**Goal.** PRD §6.4 — HistoryPage 从 v3.1 简单列表升级为 Dashboard:StatCards×4 + AI 推荐卡(linear-gradient)+ 筛选 segment tabs + 表格 grid 6 列。

**Files (new):**
- `apps/desktop/src/pages/history/StatCard.tsx` — value(serif 30px)+ eyebrow + sub
- `apps/desktop/src/pages/history/AICoachCard.tsx` — linear-gradient brand-softer + sparkle + headline + 双按钮("查看弱项清单" + "发起专项训练")
- `apps/desktop/src/pages/history/FilterTabs.tsx` — 4 个 tab(全部 / 已完成 / 未完成 / 已标记)
- `apps/desktop/src/pages/history/SessionTable.tsx` — grid 6 列(岗位·风格 / 日期 / 时长 / 评分 / 弱项 / 操作)
- `apps/desktop/src/__tests__/StatCard.test.tsx`、`AICoachCard.test.tsx`、`FilterTabs.test.tsx`、`SessionTable.test.tsx`(各 3-5 测试)

**Files (modify):**
- `apps/desktop/src/pages/HistoryPage.tsx` — **整版重写**接入 4 个新组件;读 `/users/me/insights` 渲染 AICoachCard
- `apps/desktop/src/api/client.ts` 或类似 — `getUserInsights()` API client
- `apps/desktop/src/stores/app-store.ts` — `insights: UserInsightCache | null` 字段

**降级**:`insights === null` 或 `based_on_session_count < 3` → AICoachCard 隐藏(或显示进度引导卡 "已完成 N/3 场,再完成 M 场解锁 AI 成长洞察")

**Acceptance:**

```bash
cd apps/desktop
corepack pnpm test -- --run  # 全量 ≥ 125 passed(108 + ~17 新)
corepack pnpm exec tsc --noEmit
corepack pnpm lint
corepack pnpm lint:design-tokens
corepack pnpm build  # vite build OK
```

**Commit.** `feat(F-316): Dashboard with StatCards + AICoach card + filter tabs + 6-col table`

> ⚠️ 此节点是 M3 工程量最大节点。如 timeout,拆为 M3.1.4a(StatCards + FilterTabs)+ M3.1.4b(AICoachCard + SessionTable)。

---

## V32.M3.1.5 — "复用上次配置" + 底部 CTA bar

**Goal.** HistoryPage 底部加 CTA bar:"复用上次配置" + "+ 全新面试"。点"复用上次配置"跳过 upload 直接到 config_ready 状态(沿用最近一场的 InterviewConfig)。

**Files (new):**
- `apps/desktop/src/pages/history/HistoryFooterCTA.tsx`(简单组件)
- `apps/desktop/src/__tests__/HistoryFooterCTA.test.tsx`

**Files (modify):**
- `apps/desktop/src/stores/app-store.ts` — 加 `reuseLastConfig()` action(从最近一场 session 的 config_snapshot 拷贝到当前 upload state,并标记 skipUpload)
- `apps/desktop/src/pages/UploadPage.tsx` 或 routing — 检测 `skipUpload === true` 时跳转 ConfigPage

**Acceptance:** 3+ 测试 passed,全量前端 ≥ 128 passed。

**Commit.** `feat(F-316): reuse-last-config skip-upload + history bottom CTA bar`

---

## V32.M3.2.1 — Reflection Agent + ReflectionReport schema(老板新需求 F-322)

**Goal.** 新增 Reflection Agent(第 10 个 Agent),输入完整 InterviewReport + Turns + ParseResult + ResearchResult(若有);输出 ReflectionReport(教学版深度复盘)。**严守 L0 条款 12 教学语气护栏**。

**Files (new):**
- `apps/api/app/agents/reflection/__init__.py`
- `apps/api/app/agents/reflection/schemas.py` — `ReflectionReport / PerQuestionCoaching / DialogueTurn`
- `apps/api/app/agents/reflection/service.py`
- `apps/api/app/prompts/reflection/system.j2` — Prompt **硬约束**:不重复 Report 已说的评价 + 教学语气
- `apps/api/tests/agents/test_reflection_ethics.py` — 教学语气 fuzz(diagnosis 字段 + mistakes_to_avoid 句式 + general_growth_advice 建设性)
- `apps/api/tests/agents/test_reflection_no_overlap.py` — 后置 regex:Reflection.diagnosis 不含 Report.ai_verdict 的核心评价词

**Files (modify):**
- `apps/api/app/agents/__init__.py` — AGENT_NAMES 加 "reflection"(9 → 10)
- `packages/shared-types/src/index.ts` — 同步 ReflectionReport 类型

**Reflection Prompt 关键约束**(在 system.j2):

```
## 教学语气护栏(L0 条款 12)
1. diagnosis 字段:不评判("结构不清晰" ❌ → "可加强 STAR 框架" ✅)
2. mistakes_to_avoid:用"建议下次"句式("你犯了 X" ❌ → "建议下次注意 X" ✅)
3. general_growth_advice:必须建设性,3-5 点具体行动
4. 严禁与 Report.ai_verdict 重复评价(后端会做 regex 扫描)

## 与 Report 区分
- Report = 评估(给分)
- Reflection = 教学(给指导)
- per_question_coaching 重点覆盖 tone=warn 的题
```

**Acceptance:**

```bash
cd apps/api
uv run python -m pytest tests/agents/test_reflection_ethics.py tests/agents/test_reflection_no_overlap.py -v  # ≥ 10 passed
uv run python -m pytest -q  # ≥ 405
```

**Commit.** `feat(F-322): Reflection Agent + 教学语气护栏 + L0 条款 12 fuzz`

---

## V32.M3.2.2 — post_report_graph 加 reflection_node + reflection_reports 表 + API

**Goal.** post_report_graph 加 `reflection_node`,**与 coach_node 并行**(无依赖);新增 `reflection_reports` 表 + GET /api/v1/sessions/{id}/reflection 路由。

**Files (new):**
- `apps/api/alembic/versions/mainline/<YYYYMMDD>_<NNNN>_reflection_reports.py`
- `apps/api/app/models/reflection_report.py` — SQLAlchemy model
- `apps/api/app/repositories/reflection_reports.py` — `get / upsert_*`
- `apps/api/app/api/routes/reflections.py` — GET /api/v1/sessions/{id}/reflection
- `apps/api/app/domain/reflection/service.py` — `ReflectionService.trigger_after_report`
- `apps/api/tests/api/test_reflection_api.py` — API 层(pending/ok/failed 状态)

**Files (modify):**
- `apps/api/app/orchestrator/post_report_graph.py` — 加 `reflection_node`,与 `coach_node` 并行(`add_edge(START, "coach_node")` + `add_edge(START, "reflection_node")`)
- `apps/api/app/domain/reports/service.py._generate_report_task` 末尾追加 `asyncio.create_task(reflection_service.trigger_after_report(...))`(与 Coach 同步触发)
- `apps/api/tests/orchestrator/test_post_report_graph_contract.py` — 节点名锁更新为 `{"coach_node", "reflection_node"}`

**Acceptance:**

```bash
cd apps/api
uv run alembic upgrade head
uv run python -m pytest tests/api/test_reflection_api.py tests/orchestrator/test_post_report_graph_contract.py -v  # ≥ 6 passed
uv run python -m pytest -q  # ≥ 412
```

**Commit.** `feat(F-322): reflection_node parallel coach + reflection_reports table + API`

---

## V32.M3.2.3 — ReportPage segment tab + ReflectionView 组件

**Goal.** ReportPage 顶部加 segment tab `[评估报告] [详细复盘]`;`详细复盘` tab 渲染 ReflectionView(状态机:pending → 显示 TipsCarousel "正在为你撰写详细复盘..." / ok → 渲染 / failed → 降级提示)。

**Files (new):**
- `apps/desktop/src/pages/report/SegmentTabs.tsx` — segment control(基于 .tile 共享类的扩展)
- `apps/desktop/src/pages/report/ReflectionView.tsx` — 顶级容器
- `apps/desktop/src/pages/report/PerQuestionCoachingCard.tsx` — 折叠卡(question + your_answer + diagnosis + outline + key_phrases + mistakes_to_avoid)
- `apps/desktop/src/pages/report/MockDialogue.tsx` — 对话气泡(interviewer / candidate)
- `apps/desktop/src/__tests__/ReflectionView.test.tsx`(状态机 pending/ok/failed)
- `apps/desktop/src/__tests__/PerQuestionCoachingCard.test.tsx`、`MockDialogue.test.tsx`

**Files (modify):**
- `apps/desktop/src/pages/ReportPage.tsx` — 顶部加 SegmentTabs;切换"详细复盘"时渲染 ReflectionView
- `apps/desktop/src/api/client.ts` — `getReflection(sessionId)` API client(轮询模式,与 reports 一致)
- `apps/desktop/src/stores/app-store.ts` — `reflection: ReflectionReport | null` 字段

**降级**:Reflection.status === "failed" 时显示 "复盘报告生成失败,稍后再试 [重试]" 按钮(重试调 POST 触发?或仅静态提示)。

**Acceptance:**

```bash
cd apps/desktop
corepack pnpm test -- --run  # ≥ 138 passed(128 + ~10 新)
corepack pnpm exec tsc --noEmit
corepack pnpm lint
corepack pnpm lint:design-tokens
corepack pnpm build
```

**Commit.** `feat(F-322): ReportPage [评估] [详细复盘] tabs + ReflectionView state machine`

---

## P2/M3 完工后

完成 8 节点后,Eatit v3.2+ 全部 P0 + P1 + P2 节点共 41 个 ✅。F-ID 落地 21 个(F-301~F-322 全部老板新需求都到位)。

下一阶段 M4(配额 + E2E + 性能基线 + shadcn 残余清理,~4 节点)是收尾节点,需要新 spec(`v32-p3-sections.md`)。

**M3 完工后用户能做什么**(完整 demo 路径):

1. 上传简历+JD → 看到公司洞察 + 行业洞察 + 预测题库(F-320/321 from M2.3)
2. 配置面试 4+6+3 → 实时面试(Persona / 追问 / 观察 / 统计 / 快捷键)
3. 完成报告 → Hero "中上/中/中下"(F-314)+ 五维度评分 + 单题分 + 专项训练 CTA
4. **切到[详细复盘] tab → 看 Reflection 教学版(F-322 新需求)**
5. 累积 ≥3 场后 → **Dashboard 显示 StatCards + AI 推荐卡(F-316/F-318)**

---

## V32.M3.X — M3 audit-fix(补 G1/G2 双测试)

**Goal.** 2026-05-01 凌晨 tester 复审 M3 评分 8.5/10,**4 条核心数据流全部真实接通,无 🔴 必修**。本节点只补 2 个 🟡 测试覆盖空洞,使 M3 push main 前测试质量达 9.5/10。

> ⚠️ 与 M2.1.X / M2.2.X / M2.3.X audit-fix 不同:本次**只补测试,不动产品代码**(类似 M2.1.X 补测试空壳)。

### 缺口清单(只修 2 个 🟡)

- **G1**:`tests/api/test_reports_api.py` 缺"fire-and-forget 不阻塞 report READY"显式断言 — Coach trigger 抛异常时 report status 仍应 READY,但当前测试没显式验证这条隔离 contract
- **G2**:`apps/desktop/src/__tests__/` 没有 HistoryPage 集成测试 — `getUserInsights` 调用路径、204→empty-state、ok/running/failed 三态分支 均无前端测试覆盖

🟡 G4(overlap 扫描覆盖 summary)+ 🟢 G3/G5/G6/G7 + 🟡 G8(场次阈值竞态)留作 M4 一起处理或推到后续。

### Files (new):

- `apps/api/tests/api/test_reports_post_report_isolation.py` — G1:用 monkeypatch 替换 `_spawn_post_report_coach_trigger` 抛 RuntimeError,断言 report `_generate_report_task` 完成后 status 仍 READY,且 trigger 抛错被 logger.warning 捞住
- `apps/desktop/src/__tests__/HistoryPage.test.tsx` — G2:覆盖 4 路径:
  - `getUserInsights` 返回 null(204)→ AICoachCard 隐藏
  - `getUserInsights` 返回 status=ok → AICoachCard 渲染 headline / headline_detail / recurring_weaknesses
  - `getUserInsights` 返回 status=running → AICoachCard 显示"分析中"占位
  - `getUserInsights` 返回 status=failed → AICoachCard 显示"分析失败,稍后重试"占位

### Files (NOT modified — 严格不动产品代码):

- 严禁修改任何 `apps/api/app/**/*.py`(后端业务代码)
- 严禁修改任何 `apps/desktop/src/**` 下的非测试文件(组件 / hook / lib 实现)
- 本节点**只补测试**,不改产品行为

### Key Interfaces.

```python
# apps/api/tests/api/test_reports_post_report_isolation.py
"""G1: fire-and-forget Coach/Reflection trigger does NOT block report READY status.

Even when post-report triggers raise, _generate_report_task must:
1. Return successfully
2. Set report status to READY
3. Log warning (no upstream propagation)
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_report_ready_even_when_coach_trigger_raises(...):
    """Coach trigger 抛 RuntimeError,report status 仍 READY."""
    with patch("app.domain.reports.service._spawn_post_report_coach_trigger",
               side_effect=RuntimeError("simulated coach failure")):
        # ... setup session, run _generate_report_task
        # ... assert report.status == "READY"
        # ... assert coach exception was caught + logged WARNING
        pass

@pytest.mark.asyncio
async def test_report_ready_even_when_reflection_trigger_raises(...):
    """Reflection trigger 抛 ValueError,report status 仍 READY."""
    # ... 同上,镜像 reflection trigger
    pass
```

```typescript
// apps/desktop/src/__tests__/HistoryPage.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { HistoryPage } from '@/pages/HistoryPage'

vi.mock('@/api/usersInsights', () => ({
  getUserInsights: vi.fn(),
}))

describe('HistoryPage AICoachCard integration', () => {
  it('hides AICoachCard when getUserInsights returns null (204)', async () => {
    (getUserInsights as Mock).mockResolvedValue(null)
    render(<HistoryPage />)
    await waitFor(() => {
      expect(screen.queryByTestId('ai-coach-card')).toBeNull()
    })
  })

  it('renders AICoachCard with headline when status=ok', async () => {
    (getUserInsights as Mock).mockResolvedValue({
      status: 'ok',
      headline: '建议继续深耕数据驱动方向',
      headline_detail: '...',
      recurring_weaknesses: ['x'],
      next_focus_areas: ['data-driven'],
      based_on_session_count: 5,
    })
    render(<HistoryPage />)
    await waitFor(() => {
      expect(screen.getByText(/建议继续深耕数据驱动方向/)).toBeTruthy()
    })
  })

  it('shows analyzing placeholder when status=running', async () => { /* ... */ })
  it('shows failed placeholder when status=failed', async () => { /* ... */ })
})
```

### Acceptance:

```bash
cd apps/api
unset VIRTUAL_ENV
uv run python -m pytest tests/api/test_reports_post_report_isolation.py -v
# ≥ 2 passed
uv run python -m pytest -q
# 全量 ≥ 471(469 + 2)

cd ../desktop
corepack pnpm test src/__tests__/HistoryPage.test.tsx -- --run
# 4 passed
corepack pnpm test -- --run
# 全量 ≥ 160(156 + 4)
corepack pnpm exec tsc --noEmit
corepack pnpm lint
corepack pnpm lint:design-tokens
```

### Commit:

`test(audit): M3 audit-fix — fire-and-forget isolation + HistoryPage integration`

提交 body 必须含:
- G1 补 reports 隔离测试(2 case:Coach + Reflection trigger raise → report still READY)
- G2 补 HistoryPage 集成测试(4 case:null / ok / running / failed)
- 不动产品代码声明
- 测试套总数变化(后端 469→471 / 前端 156→160)

### 完工后

M3 完整收尾(8 主节点 + 1 audit-fix)。下一阶段 M4(配额 + Playwright E2E + locust 性能 + shadcn 残余清理,~4 节点)需要新 spec `v32-p3-sections.md`。

预期 M4 完工后 v3.2+ 全部 ~45 节点 100% 收官,达到对外发布门槛。
