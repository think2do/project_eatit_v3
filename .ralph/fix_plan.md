# Eatit v3.2+ P3/M4 Fix Plan

Source of truth for what's left. Ralph picks the **first unchecked item** in "High Priority" each loop. Section specs live in:

- **当前阶段(P3/M4)**: [`.ralph/specs/v32-p3-constraints.md`](specs/v32-p3-constraints.md) + [`.ralph/specs/v32-p3-sections.md`](specs/v32-p3-sections.md)
- 上一阶段(P2/M3,已完成 2026-05-01): [`.ralph/specs/v32-p2-constraints.md`](specs/v32-p2-constraints.md) + [`.ralph/specs/v32-p2-sections.md`](specs/v32-p2-sections.md)
- 上上阶段(P1/M2,已完成 2026-04-30): [`.ralph/specs/v32-p1-constraints.md`](specs/v32-p1-constraints.md) + [`.ralph/specs/v32-p1-sections.md`](specs/v32-p1-sections.md)
- P0 阶段(已完成): [`.ralph/specs/v32-p0-constraints.md`](specs/v32-p0-constraints.md) + [`.ralph/specs/v32-p0-sections.md`](specs/v32-p0-sections.md)
- 历史阶段(v3.1,已归档): `.ralph/specs/phase3-sections.md`、`phase3.5-sections.md`、`phase4-sections.md`、`phase5-sections.md`

Match the section prefix(V32.M4.*)to 当前 spec 文件即可。

## High Priority (work top-down)

> P3 / M4 = 收口阶段 = F-315 配额 mock + 字体本地子集化 + Playwright 烟雾 E2E + locust 性能基线 + 文档收尾。
> 4 主节点 + 1 收尾。任一节点 fail 不向后跑。完成后 v3.3 全收尾,EXIT_SIGNAL: true。

- [ ] V32.M4.3 — Playwright 烟雾 E2E(2 spec:upload-to-config + report-renders + mock backend fixtures)
- [ ] V32.M4.4 — locust 性能骨架(parse_baseline.py + baseline.md + README + pytest collect 排除)
- [ ] V32.M4.X — M4 收尾文档同步(FEATURES F-315 ✅ + fix_plan 收尾 banner + EXIT_SIGNAL=true)



## Completed (P3/M4 — v3.2+)

- [x] V32.M4.1 F-315 SidebarQuotaCard + quotaMock localStorage(read/increment/reset/getRemaining + 跨月自动归零 + 默认 0/10 + "占位" 文案 + 5+4=9 vitest 单测;前端 160→169) (bbfc3af, 2026-05-01)
- [x] V32.M4.2 woff2 字体本地子集化(Inter Regular/Medium/Semibold 18-19K + Instrument Serif Regular 20K + JetBrains Mono Regular 30K + 3 SIL OFL 1.1 LICENSE + index.css 5 @font-face 替换 googleapis @import;A19 enforced) (ed1ce0d, 2026-05-01)

## Completed (P2/M3 — v3.2+)

- [x] V32.M3.X M3 audit-fix(G1 fire-and-forget 隔离测试 2 case:Coach build raise → report READY + Reflection build raise → report READY;G2 HistoryPage 集成测试 4 case:null/ok/running/failed AICoachCard 切分;只动测试,不动产品代码;后端 469→471 / 前端 156→160) (d08ea08, 2026-05-01)
- [x] V32.M3.2.3 F-322 ReportPage [评估] [详细复盘] tabs + ReflectionView 状态机(SegmentTabs 通用组件 + MockDialogue 双向气泡 + PerQuestionCoachingCard 折叠卡 + ReflectionView 6 状态 absent/loading/running/ok/failed/error + 2s/180s 轮询 + cached store 跳过首次 fetch + getReflection API client + reflection store slot + 14 tests;前端 142→156) (eab98cf, 2026-05-01)
- [x] V32.M3.2.2 F-322 reflection_node parallel coach + reflection_reports 表 + API(20260501_0001 迁移 + ReflectionReportRow session_id UNIQUE + ix_rr_session + SqlAlchemyReflectionReportRepository 4 lifecycle + uuid7 PK + DBReflectionReportLoader joins reports×turns + ReflectionService + GET /sessions/{id}/reflection 204/200/404 跨 user 鉴权 + POST_REPORT_GRAPH_NODES 锁扩到 {coach_node, reflection_node} + _generate_report_task 单 graph spawn 覆盖两节点 + 14 tests;后端 460→469) (0e92324, 2026-05-01)
- [x] V32.M3.2.1 F-322 Reflection Agent + ReflectionReport schema + 教学语气护栏(reflection 包 schemas/service/__init__ + system.j2/user.j2 + AGENT_NAMES 10 + extra=forbid 拒 PII + 12 禁止词 sanitize_tone + ACCUSATORY_PREFIXES "建议下次" 重写 + AI_VERDICT_CORE_TERMS 后置 regex 防重复评价 + ReflectionReport TS 类型 + 40 tests;后端 418→460) (4ca25d9, 2026-05-01)
- [x] V32.M3.1.5 F-316 复用上次配置 + HistoryFooterCTA(extractConfigFromSnapshot 防御 v3.1 老 snapshot + pickLastReusableConfig 跳过 malformed 行 + skipUpload/reuseLastConfig/consumeSkipUpload store actions + UploadPage useEffect 消费并 redirect /config + HistoryPage 挂 HistoryFooterCTA + 14 tests;前端 128→142) (4b8f3ec, 2026-05-01)
- [x] V32.M3.1.4 F-316/F-318 Dashboard 整版重写(4 StatCard + AICoachCard linear-gradient brand-softer + 4 FilterTabs + 6 列 SessionTable + getUserInsights API client + insights store slot + HistoryPage 全量重写并保留 MetaReport modal + 20 tests;前端 108→128) (ea30874, 2026-05-01)
- [x] V32.M3.1.3 F-318 user_insight_cache 表 alembic + GET /api/v1/users/me/insights API(20260430_0003 迁移 + UserInsightCacheRow + ix_uic_user_session + SqlAlchemyUserInsightCacheRepository 5 lifecycle 方法 SQLite ON CONFLICT + GET 路由 204/200 + build_default_coach_service 切到真 repo + 6 tests;后端 412→418) (8fff706, 2026-04-30)
- [x] V32.M3.1.2 F-318 post_report_graph + asyncio.create_task 异步触发(POST_REPORT_GRAPH_NODES={coach_node} A7-style 锁 + CoachService Protocols + InMemoryUserInsightCacheRepository 默认 + DBRecentReportsReader + _generate_report_task 末尾 fire-and-forget + _POST_REPORT_TASKS 强引用集 + 场次<3 跳过 / 幂等 / 失败非致命 / reader 抛错静默 + 12 tests;后端 400→412) (f62ffd5, 2026-04-30)
- [x] V32.M3.1.1 F-318 Coach Agent + UserInsightCache schema + 教学语气护栏(coach 包 schemas/service/__init__ + system.j2/user.j2 + AGENT_NAMES 9 + extra=forbid 拒 PII + 12 禁止词 sanitize + UserInsightCache TS 类型 + 21 tests;后端 377→400) (13a3da5, 2026-04-30)

## Completed (P1/M2.3 — v3.2+)

- [x] V32.M2.3.X M2.3 audit-fix(G1 _extract_company_and_role 改 Parse-driven jd_* + G2 _resolve_tools + 去 service.py:119 注释 + G3 ParseRequestResponse + UploadPage / store / ParsedPanel 透传 research_payload/predicted_questions + G4 research_cache repo 真读写 30天 TTL + G5/G6 ParsedPanel.research + ResearchOptInSection 集成测试 + G7 probe=True happy path + G8 except 已收窄至 PdfReadError/ValueError + G9 DialogTitle;intake_graph 并行→sequential trade-off;后端 365→377 / 前端 102→108) (557fc7d, 2026-04-30)
- [x] V32.M2.3.5 F-320/F-321 ParsedPanel 3 块卡 + PrivacyOptInDialog(CompanyCard + IndustryCard + PredictedQuestionList + Settings opt-in toggle + L0 A11 模态确认 + 21 tests;前端 81→102) (3bc6544, 2026-04-30)
- [x] V32.M2.3.4 F-320/F-321 intake_graph LangGraph(parse_node || research_node → predict_questions_node + 15s research timeout + opt-out short-circuit + trigger_parse 改用 intake_graph + 8 contract tests + turn_graph A7 锁未动;后端 354→362) (821172e, 2026-04-30)
- [x] V32.M2.3.3 F-321 Framework Agent PredictedQuestionBank(8-15 道 + 4 category + 3 source 枚举 + Framework 接 Research 输入 + Interviewer 软优先 + 20 tests;后端 334→354) (18d9b7b, 2026-04-30)
- [x] V32.M2.3.2 F-320 research_cache 表 + opt-in API(alembic 20260430_0002 30-day TTL + research_opt_in 加入 ALLOWED_KEYS + GET/PUT /api/v1/settings/research-opt-in StrictBool + 6 tests;后端 328→334) (a322a57, 2026-04-30)
- [x] V32.M2.3.1 F-320 Research Agent + LLM web_search tool 适配(extra=forbid + cache_key sha256 + audit log 脱敏 + BYOK tool use probe 降级 + 12 tests + AGENT_NAMES 增至 8;后端 314→328) (3b762bb, 2026-04-30)

## Completed (P1/M2.2 — v3.2+)

- [x] V32.M2.2.X M2.2 audit-fix(F-303 chips + MatchScore cross-field validator + 3 service fallback tests + 4 ParsedPanel integration tests + 3 ConfigPage focusSync tests + ParsedMetaBar 60s 自刷新;后端 299→314 / 前端 74→81) (4126dd3, 2026-04-30)
- [x] V32.M2.2.1 F-301 后端 ParseResult schema 扩展(MatchScore + profile_summary + advantages/gaps + interview_focus + project_hooks_v32 + 7 子 schema + 30 边界测试) (d14ea15, 2026-04-30)
- [x] V32.M2.2.2 F-303 候选 profile chips + F-304 PageStepIndicator(3 页统一 eyebrow + ParseResultCard ProfileChips + 4 tests;meta 行 file size/pages 推迟到 M2.2.4) (699ad5b, 2026-04-30)
- [x] V32.M2.2.3 F-302 FocusCard + F-305 ParsedMetaBar(relativeTime + selectedFocusIds store 联动 ConfigPage directions + 14 tests) (827f63e, 2026-04-30)
- [x] V32.M2.2.4 ParsedPanel 整页重构(MatchDial SVG 圆环 + StrengthGapList 双栏 + 接入 M2.2.1-3 + TipsCarousel large + 删老 ParseResultCard + 10 tests + 全量 74 passed) (31cdeec, 2026-04-30)

## Completed (P1/M2.1 — v3.2+)

- [x] V32.M2.1.X 测试缺口修补(audit fix:G1 bootstrap force-None / G2 删自证循环 + 改 prompt 文本守护 / G3 后端 fillerWords 锁 + 双端 diff / G4 wpm=100/200 边界 / G5/G6 TipsCarousel lower-bound + spec 4-5s 间隔 / G7 LiveObservationCard fallback / G8 contentEditable / G9 A10 legacy schema 6 项 / G10 InterviewPage 4 组件 smoke;后端 +12 / 前端 +20) (fb9bd15, 2026-04-30)
- [x] V32.M2.1.1 F-309 实时观察侧栏(InterviewerAgentOutput.live_observation ≤30 字 + LiveObservationCard + 7 boundary tests + A13 Observer fallback) (2d15550, 2026-04-30)
- [x] V32.M2.1.2 F-310 实时统计纯前端 hook(useTurnStats + 双端 L0 fillerWords 锁 + Vitest@^2 框架引入 + 12 tests + InterviewPage stat row) (c180456, 2026-04-30)
- [x] V32.M2.1.3 F-311 键盘快捷键(useGlobalKeymap + EndConfirmDialog + KeyboardShortcutHelper + 7 tests + 提前结束 按钮统一走确认弹窗) (6071069, 2026-04-30)
- [x] V32.M2.1.4 F-306 TipsCarousel 替换 WaitingTips(tips.json 25 条 + selectTips 合并 + 完成态 ✓ 0.4s 过渡 + 7 tests + 3 调用点迁移) (5bff886, 2026-04-30)
- [x] V32.M2.1.5 InterviewPage 顶部重构(RecBadge + SessionMetaStrip + WaveBars + RecentRounds + eatit-wave keyframe + session detail fetch + pastRounds 本地历史) (e60f8ea, 2026-04-30)

## Completed (P0 — v3.2+, 2026-04-30)

- [x] V32.M0.1a 按钮共享类(7 个 .btn 变体落到 @layer components) (4cc40e5, 2026-04-30)
- [x] V32.M0.1b 卡片共享类(.card / .card-pad / .card-pad-lg / .card-header 共 4 个) (29696a6, 2026-04-30)
- [x] V32.M0.1c 标签共享类(.tag + .tag-green/warn/info/line/dot 共 6 个) (8b06afd, 2026-04-30)
- [x] V32.M0.1d 互动共享类(.tile + .kbd + .input/.textarea + .bar/.bar-warn 共 11 个) (be3455a, 2026-04-30)
- [x] V32.M0.1e 排版共享类(.h1 / .h2 / .h3 / .body / .muted 共 5 个) (44db298, 2026-04-30)
- [x] V32.M0.1f 布局共享类 + shadcn 退役(.row/.col/.between/.wrap/.grow/.divider/.divider-v 共 7 个 + 删 button/card.tsx + 重写 dialog.tsx + 删 18 个 HSL bridge 变量) (eaf8c16, 2026-04-30)
- [x] V32.M0.2 Tailwind 默认色板封禁(theme.colors 显式覆盖 + ESLint 规则 + lint:design-tokens CI job) (23645bc, 2026-04-30)
- [x] V32.M0.3 F-314 PassProbabilityRing → HeroScoreCard(伦理红线整改 + 12 禁止词 fuzz + ai_verdict 扫描) (d3bc6c0, 2026-04-30)
- [x] V32.M0.4 Sidebar 版本号统一改 v3.2(brand-sub 文案对齐) (a8538bb, 2026-04-30)
- [x] V32.M0.5 LangGraph 节点名锁断言(test_graph_contract.py 防改名) (4ec8cfc, 2026-04-30)
- [x] V32.M0.6 design-reference 目录归位到 eatit/docs/design-reference/ (39f9ba7, 2026-04-30)
- [x] V32.M1.1 InterviewConfig 4+6+3(F-307,4 风格 + 6 方向多选 1-3 + 15/30/45 时长 + Alembic migration + 20 boundary tests) (11b134a, 2026-04-30)
- [x] V32.M1.2 InterviewerPersona 4 人格名锁(F-308,Sarah/Marcus/Lin/Daniel + 5 tests + persona_name_guard.py) (37fa67f, 2026-04-30)
- [x] V32.M1.3 五维度评分 + 单题评分(F-312/F-313,dimensions[5] + RoundReviewV2 + 降级补 50 分 + 20 tests) (696de48, 2026-04-30)
- [x] V32.M1.4 追问线索 chip(F-319,followup_hints[2-3, ≤8 chars] + 8 boundary tests + WS plumbing) (39a29c4, 2026-04-30)
- [x] V32.M1.5 专项训练 CTA 深色卡(F-317,DarkActionCard + derive_preset_config 弱项映射 + 6 tests) (d050b15, 2026-04-30)

## Archived (P3 / P3.5 / P4 / P5 — v3.1 时代)

> 以下是 2026-04 v3.1 阶段完成的 50 个节点,作为历史记录保留。Ralph 不再消费这些节点 spec。

- [x] P5.X Phase 5 test sweep + tauri build dry run (3d88ecc, 2026-04-24)
- [x] P5.6 Error boundaries + WS reconnect + friendly toasts (a20588b, 2026-04-24)
- [x] P5.5 Sentry scaffold with secret redaction (f3e1742, 2026-04-24)
- [x] P5.4 Print-to-PDF on report page (1068060, 2026-04-24)
- [x] P5.2 Unsigned DMG build config + script (93439c8, 2026-04-24)
- [x] P5.1 Real app icon — SKIPPED (no assets/brand/icon.png supplied; per spec no-op) (a8ed186, 2026-04-24)
- [x] P4.X Phase 4 test sweep + E2E (f016b1a, 2026-04-24)
- [x] P4.6 Settings voice toggle + /api/v1/asr/health (ad50efb, 2026-04-24)
- [x] P4.5 InterviewPage voice UX — hold-to-talk + live caption (9858c18, 2026-04-24)
- [x] P4.4 Desktop mic permission + capture — MediaRecorder + Info.plist (8a15fec, 2026-04-24)
- [x] P4.3 Runtime audio pipeline — streaming audio → ASR → turn answer (186ce31, 2026-04-24)
- [x] P4.2 WS audio protocol — binary frames + transcript events (dee8c14, 2026-04-24)
- [x] P4.1 ASR infra — Azure Speech SDK + abstraction + mock backend (0c0e0b1, 2026-04-24)
- [x] P3.5X Test sweep + E2E — meta + observer smoke (a6782c8, 2026-04-24)
- [x] P3.5B.3 Interview observer sidebar — panel + settings toggle (5bd383b, 2026-04-24)
- [x] P3.5A.3 MetaReport frontend — list + detail page + history CTA (70061b5, 2026-04-24)
- [x] P3.5B.2 Orchestrator + WS observer wiring — server.coach.observation event (adc6da3, 2026-04-24)
- [x] P3.5B.1 ObserverAgent — live coaching agent (≤ 60 char observations) (f81d72b, 2026-04-24)
- [x] P3.5A.2 MetaReport REST + storage — async pipeline + polling API (42615fa, 2026-04-24)
- [x] P3.5A.1 MetaReportAgent — cross-session trend agent (10cf62a, 2026-04-24)
- [x] P3.12 Test sweep + end-to-end smoke (85e0ff7, 2026-04-23)
- [x] P3.10c InterviewPage + HistoryPage + ReportPage — XState + WS + report fields (a090aa7, 2026-04-23)
- [x] P3.10b UploadPage + ConfigPage — real business bodies (fb0eff8, 2026-04-23)
- [x] P3.5 REST/WS real — agents wired + WS first-frame protocol (de997ea, 2026-04-23)
- [x] P3.4 LangGraph orchestrator — turn_graph + SessionRuntime TaskGroup cleanup (7307059, 2026-04-23)
- [x] P3.3 Six Agents — instructor-driven Parse / Framework / Interviewer / Reference / Compression / Report (cf96d48, 2026-04-23)
- [x] P3.8 OnboardingPage — 4-step first-run wizard + app_settings REST (50a1653, 2026-04-23)
- [x] P3.9 SettingsPage — BYOK form + test connection (5c73c88, 2026-04-23)
- [x] P3.1 LLM infra — BYOK gateway + test endpoint + header middleware (8082684, 2026-04-23)
- [x] P3.2 Prompts — six agent Jinja2 templates with guardrails (8bed096, 2026-04-23)
- [x] P3.6 app_settings table — local UI state with secret blocklist (35bea78, 2026-04-23)
- [x] P3.7 Rust keychain — macOS keyring integration + TS wrappers (19fa33a, 2026-04-23)
- [x] P3.10a AppShell + Sidebar + HomePage (83e0191, 2026-04-23)
- [x] chore: placeholder Tauri icons (d298b6d, 2026-04-23)

## Notes

- One commit per High Priority item (Conventional Commits prefix as specified in v32-p0-sections.md per node).
- Do not merge multiple nodes into one commit even if they feel related.
- Move items from "High Priority" to "Completed" in the same commit that implements them, with the commit hash + date appended.
- 当 11 个 V32.M0/M1 节点全部 [x] 后,EXIT_SIGNAL: true 收口;后续 M2(F-309/310/311/319/306 + F-320/321)需要新 spec 文件 v32-p1-sections.md。
- M2.3.X audit-fix 完成后,P1/M2 全批(M2.1 + M2.2 + M2.3 + 3 audit-fix = 17 节点)收口。下一批 M3 需要 v32-p2-sections.md。
