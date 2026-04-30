# Eatit PRD v3.3 Addendum

> **PRD 增量,基于 v3.2 主版本 ([Eatit_PRD_v3_2.docx](../../../Eatit_PRD_v3_2.docx))。本增量记录 2026-04-30 老板新增的 3 个功能、Agent 数量调整、新增 L0 隐私护栏条款。**
>
> **基础版本**: v3.2(权威 .docx 见仓库根)
> **增量版本**: v3.3(本文件)
> **最后更新**: 2026-04-30
> **适用对象**: Codex / Claude Code / 其他 AI Coding Agent;阅读时与 v3.2 主 PRD 一并消费

---

## 0. 阅读约定

1. v3.2 主 PRD 仍是基础真理 —— 本增量只补 v3.2 之外**新增**的 3 个 F-ID(F-320 / F-321 / F-322)+ Agent 数量调整 + L0 红线条款新增
2. v3.2 中 L1 冻结清单(F-001 ~ F-011)与 v3.2 新增 14 个 F-ID(F-306 ~ F-319)继续生效
3. 任何冲突按以下优先级裁决:**v3.3 addendum > v3.2 主 PRD > v3.1 历史**
4. F-320 / F-321 / F-322 作为 P1 / P2 阶段(M2 / M3),M0 + M1(P0)阶段仍以 v3.2 为唯一权威输入

## 1. v3.3 增量背景

2026-04-30 老板新增 2 个产品需求:

1. **JD + 简历 → 公司情况 + 行业情况理解 → 预测对应面试题**
2. **面试之后的复盘**

经产品方案拆解,落到 **3 个新增 F-ID**:

| F-ID | 名称 | 立项原因 |
|---|---|---|
| F-320 | 公司/行业情报抽取(联网模式)| 老板需求 1 的"公司+行业理解"部分 |
| F-321 | 解析阶段同步出预测面试题库 | 老板需求 1 的"预测面试题"部分 |
| F-322 | 独立于 Report 的 AI 复盘报告(教学版)| 老板需求 2 |

老板对 3 个关键决策已拍板(2026-04-30 AskUserQuestion):
- F-320 取数:**联网搜索**(opt-in)
- F-321 时机:**解析阶段同步出**(不延后到配置页)
- F-322 形态:**D 选项 — AI 给的复盘报告(独立于 Report)**

## 2. F-320 公司/行业情报抽取

### 2.1 Agent 定位

新增 **Research Agent** —— 与 Parse Agent 在解析阶段**并行**运行,职责:基于 JD 中的公司名 + 岗位名 + 行业关键词,联网检索公司当前业务模式、行业动态、竞争格局等信息。

**严格不读简历正文**(隐私护栏,见 §6 L0 新增条款 11)。

### 2.2 数据契约

**输入(ResearchAgentInput)**:

```python
class ResearchAgentInput(BaseModel):
    company_name: str              # 从 JD 抽取
    role_title: str                # 从 JD 抽取
    industry_hints: list[str]      # 从 JD 抽取(关键词,1-5 个)
    # 严禁字段:resume_text / candidate_email / candidate_phone 等 PII
```

**输出(ResearchResult)**:

```python
class Signal(BaseModel):
    type: Literal["funding", "product", "personnel", "market", "regulation"]
    summary: str
    occurred_at: datetime | None = None
    source_url: str | None = None

class CompanyProfile(BaseModel):
    name: str
    business_model: str
    stage: Literal["seed", "growth", "mature", "listed", "unknown"]
    recent_signals: list[Signal] = Field(default_factory=list)
    evidence_links: list[str] = Field(default_factory=list)
    confidence: Literal["high", "mid", "low"]

class IndustryProfile(BaseModel):
    name: str
    landscape_summary: str          # 行业格局摘要 ≤ 200 字
    key_metrics: list[str]          # 关键指标 3-6 个
    typical_pain_points: list[str]  # 典型痛点 2-5 条
    competitors_in_jd_ctx: list[str]  # JD 上下文中的竞品(若可推断)

class ResearchResult(BaseModel):
    company: CompanyProfile
    industry: IndustryProfile
    fetched_at: datetime
    cache_key: str                  # hash(company_name + industry) 用于 30 天 TTL
```

### 2.3 联网工具选型

**首选(M2.3 第一阶段)**:让 LLM(Claude/GPT)用自身的 `web_search` tool。BYOK 模式下用户的 LLM 必须支持 tool use。

**次选**:Tauri 后端调用独立 SerpAPI / Brave Search / Bing API,把检索结果作为 LLM 输入。

**降级**:
- BYOK key 不支持 tool use(老 GPT-3.5 / Claude 1.x)→ 半离线模式(LLM 内置知识 + 提示用户结果可能不新鲜)
- API 配额耗尽 → 半离线 + Sentry 告警
- 用户拒绝 opt-in → Research Agent 跳过运行,ParsedPanel 不显示公司/行业卡

### 2.4 缓存策略

新增 `research_cache` 数据库表:

```sql
CREATE TABLE research_cache (
  cache_key TEXT PRIMARY KEY,           -- hash(company_name + industry)
  payload JSON NOT NULL,                 -- ResearchResult 序列化
  fetched_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL          -- fetched_at + 30 days
);
```

- **TTL**: 30 天
- **命中**: 时延 ≈ 0
- **Miss**: P95 5-10s

### 2.5 时序

```
T0  用户上传 resume + jd 双文件
T1  ┌─ Parse Agent (8-15s)              ┐
    └─ Research Agent (5-10s, opt-in)   ┘  并行
T2  Question Prediction (Framework Agent 子能力,见 F-321)
T3  ParsedPanel 一次性渲染:画像 + 公司洞察 + 行业洞察 + 预测题库 + 匹配双栏 + 建议侧重
```

## 3. F-321 题目预测

### 3.1 设计裁决

**不新增 Agent**,作为 Framework Agent 的输出扩展。

### 3.2 触发位置(老板裁决)

**解析阶段同步出**,不放在配置页之后 —— 用户进入配置页之前就能看到"AI 预测会问哪些题"。

### 3.3 数据契约

```python
class PredictedQuestion(BaseModel):
    category: Literal[
        "company-business",   # 公司业务题(基于 ResearchResult.company)
        "industry-judgment",  # 行业判断题(基于 ResearchResult.industry)
        "project-deepdive",   # 项目深挖题(基于简历 ProjectHooks)
        "general-pm",         # 通用 PM 题
    ]
    question: str
    why_likely: str           # 为什么这道题大概率会出(≤ 60 字)
    related_evidence: str     # 来自 JD/简历/Research 的哪条证据

class PredictedQuestionBank(BaseModel):
    questions: list[PredictedQuestion] = Field(min_length=8, max_length=15)
    generated_at: datetime
    sources: list[Literal["jd", "resume", "research"]]
```

### 3.4 与现有 Framework Agent 的关系

- Framework Agent 现有职责(v3.2):生成 `DirectionFramework`(stages + question_budget + focus_points)
- v3.3 扩展:并行产出 `PredictedQuestionBank`
- **实际面试**:Interviewer Agent **优先采用**预测题中匹配当前方向的(避免太机械,允许偏离)

### 3.5 展示

ParsedPanel 新增 "AI 预测面试题"折叠卡:
- 8-15 道题按 4 个 category 分组
- 每条带 "为什么会问"折叠提示
- 无视觉规范要求(参考 page-upload.jsx 的 ParsedPanel 样式扩展)

## 4. F-322 独立 Reflection 复盘报告

### 4.1 Agent 定位

新增 **Reflection Agent** —— 在 Report 完成后**异步运行**,作用域是**单 session 深度复盘**(Coach Agent 是跨 session 趋势,两者并行不冲突)。

### 4.2 Report vs Reflection 分工

| 维度 | Report (F-312/F-313) | Reflection (F-322) |
|---|---|---|
| 角色 | 评估专家(给分) | 教学教练(给指导) |
| 第一人称 | 面试官引述(persona) | 复盘教练(中立) |
| 单题输出 | answer_summary + ai_feedback(评价) | model_answer_outline + key_phrases + mistakes_to_avoid(教学) |
| 篇幅 | 简明 | 深入,token 数为 Report ~2 倍 |
| 触发 | 面试结束立即 | report ready 后异步 |
| 入口 | ReportPage 主体 | ReportPage 顶部 segment tab "详细复盘" |

### 4.3 数据契约

```python
class DialogueTurn(BaseModel):
    role: Literal["interviewer", "candidate"]
    text: str

class PerQuestionCoaching(BaseModel):
    turn_index: int
    question: str
    your_answer_summary: str
    diagnosis: str                       # 教学语气,非评判式
    model_answer_outline: list[str]      # "再答一次"的最佳骨架
    key_phrases_to_use: list[str]        # 可以用的关键词/术语/模型
    mistakes_to_avoid: list[str]         # 本场具体犯过的错
    recommended_resources: list[str] = Field(default_factory=list)

class ReflectionReport(BaseModel):
    report_id: str                              # 与主 Report 同 session_id 关联
    executive_summary: str                      # 整体反思诊断(不重复 Report 总评)
    per_question_coaching: list[PerQuestionCoaching]   # 重点覆盖 tone=warn 的题
    general_growth_advice: str                  # 1-2 周训练建议
    mock_followup_dialogue: list[DialogueTurn]  # 针对最弱 1-2 题的样例对话
    generated_at: datetime
    status: Literal["pending", "running", "ok", "failed"]
```

### 4.4 LangGraph 节点

`post_report_graph.py` 从单节点(coach_node)扩展为两节点:

```
report_ready
    │
    ├─→ reflection_node  (异步,与 coach_node 并行)
    └─→ coach_node        (异步,跨 session)
```

推荐**并行**(两者无依赖)。

### 4.5 入口设计

ReportPage 顶部 segment tab `[评估报告] [详细复盘]`:
- "详细复盘" tab 状态机:
  - `pending` / `running`:TipsCarousel + "正在为你撰写详细复盘..."
  - `ok`:渲染 Reflection 内容
  - `failed`:降级提示 "复盘报告生成失败,稍后再试" 按钮

### 4.6 教学语气护栏

Reflection prompt 必须严格约束:
- `diagnosis` 字段不得含评判式表述("你回答得很差" 等)
- 与 Report.ai_verdict 的 12 禁止词清单(见 v3.2 PRD 0.1 / v32-p0-constraints.md A5)同样适用
- `general_growth_advice` 必须是建设性表述

## 5. Agent 数量从 7 调整到 9

v3.2 主 PRD §0.4 锁的 Agent 数是 **7 个 + 1 Orchestrator**(Parse / Framework / Interviewer / Reference / Compression / Report / Coach + Orchestrator)。

v3.3 增加 2 个新 Agent:
- **Research Agent**(F-320)
- **Reflection Agent**(F-322)

新 Agent 数:**9 个 + 1 Orchestrator**。

### 5.1 LangGraph 节点新增

`turn_graph` 节点保持锁定不变(`turn_assessment` / `compression` / `interviewer`,见 v32-p0-constraints.md A7)。

新增节点都挂在独立 graph 上:
- `intake_graph.py`(M2 新建):`parse_node` || `research_node`(F-320) → `predict_questions_node`(F-321)
- `post_report_graph.py`(M3 已规划):`reflection_node`(F-322) || `coach_node`(F-318)并行

### 5.2 Agent 拆分论证(为什么不合并)

#### Research Agent vs Parse Agent
- 输入完全不同:Parse 读 resume + jd 文本;Research 只用公司名 + 岗位名 + 行业关键词,**严禁读 resume**
- 失败影响域不同:Parse 失败阻塞主流程;Research 失败只让 ParsedPanel 少 3 块(公司/行业/预测题),不阻塞配置页
- 工具差异:Research 需要 `web_search` tool 调用,Parse 是纯 LLM
- 隐私边界:Parse 读隐私数据(resume);Research 严禁读

#### Reflection Agent vs Report Agent
- 角色:Report 是评估专家;Reflection 是教学教练
- 内容硬约束:Reflection prompt 显式禁重复 Report 已说的评价
- token 量:Reflection 比 Report 多 ~2 倍,合并会让 Report 单次响应过大
- 触发:Report 同步;Reflection 异步,失败不影响 Report

## 6. L0 红线条款新增(必须同步到 AGENTS.md)

v3.2 PRD §0.2 (隐私红线)+ §0.3 (性能红线)+ AGENTS.md §6 (L0 红线)继续有效。本增量补充:

### 条款 11: 联网情报检索隐私护栏(新增 v3.3)

> 适用范围:F-320 Research Agent 及任何后续涉及联网检索的功能。

1. **必须 opt-in**:首次启用前模态确认(Settings 持久化开关),严禁默认开启
2. **payload 严格限制**:发往 LLM/搜索 API 的 payload **只含**:
   - 公司名(从 JD 抽取)
   - 岗位名(从 JD 抽取)
   - 行业关键词(从 JD 抽取,≤ 5 个)
3. **严禁发送**:
   - 简历正文 / 简历任何片段
   - 用户姓名 / 邮箱 / 电话 / 其他 PII
   - JD 中任何与公司+岗位+行业无关的信息
4. **日志埋点**:`cache_key` 必须 hash 化,不留明文
5. **拒绝授权**:用户拒绝 opt-in 时,Research Agent 跳过运行,ParsedPanel 不显示公司/行业/预测题三块

### 条款 12: 教学语气护栏(新增 v3.3)

> 适用范围:F-322 Reflection Agent 输出。

1. `diagnosis` 字段不得含评判式表述(参考 v3.2 PRD §0.1 通过可能性 12 禁止词清单)
2. `general_growth_advice` 必须是建设性表述,不得含负面打击词
3. `mistakes_to_avoid` 描述错误时必须用"建议下次"句式,不得用"你犯了"句式

## 7. v3.3 路线图位置

| 里程碑 | 阶段 | 包含 v3.3 新增 |
|---|---|---|
| M0 | 红线整改 + 设计地基 | — |
| M1 | v3.2 三件套对齐(Config/Persona/Report)| — |
| **M2** | 实时面试 + 解析体验 + **F-320/F-321** ⭐ | Research Agent + Question Prediction |
| **M3** | Coach + Dashboard + **F-322** ⭐ | Reflection Agent |
| M4 | 配额 + 性能 + E2E | — |

P0 = M0 + M1(v3.2 内容,**不含 v3.3 增量**),已于 2026-04-30 由 Ralph 自治循环跑完 16 个节点。

## 8. 文档同步要求

实施 F-320 / F-321 / F-322 时,以下文件必须同步更新:

- `eatit/AGENTS.md`:第 2 节 Agent 数 7 → 9;第 3 节如有 Coach 类似的 Agent 行,加 Research / Reflection 两行;第 6 节 L0 红线加条款 11、12
- `eatit/docs/FEATURES.md`:L1 镜像追加 F-320 / F-321 / F-322 行
- `eatit/.ralph/specs/v32-p1-sections.md`(M2 启动时新建):包含 Research Agent + Question Prediction 节点详细 spec
- `eatit/.ralph/specs/v32-p2-sections.md`(M3 启动时新建):包含 Reflection Agent 节点详细 spec

## 9. 变更历史

| 版本 | 日期 | 变更 |
|---|---|---|
| v3.3 | 2026-04-30 | 初版 — F-320 / F-321 / F-322 入档 + Agent 数 7→9 + L0 条款 11/12 新增 |
