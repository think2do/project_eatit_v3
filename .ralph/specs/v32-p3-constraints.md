# v3.2+ P3/M4 Hard Constraints (Quality Gate + 收口)

These are the architecture red lines for **v3.2+ P3 / M4** —
配额前端 mock(F-315)+ 字体本地子集化 + Playwright 烟雾 E2E + locust 性能基线。

**所有 [v32-p2-constraints.md](v32-p2-constraints.md) + [v32-p1-constraints.md](v32-p1-constraints.md) + [v32-p0-constraints.md](v32-p0-constraints.md) 的红线继续生效**,本文件只补 M4 阶段的增量红线。

---

## A. Architecture(继承 P0/P1/P2 + 新增)

### A18 — F-315 配额仅前端 mock,严禁触达后端

PRD §0.4 明确"商业化未定";F-315 是 Sidebar 视觉占位,**不得引入任何后端字段、API、数据库表**。

**实现约束**:
- 计数全部走 `localStorage`(key = `eatit:quota:mock`),内容形如 `{used: int, limit: int, resetAt: ISO}`
- 默认 `{used: 0, limit: 10}`(每月 10 次面试 mock 上限)
- 计数读写仅在 `apps/desktop/src/lib/quotaMock.ts` 这一个模块内完成
- 严禁在 `apps/api` 任何路由 / schema / 数据库新增 quota 字段
- 严禁伪造"本月剩余 X 次"的真实业务承诺;UI 文案需含"mock"或"占位"提示

### A19 — 字体本地子集化:不得新增网络依赖

`apps/desktop/src/index.css:1` 当前从 `fonts.googleapis.com` 加载 Inter / Instrument Serif / JetBrains Mono。Tauri 启动 / 离线场景会受网络抖动影响。

**实现约束**:
- 字体文件落到 `apps/desktop/public/fonts/`(woff2 格式)
- 在 index.css 用 `@font-face` 替代 `@import url(...)`;不得保留 `googleapis.com` URL
- 子集化应只包含 latin + CJK punctuation + 常用汉字范围(避免 woff2 体积失控);单文件 ≤ 200 KB
- License 文件随字体一起入库(`fonts/LICENSE-{Inter|InstrumentSerif|JetBrainsMono}.txt`)

### A20 — Playwright E2E 必须用 mock backend,不得走真 LLM

**实现约束**:
- E2E 必须用 Vitest mock 化的 API client(或 MSW handlers),不得直接打 `apps/api`
- 单场景执行时间 ≤ 30s(超出立刻 fail)
- 不得用真实 BYOK key;不得在 CI 中调用任何外部网络
- 测试 fixture 全部 hardcoded(包含 ParseResult / NextQuestion / InterviewReport mock 数据)

### A21 — locust 性能基线本地跑,不上 CI

性能压测对环境敏感,数字仅作为**本地基线对比**用,不阻塞 CI。

**实现约束**:
- locust 脚本落 `apps/api/tests/perf/`;**不**纳入 `pytest --collect-only` 收集
- 必须用 mock LLM gateway(可注入固定 sleep 模拟 P95)— 不得调用真 LLM
- README 写明"本地用 `uv run locust -f tests/perf/parse_baseline.py` 跑;CI 不跑"
- 输出基线写到 `tests/perf/baseline.md`(本节点产物之一),后续节点可对比

---

## B. Engineering Discipline(继承)

继承 v32-p2-constraints.md §B 全部条款。

新增:

### B-M4 — Ralph 节点边界

- M4 单节点 ≤ 8 文件改动(F-315 / 字体 / Playwright / locust 各自独立)
- Playwright / locust 节点的 Acceptance 命令必须可在 ≤ 5 分钟内跑完(否则拆子节点)
- 不得在 M4 节点中"顺手"动 P0/P1/P2 已完成代码 — 跨阶段改动必须新建独立 audit-fix 节点

---

## C. Secrets / D. Design / E. Migration / F. Test Floor / G. Doc Sync

继承 v32-p2-constraints.md §C / §D / §E / §F / §G 全部条款。

新增 §F 测试地板:

- 后端 ≥ 471(M3 收尾基线);新增 perf/locust 不计入此地板
- 前端 Vitest ≥ 160(M3 收尾基线);Playwright E2E 单独计 ≥ 1
- F-315 quotaMock.ts 必须有 ≥ 4 条单测(read/write/reset/边界)

新增 §G 文档同步:

- M4 全部完成后,在 `docs/FEATURES.md` 追加 F-315 行(标记 ✅ done)
- 不再单独更新 ROADMAP 当前阶段(M4 = 收口阶段,完成即 v3.3 全收尾)
