# Eatit FEATURES — L1 Frozen Features Mirror

> **本文件是 PRD 第零·二章 L1 冻结清单的镜像 + v3.2 / v3.3 新增 F-ID 的完成日志。**
>
> **最后更新**: 2026-05-01(v3.3 全收尾)
> **版本对齐**: PRD v3.2 + v3.3 addendum
> **维护规则**:
> - 每次新增 F-ID 时,在对应小节追加一行
> - 每次完成节点 commit 时,在该 F-ID 行更新 commit hash + 日期
> - L1 冻结清单(F-001 ~ F-011)严禁删/重命名 — 见 PRD §0.2

---

## L1 冻结清单(v0.1 ~ v3.1,40+ 项)

> 这些是 v0.1 → v3.1 已经在产品中验证可用、或在 UI 原型中已设计的功能。Codex 在本次或未来任何迭代中,**不得删除、重命名或改变这些功能的核心行为**。

| F-ID | 功能 | 引入版本 | 最后验证 | 涉及文件(参考) |
|---|---|---|---|---|
| F-001 | 简历 PDF/DOCX/TXT 上传与文本抽取 | v0.1 | v3.1 | `apps/api/app/agents/parse/` |
| F-002 | JD 文件上传与文本抽取 | v0.1 | v3.1 | `apps/api/app/agents/parse/` |
| F-003 | 上传成功状态显示文件名 + 替换入口 | v0.1 | v3.1 | `apps/desktop/src/pages/upload/` |
| F-004 | 左侧二级导航(面试流程 / 我的数据) | v0.1 | v3.1 | `apps/desktop/src/components/Sidebar.tsx` |
| F-005 | BYOK 本地模式角标 | v0.1 | v3.1 | `apps/desktop/src/components/Sidebar.tsx` |
| F-006 | 岗位要求清单输出 | v0.1 | v3.1 | `apps/api/app/agents/parse/` |
| F-007 | 面试记录列表页 | v3.0 | v3.1 | `apps/desktop/src/pages/HistoryPage.tsx` |
| F-008 | 评估报告页(逐轮折叠 + 整体评价) | v3.0 | v3.1 | `apps/desktop/src/pages/ReportPage.tsx` |
| F-009 | 实时语音转文字(流式) | v3.0 | v3.1 | `apps/api/app/infra/asr/` + Azure SDK |
| F-010 | 配置页三参数(v3.2 改 4+6+3) | v3.0 | v3.3 | `apps/desktop/src/pages/ConfigPage.tsx` (重写见 F-307) |
| F-011 | LangGraph Agent 编排骨架 | v3.1 | v3.1 | `apps/api/app/orchestrator/turn_graph.py` |

### v3.1 期 Phase 实施记录(已归档)

50 个 P3-P5 节点的 commit 历史见 `.ralph/fix_plan.md` 的 "Archived" 区。

---

## v3.2 新增功能(F-301 ~ F-319,2026-04-30 部分实施)

> v3.2 PRD 中 14 个新增功能。P0 阶段(M0+M1)由 Ralph 自治循环 2026-04-30 跑完,实施了其中 7 个核心 F-ID(F-307/F-308/F-312/F-313/F-314/F-317/F-319)。其余 P1/P2 阶段(M2-M4)落地。

### P0 已完成(M0 + M1, 2026-04-30)

| F-ID | 功能 | 状态 | commit | 实施节点 |
|---|---|---|---|---|
| F-307 | 配置参数重写(4 风格 + 6 方向多选 1-3 + 3 时长) | ✅ done | `11b134a` | V32.M1.1 |
| F-308 | AI 面试官人格化(Sarah/Marcus/Lin/Daniel 4 人格名锁) | ✅ done | `37fa67f` | V32.M1.2 |
| F-312 | 五维度评分系统(专业深度/结构化表达/批判性思考/业务直觉/沟通节奏) | ✅ done | `696de48` | V32.M1.3 |
| F-313 | 单题评分(0-100 + tone) | ✅ done | `696de48` | V32.M1.3 |
| F-314 | 通过可能性 3 档(中上/中/中下,L0 伦理护栏) | ✅ done | `d3bc6c0` | V32.M0.3 |
| F-317 | 专项训练 CTA 深色卡(DarkActionCard + preset_config) | ✅ done | `d050b15` | V32.M1.5 |
| F-319 | 追问线索 chip(2-3 个,每个 ≤ 8 字) | ✅ done | `39a29c4` | V32.M1.4 |

### P1 待做(M2)

| F-ID | 功能 | 状态 | 计划节点 |
|---|---|---|---|
| F-306 | 等待态过场动画(Tips Carousel,parse 与 report 期间) | ✅ done | `5bff886` | V32.M2.1.4 |
| F-309 | 实时观察侧栏(NextQuestion.live_observation 字段) | ✅ done | `2d15550` | V32.M2.1.1 |
| F-310 | 实时统计(语速 / 填充词 / 用时 — 纯前端) | ✅ done | `c180456` | V32.M2.1.2 |
| F-311 | 键盘快捷键(Space/R/Esc) | ✅ done | `6071069` | V32.M2.1.3 |
| F-301 | 综合解析输出扩展(MatchScore + ProfileSummary + MatchAdvantages + Gaps) | ✅ done | `d14ea15` | V32.M2.2.1 |
| F-302 | 建议面试侧重模块(InterviewFocus 可编辑) | ✅ done | `827f63e` | V32.M2.2.3 |
| F-303 | 上传卡元数据展示(文件大小、页数/字数、抽取标签) | ✅ done | `699ad5b + 557fc7d` | V32.M2.2.2 + audit-fix |
| F-304 | 进度指示器(第 X 步 · 共 3 步) | ✅ done | `699ad5b` | V32.M2.2.2 |
| F-305 | 解析态元信息(由 Eatit AI · 于 N 秒前生成 + 重新解析按钮) | ✅ done | `827f63e` | V32.M2.2.3 |

### P2 待做(M3)

| F-ID | 功能 | 状态 | 计划节点 |
|---|---|---|---|
| F-316 | 面试记录 Dashboard(StatCards + AI 推荐卡 + 筛选 tabs + 表格) | ✅ done | `ea30874` | V32.M3.1.4 |
| F-318 | Coach Agent(跨 session 异步分析 + UserInsightCache) | ✅ done | `13a3da5 + f62ffd5 + 8fff706` | V32.M3.1.1-3 |

### P3 已完成(M4, 2026-05-01)

| F-ID | 功能 | 状态 | commit | 实施节点 |
|---|---|---|---|---|
| F-315 | 配额体系前端展示(Sidebar 配额卡,纯前端 localStorage mock,L0 A18 enforced) | ✅ done | `bbfc3af` | V32.M4.1 |

> **v3.3 全收尾**(2026-05-01):M4.1-M4.4 + M4.X 收口完成,F-315 落地 +
> woff2 字体本地子集化(`ed1ce0d`)+ Playwright 烟雾 E2E(`8cd24d3`)+
> locust 性能基线骨架(`01de0ae`)。所有 v3.2 / v3.3 F-ID 已交付。

---

## v3.3 新增功能(F-320 ~ F-322,2026-04-30 入档,M2-M3 落地)

> 老板 2026-04-30 新增需求,见 [`docs/PRD/Eatit_PRD_v3_3_addendum.md`](PRD/Eatit_PRD_v3_3_addendum.md)。

| F-ID | 功能 | 状态 | 计划节点 | Agent |
|---|---|---|---|---|
| F-320 | 公司/行业情报抽取(联网模式,opt-in) | ✅ done | `3b762bb + a322a57 + 821172e + 557fc7d` | V32.M2.3.1-4 + audit-fix | **Research Agent**(新,M2.3.1) |
| F-321 | 解析阶段同步出预测面试题库(8-15 道) | ✅ done | `18d9b7b + 821172e + 557fc7d` | V32.M2.3.3-4 + audit-fix | Framework Agent 扩展 |
| F-322 | 独立于 Report 的 AI 复盘报告(教学版) | ✅ done | `4ca25d9 + 0e92324 + eab98cf + d08ea08` | V32.M3.2.1-3 + audit-fix | **Reflection Agent**(新,M3.2.1) |

---

## P0 阶段间接成果(无 F-ID,但 commit 进仓)

> 设计系统地基 + 红线护栏 + 数据兼容 — 不直接对应 F-ID,但保障了所有 F-ID 的实施基础。

| 节点 | 内容 | commit |
|---|---|---|
| V32.M0.1a | 按钮共享类(.btn 7 变体落到 @layer components) | `4cc40e5` |
| V32.M0.1b | 卡片共享类(.card 4 变体) | `29696a6` |
| V32.M0.1c | 标签共享类(.tag 6 变体) | `8b06afd` |
| V32.M0.1d | 互动共享类(.tile / .kbd / .input / .bar 共 11 个) | `be3455a` |
| V32.M0.1e | 排版共享类(.h1/.h2/.h3/.body/.muted) | `44db298` |
| V32.M0.1f | 布局共享类 + shadcn UI 退役(删 button/card.tsx + 重写 dialog.tsx + 删 18 个 HSL bridge 变量) | `eaf8c16` |
| V32.M0.2 | Tailwind 默认色板封禁(theme.colors 显式覆盖 + ESLint + lint:design-tokens CI job) | `23645bc` |
| V32.M0.4 | Sidebar 版本号统一改 v3.2 | `a8538bb` |
| V32.M0.5 | LangGraph turn_graph 节点名锁断言(`test_graph_contract.py`) | `4ec8cfc` |
| V32.M0.6 | design-reference 目录归位到 `eatit/docs/design-reference/` | `39f9ba7` |

---

## 文档变更历史

| 版本 | 日期 | 变更 |
|---|---|---|
| 初版 | 2026-04-30 | 创建本文件,镜像 PRD v3.2 + v3.3 addendum 的全部 F-ID;2026-04-30 P0 完成的 7 个 F-ID 全部记入 |
| v3.3 全收尾 | 2026-05-01 | M4 收口 — F-315 SidebarQuotaCard 落地;woff2 字体本地子集化 / Playwright 烟雾 E2E / locust 性能骨架 三个间接成果一并入档 |
