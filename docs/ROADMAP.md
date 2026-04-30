# Eatit 项目主文档(整体规划)

> **本文件是 Eatit 项目的"单一真理入口" — 从产品定位、核心价值、技术架构、Agent 体系、L0 红线、路线图、当前进度,到全部文档索引,一站式总览。**
>
> **最后更新**:2026-04-30
> **PRD 主版本**:v3.2(权威 .docx 见仓库根 `Eatit_PRD_v3_2.docx`)
> **PRD 增量**:v3.3 addendum(`docs/PRD/Eatit_PRD_v3_3_addendum.md`)
> **当前阶段**:**P0 完工**(16 / 16 节点),进入 P1 规划期
> **总周期估算**:13 周(M0 → M4 全程)

---

## 0. 一页纸现状(给老板/团队 30 秒看完)

```
项目定位       AI 模拟面试系统(简历 + JD → 多 Agent 实时面试 → 评估报告 → 跨场次成长追踪)
核心技术栈     Tauri 2 + React 18(桌面)/ FastAPI + LangGraph + Pydantic(后端)/ BYOK + SQLite 本地化
Agent 体系     9 个逻辑 Agent + 1 Orchestrator(v3.3 后)
当前进度       P0 完工 16/16 节点 = 总进度 41%(16 / ~39)
已实施 F-ID    7 个(F-307/308/312/313/314/317/319)
待实施 F-ID    14 个(F-301~F-306, F-309~F-311, F-315/316/318, F-320/321/322)
失败成本       1 次 stream timeout = $1.38(已恢复,后续 0 失败)
本地未 push     17 commits(P0 全部)+ 3 份支持文档(待 commit)
下一步          M2 启动 — 实时面试 + 解析体验 + 公司情报与预测题(老板新需求)
```

---

## 1. 产品定位(不可变,L0)

**Eatit 是一个由简历、岗位 JD、面试配置参数共同驱动的 AI 模拟面试系统。**

- ✅ 是:AI 模拟面试工具 / 多 Agent 闭环 / BYOK 本地化桌面应用
- ❌ 不是:简历生成器 / 岗位推荐平台 / 招聘 SaaS / 思维导图工具

**核心价值锚定**:让用户**更像真实面试地被提问、更快暴露问题、更清晰知道怎么改进**。

---

## 2. 核心价值链路

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ 上传简历+JD  │ → │ 综合解析+预测 │ → │ 配置面试参数  │ → │ 实时多轮面试  │ → │ 评估报告+复盘 │
│ (双文件)    │    │ (Parse +     │    │ (4 风格 +    │    │ (turn 级    │    │ (五维度评分 + │
│             │    │  Research +  │    │  6 方向 +    │    │  并行 Agent) │    │  通过可能性 + │
│             │    │  Predict)    │    │  3 时长)    │    │              │    │  教学复盘)   │
└─────────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                                                                                        │
                                                                                        ▼
                                                                              ┌──────────────────┐
                                                                              │ 跨场次成长追踪    │
                                                                              │ (Coach Agent +   │
                                                                              │  Dashboard)      │
                                                                              └──────────────────┘
```

---

## 3. 历史演变(v3.1 → v3.3)

| 版本 | 日期 | 关键变更 |
|---|---|---|
| v3.1 | 2026-04-25 | 初版,**6** Agent 架构,LangGraph 落地,P3-P5 共 50 节点完成 |
| v3.2 | 2026-04-29 | Agent +1(**7**:加 Coach);配置参数重写 4+6+3;设计系统锁;F-306 ~ F-319 入档 |
| v3.3 | 2026-04-30 | Agent +2(**9**:加 Research + Reflection);F-320 ~ F-322 入档(老板新需求);L0 红线条款 11/12 新增;P0 由 Ralph 自治循环跑完 16 节点 |

---

## 4. Agent 体系(9 个 + 1 Orchestrator)

> ⚠️ **L0**:Agent 数量、节点名、职责不可擅改。新增需 PRD 增量备案。

| Agent | 调用层级 | 职责 | 失败影响 | 状态 |
|---|---|---|---|---|
| Parse Agent | session 入口 | 联合解析简历 + JD | 阻塞 | ✅ v3.1 已有 |
| **Research Agent**(v3.3 新)| session 入口(与 Parse 并行) | 联网检索公司 + 行业情报(opt-in) | **不阻塞**,降级半离线 | ⏳ M2.3 |
| Framework Agent | session 级 | 生成提问方向框架 + 预测题库(F-321) | 阻塞 | ✅ v3.1 已有(待 v3.3 扩展) |
| Interviewer Agent | turn 级 | 出题 + 追问线索 + 实时观察 | 阻塞 | ✅ v3.1 已有(F-308/319 已落地) |
| Reference Answer Generator | turn 级(与 Interviewer 并行) | 参考话术 | **不阻塞**,可降级 | ✅ v3.1 已有 |
| Compression Agent | turn 级 | 压缩会话记忆 | 可降级用原始摘要 | ✅ v3.1 已有 |
| Report Agent | session 结束 | 生成完整报告(含五维度) | 阻塞报告页 | ✅ v3.1 已有(F-312/313/314 已落地) |
| **Reflection Agent**(v3.3 新)| **session 结束后异步** | 单场深度复盘(教学版) | **不阻塞**,可降级 | ⏳ M3.2 |
| **Coach Agent**(v3.2 新)| **跨 session 异步** | 跨场次分析 + 个性化 Tips | **不阻塞**,可降级 | ⏳ M3.1 |

**LangGraph 节点分布**:

```
turn_graph (锁死,L0)         {turn_assessment, compression, interviewer}
intake_graph (M2 新建)        parse_node || research_node → predict_questions_node
post_report_graph (M3 新建)   reflection_node || coach_node  (并行异步)
```

---

## 5. 技术栈(L1,稳定不变)

| 层 | 选型 | 理由 |
|---|---|---|
| 前端壳 | Tauri 2.10.3 + Rust | 原生 macOS,~10MB 包体,无 Electron 内存压力 |
| 前端 UI | React 18 + Vite + TypeScript | 工业标准,IDE 支持完善 |
| 设计系统 | Custom design tokens(CSS variables)+ 共享 className | 不用 shadcn / MUI / AntD;严格遵循 design-reference |
| 后端 | FastAPI + Python 3.11 + uv | async-first,类型友好 |
| Agent 编排 | **LangGraph** | 节点-边模型契合状态机,Channel 共享状态,内置中断与恢复 |
| 数据契约 | Pydantic + Instructor | LLM 输出 JSON schema 强校验,自动 retry |
| 数据库 | SQLite(WAL + NORMAL)| 单用户桌面,无 Postgres 运维成本 |
| LLM 接入 | LiteLLM + BYOK | X-LLM-Config HTTP header 中传 base64 JSON,严禁前端直调第三方 |
| 测试 | pytest + pytest-asyncio + ScriptedGateway(LLM mock)| 现有约定,后端 200+ tests |
| Macros | Ralph for Claude Code | 自治循环,节点驱动,本项目 P0+ 全部用此实施 |

**禁用清单**(L0):
- LangChain Chains / Agents(抽象冗余)
- CrewAI(对话式多 Agent,场景不符)
- AutoGen(同上)
- Material UI / Ant Design / Chakra(替代设计系统)
- Tailwind 默认色板(`bg-green-500` 等,M0.2 已封禁)

---

## 6. L0 红线汇总(共 12 条,不可逾越)

> 见仓库根 [`AGENTS.md`](../../AGENTS.md) §6 + PRD §0.1-0.5 + `.ralph/specs/v32-p0-constraints.md` A-F。
> Codex / Claude Code / Ralph 在任何迭代里**首先核对**这 12 条,违反必须停下报告。

### 产品红线
1. **通过可能性禁"不建议/不通过"**,只输出"中上/中/中下"3 档(伦理)
2. **AI 参考回答默认折叠**,不得改为展开(避免照念)

### 数据契约红线
3. **数据契约只增不改**:`pass_probability` / `Verdict` / `RoundReview` 等老字段保留作向后兼容,新增字段并行
4. **InterviewerPersona 4 个名固定**(Sarah / Marcus / Lin / Daniel),严禁改名
5. **五维度评分 name 严格锁**(专业深度/结构化表达/批判性思考/业务直觉/沟通节奏),长度严格 = 5 或空
6. **填充词列表锁**(嗯/呃/那个/就是/这个/反正/然后然后),不得擅自修改

### 编排红线
7. **LangGraph turn_graph 节点名锁**(turn_assessment / compression / interviewer),新增节点必须挂独立 graph
8. **Coach Agent 必须异步**(跨 session,不在记录页打开时实时调用)
9. **Reflection Agent 必须异步**(v3.3 新增,与 Coach 并行,不阻塞 Report)

### 用户体验红线
10. **Tips 过场动画失败时降级 shimmer**,不得阻塞主流程

### 隐私 + 教学红线(v3.3 新增)
11. **联网情报检索 opt-in**:必须用户授权,严禁默认开启;payload 只含公司名+岗位名+行业关键词,**严禁发送简历正文 / PII**;cache_key hash 化
12. **Reflection 教学语气**:diagnosis 字段不得评判式;general_growth_advice 必须建设性;mistakes_to_avoid 用"建议下次"句式

---

## 7. 整体路线图(M0 → M4,~13 周)

| 里程碑 | 阶段 | 周期 | 状态 | F-ID | 价值故事 |
|---|---|---|---|---|---|
| **M0** | 设计系统地基 + 红线整改 | 1.5 周 | ✅ **完成** 2026-04-30 | F-314 | 后续重构有干净的"地"可落,L0 伦理护栏立即修复 |
| **M1** | v3.2 三件套对齐(Config/Persona/Report) | 3 周 | ✅ **完成** 2026-04-30 | F-307 / F-308 / F-312 / F-313 / F-317 / F-319 | 配置 4+6+3,人格化,报告升级到五维度 |
| **M2** | 实时面试 + 解析体验 + 公司情报与预测题 ⭐ | **5 周** | ⏳ 待启动 | F-309/310/311/319(完善)/F-306/F-301~F-305/**F-320/F-321** | 实时观察+统计+快捷键+Tips,解析阶段出公司情报 |
| **M3** | Coach + Dashboard + Reflection 复盘 ⭐ | **6 周** | ⏳ 待启动 | F-316 / F-318 / **F-322** | 跨场次成长追踪 + Dashboard + 教学版复盘 |
| **M4** | 配额 + 性能 + E2E + 验收 | 2 周 | ⏳ 待启动 | F-315 + Playwright + locust | 性能 P95 全达标,5 个金标 E2E,达到对外可发门槛 |

> ⭐ 标记的项是 2026-04-30 老板新增需求(F-320 / F-321 / F-322),不在 PRD v3.2 里,在 v3.3 addendum 入档。

---

## 8. 进度可视化

```
P0 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ✅ 100%(16/16)

  M0 设计地基+红线   ✅✅✅✅✅✅✅✅✅✅✅                                            11/11
  M1 v3.2 三件套     ✅✅✅✅✅                                                       5/5

P1 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ⏳ 0%

  M2 实时面试+情报    ⏳⏳⏳⏳⏳⏳⏳⏳⏳⏳⏳                                          0/~11

P2 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ⏳ 0%

  M3 Coach+Dashboard+复盘   ⏳⏳⏳⏳⏳⏳⏳⏳                                          0/~8
  M4 配额+E2E+性能           ⏳⏳⏳⏳                                                 0/~4
```

**总进度:16 / ~39 节点(41%)**

---

## 9. 已完成清单(2026-04-30 一天)

### 9.1 P0 阶段产出物 — 17 commits(本地未 push)

| commit | F-ID | 节点 | 关键交付 |
|---|---|---|---|
| `4cc40e5` | — | M0.1a | 按钮共享类(.btn 7 变体落到 @layer components) |
| `29696a6` | — | M0.1b | 卡片共享类(.card 4 变体) |
| `8b06afd` | — | M0.1c | 标签共享类(.tag 6 变体) |
| `be3455a` | — | M0.1d | 互动共享类(.tile/.kbd/.input/.bar 共 11 个) |
| `44db298` | — | M0.1e | 排版共享类(.h1/.h2/.h3/.body/.muted) |
| `eaf8c16` | — | M0.1f | 布局共享类 + shadcn 退役 + 18 HSL bridge 变量删除 |
| `23645bc` | — | M0.2 | Tailwind 默认色板封禁 + ESLint + lint:design-tokens CI job |
| `d3bc6c0` | **F-314** | M0.3 | **PassProbabilityRing → HeroScoreCard 3 档**,12 禁止词 fuzz + ai_verdict 扫描 (34 测试) |
| `a8538bb` | — | M0.4 | Sidebar 版本号 v3.2 |
| `4ec8cfc` | — | M0.5 | LangGraph turn_graph 节点名锁断言 |
| `39f9ba7` | — | M0.6 | design-reference 归位 eatit/docs/ |
| `11b134a` | **F-307** | M1.1 | InterviewConfig 4+6+3 + 老枚举兼容映射 (20 测试) |
| `37fa67f` | **F-308** | M1.2 | InterviewerPersona 4 人格名锁 + persona_name_guard hook (5 测试) |
| `696de48` | **F-312/F-313** | M1.3 | 五维度评分 + 单题评分 + 降级补 50 分 (20 测试) |
| `39a29c4` | **F-319** | M1.4 | followup_hints[2-3, ≤8 chars] (6 测试) |
| `d050b15` | **F-317** | M1.5 | DarkActionCard + derive_preset_config 弱项映射 (3 测试) |
| `a25b301` | — | checkpoint | Ralph 自加 P0 checkpoint commit |

**完成的 F-ID:7 个** — F-307 / F-308 / F-312 / F-313 / F-314 / F-317 / F-319

### 9.2 文档层产出

| 文档 | 行数 | 状态 |
|---|---|---|
| `EatIt_v3/历史内容.md` | +~2500 字 | 已追加全过程归档 |
| `eatit/docs/PRD/Eatit_PRD_v3_3_addendum.md` | 328 | 新建 PRD v3.3 增量 |
| `AGENTS.md`(仓库根) | 316 (212→316) | 升级到 v3.3,加 §11 P0 总结 + §12 Ralph 节点驱动 |
| `eatit/docs/FEATURES.md` | 118 | 新建 L1 镜像 F-001~F-322 |
| `eatit/docs/ROADMAP.md`(本文件) | — | 新建项目主文档 |
| `.ralph/specs/v32-p0-constraints.md` | 245 | 新建 P0 红线 |
| `.ralph/specs/v32-p0-sections.md` | 1783 | 新建 16 节点详细 spec |
| `.ralph/fix_plan.md` | 重写 | 16 节点全 [x],50 老节点归档 |
| `.ralph/PROMPT.md` | 重写 | 引用 v32-p0-* |

---

## 10. 还没做的事(分阶段)

### 10.1 M2 详细(~5 周,~11 节点)

#### M2.1 实时面试增强(2 周,~5 节点)

| F-ID | 功能 | 工作量 | 文件预估 |
|---|---|---|---|
| F-309 | 实时观察侧栏(NextQuestion.live_observation) | 中 | InterviewerAgent schema + service + LiveObservationCard.tsx |
| F-310 | 实时统计(语速/填充词/用时,纯前端 hook) | 小 | useTurnStats.ts + fillerWords.ts(已有 v3.2 锁) |
| F-311 | 键盘快捷键 Space/R/Esc | 小 | useGlobalKeymap.ts + Esc 确认弹窗 |
| F-319(前端) | followup_hints chip 渲染(后端 schema 已 done) | 小 | FollowupHintChips.tsx |
| F-306 | Tips Carousel(替换简陋 WaitingTips,卡片切换 + 完成态 ✓ 过渡)| 中 | TipsCarousel.tsx + tips.json + selectTips.ts |

#### M2.2 解析体验扩展(1 周,~1 大节点)

| F-ID | 功能 | 工作量 |
|---|---|---|
| F-301~F-305 | ParsedPanel 整页重构:综合解析输出扩展 + 上传卡元数据 + 进度指示器 + 解析态元信息 + UploadCard 三态机 + MatchDial + 建议侧重(可编辑)| 大 |

#### M2.3 老板新需求 — 公司情报 + 题目预测(2 周,~5 节点)

| F-ID | 功能 | 工作量 |
|---|---|---|
| **F-320** | Research Agent 新建 + 联网检索(LLM web_search tool 优先)+ opt-in 模态 + research_cache 表(30 天 TTL)+ 隐私护栏(L0 条款 11)| 大 ⭐ |
| **F-321** | 题目预测(Framework Agent 输出扩展 PredictedQuestionBank,8-15 道,4 category)| 中 ⭐ |
| - | intake_graph.py 新建(parse_node || research_node → predict_questions_node)| 中 |
| - | ParsedPanel 公司洞察卡 + 行业洞察卡 + 预测题库分类折叠卡 | 中 |
| - | Settings 联网授权开关 + 持久化 + Probe LLM tool use 能力 | 小 |

### 10.2 M3 详细(~6 周,~8 节点)

#### M3.1 Coach Agent + Dashboard(3.5 周,~5 节点)

| F-ID | 功能 | 工作量 |
|---|---|---|
| F-318 | Coach Agent + UserInsightCache 表 + maybe_trigger_after_report 幂等触发 | 大 |
| F-316 | Dashboard 整版重写:StatCards×4 + AI 推荐卡 + 筛选 tabs + 表格 grid 6 列 | 大 |
| - | post_report_graph.py 新建(Coach + Reflection 并行)| 中 |
| - | GET /users/me/insights + asyncio.create_task 异步触发 | 小 |
| - | "复用上次配置"跳过 upload 直接 config 页 | 小 |

#### M3.2 老板新需求 — Reflection 复盘(2.5 周,~3 节点)

| F-ID | 功能 | 工作量 |
|---|---|---|
| **F-322** | Reflection Agent 新建(独立教学版,与 Coach 并行)+ reflection_reports 表 | 大 ⭐ |
| - | ReportPage segment tab + ReflectionView 组件 | 中 |
| - | 教学语气护栏(L0 条款 12)+ Prompt 硬约束(不重复 Report 已说的评价)| 小 |

### 10.3 M4 详细(~2 周,~4 节点)

| 任务 | 工作量 |
|---|---|
| F-315 配额前端 mock 卡(Sidebar 底部,localStorage 计数) | 小 |
| Playwright + Tauri driver 5 个金标 E2E | 中 |
| locust 性能基线(P95 ≤ 15s 解析 / ≤ 4s 出题 / ≤ 30s 报告 / ≤ 60s Coach) | 中 |
| shadcn HSL bridge 完全清理(Tailwind config 残余清扫) | 小 |
| 字体本地子集化 woff2(Tauri 启动避网络抖动) | 小 |

---

## 11. 关键决策登记

### 11.1 已决策(2026-04-30 老板拍板)

| 决策点 | 选择 | 影响 |
|---|---|---|
| F-320 取数路径 | **联网搜索**(LLM web_search tool 优先,SerpAPI 次选)+ opt-in | 新增 Research Agent + L0 条款 11 |
| F-321 触发时机 | **解析阶段同步出**(不放配置页之后) | Parse 与 Research 并行,ParsedPanel 一次渲染含画像+公司+行业+预测题 |
| F-322 形态 | **D 选项 — AI 给的复盘报告(独立于 Report)** | 新增 Reflection Agent + L0 条款 12 |
| Coach 触发方式 | `asyncio.create_task` fire-and-forget(不引入 Celery)| 单进程 FastAPI 不动地基 |
| 节点拆分原则 | 单节点 ≤ 200 行 / ≤ 8 文件 / spec ≤ 100 行 markdown | 避免 1M context Opus 4.7 stream timeout |

### 11.2 待决策(M2 启动前)

- **联网情报 API 选型**:M2.3 第一阶段 LLM web_search → 验证产品价值 → 是否引入独立 SerpAPI/Brave?
- **Tips JSON 失败的真降级文案**:PRD 写"shimmer"用户体验差,建议 hardcoded fallback tips。AGENTS.md L0 条款是否更新?
- **Reflection vs Coach 串行 vs 并行**:M3 决策(推荐并行,无依赖)
- **是否启动 v32-p1-sections.md 编写 + Ralph 跑 M2**:用户拍板

---

## 12. 关键风险登记

| 风险 | 缓解策略 | 状态 |
|---|---|---|
| Anthropic API stream idle timeout(单节点 1M context Opus 4.7)| 节点拆分 + Ralph circuit breaker(3 次无进展熔断)| ✅ 已实战验证(M0.1 拆 6 子节点后零失败)|
| L0 红线触发(伦理 / 隐私 / Schema 删字段)| Pydantic Literal 锁 + 后端兜底 coerce + pre-commit hook + 测试 contract | ✅ 已实施(F-314 / F-307 / F-308 / F-312)|
| v3.1 → v3.2 数据迁移破坏老 session | Pydantic mode='before' validator 自动升级老枚举 + 老字段保留 | ✅ M1.1 已实施 |
| Tailwind 默认色板违规 | tailwind.config 显式覆盖 + ESLint 规则 + lint:design-tokens CI job 三层防御 | ✅ M0.2 已实施 |
| LangGraph 节点名漂移 | `test_graph_contract.py` 运行时断言 | ✅ M0.5 已实施 |
| Persona 改名 | `persona_name_guard.py` pre-commit + Pydantic Literal 锁 | ✅ M1.2 已实施 |
| Research Agent 联网失败/超时 | 半离线模式(LLM 内置知识)+ Sentry 告警 | ⏳ M2.3 实施 |
| Reflection 与 Report 内容重叠 | Prompt 显式约束 "不重复 Report 已说的评价" + segment tab 切换不并列展示 | ⏳ M3.2 实施 |
| Coach Agent fire-and-forget 进程崩溃丢任务 | Dashboard GET 时检测 last_session_id 不一致 → 主动重跑(幂等)| ⏳ M3.1 实施 |
| BYOK key 不支持 tool use | 启动 probe 一次,不支持自动降级到半离线 + Settings 标记 | ⏳ M2.3 实施 |

---

## 13. 时间表

```
2026-04-30  P0 完工 ✅ (16 commits + 3 docs)
            │
            ├── 2026-04-30 ~ 05-02  Visual 验证 + git push  ─── 1-2 天
            │
2026-05-03  M2 启动(待用户拍板)
            ├── M2.1 实时面试增强         2 周
            ├── M2.2 解析体验扩展         1 周
            └── M2.3 F-320/F-321         2 周
2026-06-07  M2 完工(预估)
            │
            ├── M3.1 Coach + Dashboard    3.5 周
            └── M3.2 F-322 Reflection     2.5 周
2026-07-19  M3 完工(预估)
            │
            └── M4 配额 + E2E + 性能      2 周
2026-08-02  M4 完工 → **可对外发布**(预估)
```

**总周期**:约 **13 周**(94 天),落在原 12-17 周估算的下沿。

---

## 14. 全部文档索引(按使用场景)

### 14.1 入口文档(从这开始)
- 📍 **本文件** `eatit/docs/ROADMAP.md` — 项目主文档(整体规划 + 当前进度 + 待办 + 文档索引)

### 14.2 给人读的(产品 / 技术决策)

| 文档 | 用途 | 位置 |
|---|---|---|
| `Eatit_PRD_v3_2.docx` | PRD v3.2 主版本(权威 docx)| 仓库根 |
| `eatit/docs/PRD/Eatit_PRD_v3_3_addendum.md` | PRD v3.3 增量(F-320/321/322)| `eatit/docs/PRD/` |
| `eatit/docs/FEATURES.md` | L1 冻结清单 + F-ID 完成日志 | `eatit/docs/` |
| `AGENTS.md` | Eatit 项目 AI Coding Agent 协作约定(v3.3)| 仓库根 |
| `EatIt_v3/历史内容.md` | 项目历史会话归档(自然语言时间线)| `EatIt_v3/` |
| `eatit/docs/design-reference/` | UI 真理来源(token + 共享 className + 5 页面原型)| `eatit/docs/design-reference/` |
| `eatit/docs/phase-2-summary.md` | Phase 2 历史归档 | `eatit/docs/` |
| `eatit/docs/phase-2.5-migration-plan.md` | Phase 2.5 迁移计划归档 | `eatit/docs/` |
| `eatit/README.md` | 项目 README(BYOK、安装、快速开始) | `eatit/` |
| `eatit/CHANGELOG.md` | 版本变更历史 | `eatit/` |

### 14.3 给 Ralph 读的(节点驱动)

| 文档 | 用途 | 位置 |
|---|---|---|
| `eatit/.ralphrc` | Ralph 配置(rate limit、circuit breaker、allowed tools)| `eatit/` |
| `eatit/.ralph/PROMPT.md` | 每个 ralph loop 的 8 步指令 | `eatit/.ralph/` |
| `eatit/.ralph/AGENT.md` | 项目级 build/test/run 操作手册 | `eatit/.ralph/` |
| `eatit/.ralph/specs/v32-p0-constraints.md` | P0 红线(已用)| `eatit/.ralph/specs/` |
| `eatit/.ralph/specs/v32-p0-sections.md` | P0 16 节点详细 spec(已用)| `eatit/.ralph/specs/` |
| `eatit/.ralph/fix_plan.md` | 任务清单(P0 全 [x])| `eatit/.ralph/` |
| `eatit/.ralph/specs/phase3-*.md` 等 | v3.1 P3-P5 历史归档(已不用)| `eatit/.ralph/specs/` |

### 14.4 M2 / M3 启动时新建

- ⏳ `eatit/.ralph/specs/v32-p1-sections.md`(M2 启动)
- ⏳ `eatit/.ralph/specs/v32-p2-sections.md`(M3 启动)

### 14.5 详细规划稿(临时,不算正式文档)

- `~/.claude/plans/eatit-prd-v3-2-docx-project-0423-v2-temporal-dragon.md` — 含详细子节点设计草稿,本路线图的"母本"

---

## 15. Next 3 Actions(给老板/团队)

### Action 1【你的事,~30 分钟】Visual 验证 + git push

```bash
cd /Users/shixuan/project_0423_v2/eatit/apps/api
uv sync                              # 重建 venv(修 shebang 漂移)
uv run python -m pytest -q          # 后端全量,预期 200+ passed

cd ../desktop
corepack pnpm exec tsc --noEmit
corepack pnpm lint
corepack pnpm lint:design-tokens
corepack pnpm dev                    # 5 页面人工走查

# 走查必看红线:
# - ReportPage Hero:无 0-100 数字、无"不建议",仅显示"中上/中/中下"
# - ConfigPage:4 风格 + 6 方向多选(默认勾 2)+ 3 时长(15/30/45 没 60)
# - InterviewPage 顶部:"面试官 Sarah · 结构化面试官"
# - Sidebar:v3.2 版本号

# 验证完毕 → push
git push
```

### Action 2【你拍板】启动 M2

回答:**M2 立即启动 / 等几天 Visual 验证后启动 / 暂缓**

如果立即启动:我立刻写 `.ralph/specs/v32-p1-sections.md`(M2 ~11 节点详细 spec),然后启 Ralph 跑。

### Action 3【M2 后】M3 启动条件

- M2 完工 + Coach 设计审过(因为引入 LangGraph 新 graph 需 careful review)
- F-322 Reflection 形态再次 confirm(D 选项)

---

## 16. 联系/支持

- **项目 Owner**:用户(老板)
- **AI Coding Agent**:Claude Opus 4.7 (1M context) via Ralph for Claude Code v0.11.5
- **本路线图维护**:Claude Code 主对话(每次 P 阶段完工后更新)
