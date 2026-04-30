# v3.2+ P2/M3 Hard Constraints (Coach + Reflection + Dashboard)

These are the architecture red lines for **v3.2+ P2 / M3** —
跨场次 Coach Agent + Dashboard 整版重写 + Reflection 复盘报告(老板新需求 F-322)。

**所有 [v32-p1-constraints.md](v32-p1-constraints.md) + [v32-p0-constraints.md](v32-p0-constraints.md) 的红线继续生效**,本文件只补 M3 阶段的增量红线。

---

## A. Architecture(继承 P0/P1 + 新增)

### A14 — Coach Agent 必须异步,不阻塞主流程

PRD §0.4 + AGENTS.md 第 6 节红线第 3 条:Coach Agent 必须在 report 完成后**异步运行**,不在记录页打开时实时调用。

**实现约束**:
- 触发方式:`asyncio.create_task` fire-and-forget(不引入 Celery)
- 调用位置:`apps/api/app/domain/reports/service.py._generate_report_task` **末尾**追加,**在 report status 已经 ok 之后**(不影响 report 主流程)
- 失败影响域:Coach 失败完全不影响主流程,Dashboard 降级为静态空态
- 场次 < 3 时跳过运行(节省 token,Coach 输出无意义)
- Dashboard GET /users/me/insights 时检测 `last_session_id` 不一致 → 主动重跑(幂等)

### A15 — Reflection Agent 必须异步,不阻塞 Report

PRD v3.3 addendum §4 + AGENTS.md L0:Reflection 与 Coach 同样异步。

**实现约束**:
- post_report_graph 加 reflection_node,**与 coach_node 并行**(无依赖)
- ReportPage segment tab 切换"详细复盘"时显示 pending state(Tips 过场)
- Reflection 失败不影响 Report 主流程

### A16 — post_report_graph 是独立 LangGraph,不动 turn_graph

`turn_graph` 节点集合锁(`{turn_assessment, compression, interviewer/next_question}`)继续生效(L0 A7)。

`post_report_graph` 是 v3.2 引入的新 graph,M3.1 起初有 `coach_node`,M3.2 加 `reflection_node` 与之并行。

**节点名锁**:
- `POST_REPORT_GRAPH_NODES = {"coach_node", "reflection_node"}`(M3.2 后)
- 测试:`tests/orchestrator/test_post_report_graph_contract.py` 守住

### A17 — UserInsightCache 与 ReflectionReport 数据契约

**UserInsightCache schema**(M3.1.1 落地):
```python
class UserInsightCache(BaseModel):
    user_id: str
    based_on_session_count: int  # 用于场次<3 跳过 + Dashboard 降级判断
    based_on_last_session_id: str  # 幂等检测
    headline: str = Field(max_length=80)
    headline_detail: str = Field(max_length=240)
    recurring_weaknesses: list[str] = Field(min_length=0, max_length=5)
    improvement_signals: list[str] = Field(default_factory=list, max_length=5)
    next_focus_areas: list[InterviewDirectionV32] = Field(min_length=0, max_length=3)
    generated_at: datetime
    status: Literal["pending", "running", "ok", "failed", "skipped"]
```

**ReflectionReport schema**(M3.2.1 落地):
```python
class PerQuestionCoaching(BaseModel):
    turn_index: int
    question: str = Field(max_length=300)
    your_answer_summary: str = Field(max_length=300)
    diagnosis: str = Field(max_length=300)  # 教学语气,A12 类似但更严
    model_answer_outline: list[str] = Field(min_length=2, max_length=5)
    key_phrases_to_use: list[str] = Field(min_length=2, max_length=5)
    mistakes_to_avoid: list[str] = Field(min_length=1, max_length=4)
    recommended_resources: list[str] = Field(default_factory=list, max_length=3)

class DialogueTurn(BaseModel):
    role: Literal["interviewer", "candidate"]
    text: str = Field(max_length=200)

class ReflectionReport(BaseModel):
    report_id: str
    session_id: str
    executive_summary: str = Field(max_length=400)
    per_question_coaching: list[PerQuestionCoaching]
    general_growth_advice: str = Field(max_length=300)
    mock_followup_dialogue: list[DialogueTurn] = Field(default_factory=list, max_length=12)
    generated_at: datetime
    status: Literal["pending", "running", "ok", "failed"]
```

---

## B-D. 继承 P0/P1 红线

继承 [v32-p1-constraints.md](v32-p1-constraints.md) §B 工程纪律 / §C Secrets / §D Design System / §E Migration。

特别强调:
- D6 强化共享 className 复用(M3.1.4 Dashboard 整版重写时)
- A10 数据契约只增不改(MetaReport L1 已实现保留,Coach 是新 Agent 与之并行)
- A11 联网情报隐私护栏(M3 不涉及联网,但 Reflection 输出不得包含简历正文片段以外的联网内容)

---

## E. Migration

### E3 — `user_insight_cache` 表(M3.1.3 引入)

```sql
CREATE TABLE user_insight_cache (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  based_on_session_count INT NOT NULL,
  based_on_last_session_id UUID NOT NULL,
  payload JSON NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'ok', 'failed', 'skipped')),
  generated_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_uic_user_session ON user_insight_cache(user_id, based_on_last_session_id);
```

### E4 — `reflection_reports` 表(M3.2.2 引入)

```sql
CREATE TABLE reflection_reports (
  report_id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES interview_sessions(id),
  payload JSON NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'ok', 'failed')),
  generated_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_rr_session ON reflection_reports(session_id);
```

---

## F. v3.2 P2/M3 Test Coverage Floor

| 测试 | 文件 | 必过 |
|---|---|---|
| Coach Agent fuzz(教学语气 ≠ 评判)| `tests/agents/test_coach_ethics.py` | ✅ |
| Coach 场次<3 跳过 | `tests/domain/test_coach_trigger.py` | ✅ |
| post_report_graph 节点名锁 | `tests/orchestrator/test_post_report_graph_contract.py` | ✅ |
| UserInsightCache 幂等检测(based_on_last_session_id) | `tests/api/test_users_insights_api.py` | ✅ |
| Reflection Agent 教学语气护栏(diagnosis / mistakes_to_avoid 句式)| `tests/agents/test_reflection_ethics.py` | ✅ |
| Reflection vs Report 不重复评价(prompt 硬约束 + 后置 regex)| `tests/agents/test_reflection_no_overlap.py` | ✅ |
| Dashboard 各组件 smoke + 表格 / 筛选 tabs / AI 推荐卡 | `apps/desktop/src/__tests__/HistoryPage.*.test.tsx` | ✅ |
| ReportPage segment tab 切换 + Reflection 状态机 | `apps/desktop/src/__tests__/ReportPage.reflection.test.tsx` | ✅ |

---

## G. PRD/AGENTS 同步要求

每个 M3 节点完成后,commit body 必须列出:

- F-XXX 一句话变更(F-318 / F-316 / F-322)
- 涉及 PRD 章节(PRD §5.6 Coach Agent / §6.4 Dashboard / PRD v3.3 addendum §4 Reflection)
- 涉及 AGENTS.md 段落(§2 Agent 数 8→9 / §6 红线条款 12 教学语气护栏)

最终 M3 结束后,人工统一更新 docs/FEATURES.md / ROADMAP.md / PRD addendum 等支持文档。

---

## 节点拆分纪律(2026-04-30 实战经验)

**M2.3.X audit-fix 第一次跑触发 timeout 的教训**:单节点改动 ≤ 8 文件 / ≤ 200 行产品代码 / spec ≤ 100-150 行 markdown。

M3 8 节点设计每个都遵守此原则:
- M3.1.1 Coach Agent (~5 文件 / ~150 行)
- M3.1.2 post_report_graph + asyncio.create_task (~3 文件 / ~80 行)
- M3.1.3 UserInsightCache 迁移 + API (~5 文件 / ~120 行)
- M3.1.4 Dashboard 整版重写 (~6-8 文件 / ~300 行,**最大节点**;若 timeout 拆 a/b)
- M3.1.5 复用配置 + 底部 CTA (~3 文件 / ~60 行)
- M3.2.1 Reflection Agent (~5 文件 / ~150 行)
- M3.2.2 reflection_node + 表 + API (~4 文件 / ~120 行)
- M3.2.3 ReportPage segment tab + ReflectionView (~5 文件 / ~200 行)

如果 M3.1.4 Dashboard 单节点跑 timeout,**预案**:在新 spec 文件加 M3.1.4a / M3.1.4b 拆成 上半页 + 下半页两节点。
