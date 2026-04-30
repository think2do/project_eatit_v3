# Eatit v3.2+ P1/M2.1 Fix Plan

Source of truth for what's left. Ralph picks the **first unchecked item** in "High Priority" each loop. Section specs live in:

- **当前阶段(P1/M2.1)**: [`.ralph/specs/v32-p1-constraints.md`](specs/v32-p1-constraints.md) + [`.ralph/specs/v32-p1-sections.md`](specs/v32-p1-sections.md)
- 上一阶段(P0,已完成 2026-04-30): [`.ralph/specs/v32-p0-constraints.md`](specs/v32-p0-constraints.md) + [`.ralph/specs/v32-p0-sections.md`](specs/v32-p0-sections.md)
- 历史阶段(v3.1,已归档): `.ralph/specs/phase3-sections.md`、`phase3.5-sections.md`、`phase4-sections.md`、`phase5-sections.md`

Match the section prefix(V32.M2.*)to 当前 spec 文件即可。

## High Priority (work top-down)

> P1 / M2.1 = 实时面试增强(F-309 / F-310 / F-311 / F-306 + InterviewPage 顶部重构)。共 5 个节点。
> 依赖关系见 v32-p1-sections.md "Execution order" 表。Ralph 必须按下方顺序执行。

- [ ] V32.M2.1.2 F-310 实时统计纯前端 hook(useTurnStats + fillerWords L0 双端锁 + 引入 Vitest 框架)
- [ ] V32.M2.1.3 F-311 键盘快捷键(useGlobalKeymap + EndConfirmDialog + KeyboardShortcutHelper)
- [ ] V32.M2.1.4 F-306 Tips Carousel 替换 WaitingTips(tips.json 静态库 + selectTips 合并 + 完成态 ✓ 过渡)
- [ ] V32.M2.1.5 InterviewPage 顶部重构(REC 脉冲 + Session meta strip + WaveBars + 近 3 轮摘要 + 全部接入 M2.1.1-4 产出)

## Completed (P1/M2.1 — v3.2+)

- [x] V32.M2.1.1 F-309 实时观察侧栏(InterviewerAgentOutput.live_observation ≤30 字 + LiveObservationCard + 7 boundary tests + A13 Observer fallback) (2d15550, 2026-04-30)

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
