# v3.2+ P0 Hard Constraints (M0 + M1 不可违反)

These are the architecture red lines for the v3.2+ P0 milestone (M0
red-line cleanup + design-system foundation, then M1 v3.2 schema
trio alignment). All Phase 3/3.5/4/5 constraints in
[phase3-constraints.md](phase3-constraints.md) carry over; this file
adds the v3.2+ specifics.

If any implementation step would violate one of these, **stop and
report — do not proceed.**

---

## A. Architecture (新增 v3.2+)

### A5 — pass_likelihood 必须只输出 3 档枚举(伦理护栏)

PRD L0 红线:报告页"通过可能性"指标必须输出
`Literal["中上", "中", "中下"]` 之一,**严禁输出**:

- 数值(0-100 整数,留作 internal `pass_probability` 兼容字段,但不向用户展示)
- "不建议"、"不通过"、"不合格"、"淘汰"、"不推荐"、"建议放弃"、
  "不适合"、"低"、"差"、"非常低"、"reject"、"no"
- 任何其他非 3 档枚举的字符串

LLM 输出非法值时,后端必须**强制覆盖**为 derive_pass_likelihood 计算
结果(规则见 `apps/api/app/domain/reports/service.py`),并触发
WARN 日志。

### A6 — InterviewerPersona 4 个名字锁定

| style | name | 不可改名 |
|---|---|---|
| structured | Sarah | ✅ |
| pressure | Marcus | ✅ |
| friendly | Lin | ✅ |
| expert | Daniel | ✅ |

`PERSONA_MAP` 在 `apps/api/app/agents/interviewer/personas.py` 是
`Final` 只读常量。Pydantic Literal 类型注解锁死 4 个 name。任何
PR 改名(替换为 Alice/Emma/Bob 等)CI 必须 fail。

### A7 — LangGraph turn_graph 节点名锁

turn_graph 节点集合 = `{"turn_assessment", "compression", "interviewer"}`,
**严禁**重命名、合并、拆分。

新增 Coach / Reflection 节点(M3)挂在独立的 `post_report_graph.py`
里,**不动 turn_graph**。

### A8 — 五维度评分 name 严格锁

`InterviewReport.dimensions` 长度严格等于 5,name 严格匹配:

| index | name |
|---|---|
| 0 | 专业深度 |
| 1 | 结构化表达 |
| 2 | 批判性思考 |
| 3 | 业务直觉 |
| 4 | 沟通节奏 |

LLM 输出 < 5 个 dimensions 时:Instructor retry 1 次 → 仍失败补齐
缺失维度为 50 分(`description="评分异常,默认中性"`),不得静默丢弃。

### A9 — 填充词列表锁

`apps/desktop/src/lib/fillerWords.ts` 与
`apps/api/app/agents/observer/constants.py` 双端定义,内容严格为:

```
["嗯", "呃", "那个", "就是", "这个", "反正", "然后然后"]
```

**严禁**修改、删除、增加。两端必须一致(CI grep 校验)。

### A10 — 数据契约只增不改(L0 复述)

`InterviewReport.pass_probability`(老 0-100 字段)+ `Verdict`
枚举 + `RoundReview`(老结构)+ `next_actions: list[str]`(老结构)
**全部保留**作向后兼容;v3.2+ 新增字段并行存在,不替换。

具体来说:

- 新增 `pass_likelihood: Literal["中上","中","中下"] | None`
- 新增 `dimensions: list[DimensionScore]`(默认 `[]`)
- 新增 `round_reviews_v2: list[RoundReviewV2]`(默认 `[]`)
- 新增 `next_actions_v2: NextActions | None`
- 新增 `ai_verdict: str | None`
- 新增 `overall_score: int | None`(0-100,与 pass_probability 不同维度)

InterviewConfig 同样:`directions: list[InterviewDirectionV32]` 新字段,
老 `direction` 保留为 deprecated。

### A11 — 联网情报检索隐私护栏(M2 起生效,M0/M1 仅作记录)

> ⚠️ **M0/M1 不实现联网功能**,但本节先入档,M2.3 实施时直接套用。

PRD 0.2 隐私红线扩展条款:

1. 联网情报检索功能必须**用户 opt-in**(Settings 持久化开关 +
   首次启用模态确认)
2. 发往 LLM/搜索 API 的 payload **只含**:公司名 + 岗位名 +
   行业关键词(从 JD 抽取)
3. **严禁**发送:简历正文、用户姓名、邮箱、电话、其他 PII
4. 日志埋点中 `cache_key` 必须 hash 化,不留明文公司名
5. 用户拒绝授权时,Research Agent 跳过运行,前端 ParsedPanel
   不显示公司/行业/预测题三块

---

## B. Engineering Discipline(继承自 phase3-constraints.md §B)

1. **One commit per section.** Conventional Commits prefix as
   specified in v32-p0-sections.md per section.
2. **Full errors surfaced.** When a verification command fails,
   show the complete error message. No `--no-verify`,
   `pytest -x --lf` silencing, or try/except catch-all that swallows.
3. **No placeholder implementations.** If a section's acceptance
   says "Pydantic Literal enforces 5 dimensions", a stub that
   returns `[]` doesn't count.
4. **Relative paths only.** `/Users/...` must not appear in source,
   tests, or documentation. Use `~/` or repo-relative paths.
5. **No remote push.** Ralph commits locally. Pushing is the user's
   call.
6. **`.ralph/` and `.ralphrc` are protected.** Never modify or delete.

---

## C. Secrets hygiene(继承自 phase3-constraints.md §C)

- `LLMConfig.api_key: SecretStr` — retrieve only at the call site
  to LiteLLM via `config.api_key.get_secret_value()`
- Never log `api_key` in stdout / structlog / Sentry / DB / cache
  keys / error responses / commits / docs
- `app_settings` table 仍然遵循 secret blocklist regex
- **新增:Research Agent / Reflection Agent 的 prompt 输入与
  audit log 也必须遵守同样的 secret 规则,且不得包含 resume_text。**

---

## D. Design System / Style(扩充)

### D1 — 严禁 Tailwind 默认色板

```
❌ bg-green-500 / text-orange-600 / border-gray-200 / bg-blue-XXX
❌ 任何 bg-(red|green|blue|yellow|orange|gray|slate|zinc|neutral|stone)-NNN
✅ var(--brand) / var(--ink-900) / var(--warn-soft) (所有 design-reference token)
✅ className 用 .btn / .card / .tag / .tile / .kbd 等共享类
```

`tailwind.config.ts` 中 `theme.colors` 已显式覆盖只保留
`{ transparent, current, inherit, border }`。M0.2 起,任何使用默认
色板的 PR 在 `pnpm lint` 阶段 fail。

### D2 — 严禁直写 hex 色值

```
❌ color: "#1F6B3A" / background: "#FAFAF7"
✅ color: "var(--brand)" / background: "var(--bg)"
```

例外:`color: white` / `color: black` / `color: transparent` 允许。

### D3 — 共享 className 必须复用,严禁自创

`apps/desktop/src/index.css` `@layer components` 中的 21 个
className(.btn / .card / .tag / .tile / .kbd / .input / .bar /
.row / .col / .h1 / .h2 / .h3 / .body / .muted / .between / .wrap /
.grow / .divider / .divider-v / 等)是设计系统真理。

```
❌ 自创 .my-button / .ds-btn / .eatit-card 等带前缀的同义类
❌ 用 inline style={{...}} 重写按钮和卡片
✅ <button className="btn btn-brand btn-lg">开始面试</button>
✅ <div className="card card-pad-lg">…</div>
```

### D4 — 设计系统真理来源优先级

1. PRD 第 13 章 design token 描述
2. `eatit/docs/design-reference/styles.css`(M0.6 后从仓库根迁移到此)
3. `eatit/docs/design-reference/page-*.jsx`(原型代码)

冲突时以 PRD 为准(详见 plan 文件 §"风险 5")。

### D5 — Style(继承 phase3 §D)

- Python: ruff line-length 100, target py311
- TypeScript: existing Prettier config, strict type checking
- Chinese UI copy. English identifiers + comments.

---

## E. Migration Hygiene(M1 新增)

### E1 — Alembic migration 必须双写

修改 `interview_sessions.config_snapshot` 列结构时,migration 必须:

1. 老枚举值保留在 JSON 中(向后兼容读取)
2. 新增 `directions: list[...]` 字段,从 `direction` 派生(单元素 list)
3. 不 drop 老列、不删数据

### E2 — 老 v3.1 数据读取兼容

任何 Pydantic schema 改动必须保证:

```bash
# 用 v3.1 老 session 数据(direction="standard_professional")
pytest tests/migrations/test_v31_to_v32.py -v
```
全过,无 ValidationError 抛出。前端进入历史详情页时不报错。

---

## F. v3.2+ Test Coverage Floor(M0 + M1 出门门禁)

| 测试 | 文件 | 必过 |
|---|---|---|
| pass_likelihood 12 禁止词 fuzz | `tests/agents/test_pass_likelihood_ethics.py` | ✅ |
| ai_verdict 负面词扫描 | `tests/agents/test_ai_verdict_scan.py` | ✅ |
| LangGraph 节点名锁 | `tests/orchestrator/test_graph_contract.py` | ✅ |
| Persona 4 名锁 | `tests/agents/test_persona_lock.py` | ✅ |
| InterviewConfig 4+6+3 边界 | `tests/agents/test_config_v32.py` | ✅ |
| v3.1→v3.2 数据迁移 | `tests/migrations/test_v31_to_v32.py` | ✅ |
| 五维度 name 锁 + 长度 | `tests/agents/test_report_dimensions.py` | ✅ |
| RoundReviewV2 tone + 单题分 | `tests/agents/test_round_review_v2.py` | ✅ |
| followup_hints 长度边界 | `tests/agents/test_followup_hints.py` | ✅ |
| preset_config 弱项映射 | `tests/domain/test_preset_config.py` | ✅ |

---

## G. PRD 与 AGENTS.md 同步(每节点 commit body 要求)

每个节点完成后,如果触碰了 schema / Agent / Prompt / 设计系统,
必须在 commit body 列出:

- `F-XXX: <一句话变更>`
- 涉及的 PRD 章节(如 "PRD 9.1 InterviewReportPayload 扩展")
- 涉及的 AGENTS.md 段落(如 "AGENTS.md §3 配置参数锁同步更新")

文档增量(PRD v3.3 addendum / AGENTS.md / FEATURES.md)由人工
负责在 ralph 跑完后整理(不在 ralph 节点内)。
