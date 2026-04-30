# v3.2+ P0 Sections — 红线整改 + v3.2 三件套对齐

P0 = M0(红线整改 + 设计系统地基,1.5 周,**11 子节点 = M0.1a-f 拆 6 个 + M0.2-6 共 5 个**)+ M1(v3.2 配置/人格/报告三件套对齐,3 周,5 子节点)。共 **16 个 ralph 节点**,每个节点 = 一个 ralph loop = 一个 commit。

> ⚠️ **2026-04-30 节点拆分历史**:首版 V32.M0.1(单节点 21 className 落地)在 Loop #1 触发 Anthropic API stream idle timeout(1M context Opus 4.7,$1.38 失败),拆分为 M0.1a-f 6 个子节点降低单节点 context 体量。

所有节点遵守 [v32-p0-constraints.md](v32-p0-constraints.md) 的 A-G 红线。M2 起的子项(F-309/310/311/319/306 + F-320/F-321 + F-322 + F-316/F-318 + F-315)在本文件**不实现**,留作 v32-p1-sections.md / v32-p2-sections.md。

## Execution order

| # | Section | Deps | Commit prefix |
|---|---|---|---|
| 1 | **V32.M0.1a 按钮共享类(.btn + 6 变体)** | — | `style(design-system): land button classes in @layer components` |
| 2 | **V32.M0.1b 卡片共享类(.card + 3 变体)** | M0.1a | `style(design-system): land card classes in @layer components` |
| 3 | **V32.M0.1c 标签共享类(.tag + 5 变体)** | M0.1b | `style(design-system): land tag classes in @layer components` |
| 4 | **V32.M0.1d 互动共享类(.tile/.kbd/.input/.bar)** | M0.1c | `style(design-system): land interactive classes in @layer components` |
| 5 | **V32.M0.1e 排版共享类(.h1/.h2/.h3/.body/.muted)** | M0.1d | `style(design-system): land typography classes in @layer components` |
| 6 | **V32.M0.1f 布局共享类 + shadcn 退役** | M0.1e | `style(design-system): land layout classes + retire shadcn ui` |
| 7 | **V32.M0.2 Tailwind 默认色板封禁** | M0.1f | `chore(lint): forbid tailwind default palette` |
| 8 | **V32.M0.3 F-314 PassProbabilityRing → HeroScoreCard** | M0.1f | `feat(F-314): replace PassProbabilityRing with 3-tier HeroScoreCard` |
| 9 | **V32.M0.4 Sidebar 版本号 v3.2** | — | `chore(ui): update brand-sub to v3.2` |
| 10 | **V32.M0.5 LangGraph 节点名锁断言** | — | `test(orchestrator): lock turn_graph node names` |
| 11 | **V32.M0.6 design-reference 目录归位** | — | `chore(repo): move design-reference into eatit/docs/` |
| 12 | **V32.M1.1 InterviewConfig 4+6+3** | M0.* | `feat(F-307): rewrite InterviewConfig to 4 styles + 6 directions(1-3) + 3 durations` |
| 13 | **V32.M1.2 InterviewerPersona 4 人格名锁** | M1.1 | `feat(F-308): introduce InterviewerPersona with locked 4-name map` |
| 14 | **V32.M1.3 五维度评分 + 单题评分** | M1.1, M0.3 | `feat(F-312,F-313): add dimensions[5] and round_reviews_v2 to InterviewReportPayload` |
| 15 | **V32.M1.4 追问线索 chip** | M1.2 | `feat(F-319): add followup_hints[2-3, ≤8 chars] to InterviewerAgentOutput` |
| 16 | **V32.M1.5 专项训练 CTA 深色卡** | M1.3 | `feat(F-317): add DarkActionCard with preset_config from weakest dimensions` |

P0 完工后,产品具备对外发布的最低质量门槛(Demo 路径见 plan 文件 §"P0 完工后用户能做什么")。

---

## V32.M0.1a — 按钮共享类(.btn + 6 变体)

**Goal.** 把 `.btn` 与 6 个变体(`.btn-primary` `.btn-brand` `.btn-ghost` `.btn-lg` `.btn-sm` `.btn-danger-soft`)从 `docs/design-reference/styles.css`(若 M0.6 未完成则从 `/Users/shixuan/project_0423_v2/design-reference/styles.css`)抄到 `apps/desktop/src/index.css` 的 `@layer components` 块。共 7 个 className,~80 行 CSS。

**Files (modify only):**
- `apps/desktop/src/index.css` — 在 `@layer components { ... }` 块内追加 7 个按钮 className(若已有任意同名定义,先确认是不是空壳,有就替换)

**Key Interfaces.**

参考 design-reference/styles.css 第 274-321 行附近的 `.btn` 定义。注意保留:

```css
@layer components {
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 8px 14px;
    border-radius: var(--r-sm);
    font-size: 13px;
    font-weight: 500;
    background: var(--bg-elev);
    border: 1px solid var(--line);
    color: var(--ink-900);
    transition: all 120ms ease;
    white-space: nowrap;
  }
  .btn:hover { border-color: var(--line-strong); background: var(--bg-warm); }
  .btn .ico { width: 14px; height: 14px; }

  .btn-primary { background: var(--ink-900); color: white; border-color: var(--ink-900); }
  .btn-primary:hover { background: #1F2622; border-color: #1F2622; }
  /* 注:#1F2622 是 var(--ink-900) 的 hover 微调暗色,无对应 token,例外允许 */

  .btn-brand { background: var(--brand); color: white; border-color: var(--brand); }
  .btn-brand:hover { background: var(--brand-ink); border-color: var(--brand-ink); }

  .btn-ghost { background: transparent; border-color: transparent; color: var(--ink-700); }
  .btn-ghost:hover { background: rgba(15, 19, 16, 0.05); }

  .btn-lg { padding: 11px 18px; font-size: 13.5px; border-radius: var(--r-md); }
  .btn-sm { padding: 5px 10px; font-size: 12px; }

  .btn-danger-soft { background: var(--warn-softer); color: var(--warn); border-color: transparent; }
}
```

**Acceptance** (从 `apps/desktop/` 跑):

```bash
# 1. 7 个 className 都在
grep -E "^\s*\.btn(-primary|-brand|-ghost|-lg|-sm|-danger-soft)?\s*\{" src/index.css | wc -l
# 应 ≥ 7(.btn 自身 + 6 变体)

# 2. 类型检查与 lint
corepack pnpm exec tsc --noEmit
corepack pnpm lint
```

**Commit.** `style(design-system): land button classes in @layer components`

提交 body:
- 7 个 className 落地清单
- "下一节点 V32.M0.1b 落卡片类"

---

## V32.M0.1b — 卡片共享类(.card + 3 变体)

**Goal.** 落地 `.card` `.card-pad` `.card-pad-lg` `.card-header` 共 4 个 className,~30 行 CSS。

**Files (modify only):**
- `apps/desktop/src/index.css`

**Key Interfaces.**

```css
@layer components {
  .card {
    background: var(--bg-elev);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-xs);
  }
  .card-pad { padding: 22px 24px; }
  .card-pad-lg { padding: 28px 32px; }
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 22px;
    border-bottom: 1px solid var(--line);
  }
}
```

**Acceptance:**

```bash
grep -E "^\s*\.card(-pad|-pad-lg|-header)?\s*\{" src/index.css | wc -l  # 应 ≥ 4
corepack pnpm exec tsc --noEmit
corepack pnpm lint
```

**Commit.** `style(design-system): land card classes in @layer components`

---

## V32.M0.1c — 标签共享类(.tag + 5 变体)

**Goal.** 落地 `.tag` 与 5 个变体(`.tag-green` `.tag-warn` `.tag-info` `.tag-line` `.tag-dot`),共 6 个 className,~50 行 CSS。

**Files (modify only):**
- `apps/desktop/src/index.css`

**Key Interfaces.**

```css
@layer components {
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    font-size: 11.5px;
    font-weight: 500;
    border-radius: var(--r-pill);
    background: var(--bg-sunken);
    color: var(--ink-700);
    border: 1px solid transparent;
  }
  .tag-green { background: var(--brand-soft); color: var(--brand-ink); }
  .tag-warn  { background: var(--warn-soft);  color: var(--warn); }
  .tag-info  { background: var(--info-soft);  color: var(--info); }
  .tag-line  { background: transparent; border-color: var(--line); color: var(--ink-700); }
  .tag-dot::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    display: inline-block;
  }
}
```

**Acceptance:**

```bash
grep -E "^\s*\.tag(-green|-warn|-info|-line|-dot)?(::before)?\s*\{" src/index.css | wc -l  # 应 ≥ 6
corepack pnpm exec tsc --noEmit
corepack pnpm lint
```

**Commit.** `style(design-system): land tag classes in @layer components`

---

## V32.M0.1d — 互动共享类(tile / kbd / input / bar)

**Goal.** 落地交互类组件 className 共 11 个,~80 行 CSS:

- `.tile` + `.tile-radio` + `.tile-title` + `.tile-desc` + `.tile.selected` + `.tile.selected .tile-radio` + `.tile.selected .tile-radio::after`(选择块 5 个相关 + 选中态)
- `.kbd`(键盘按键,1 个)
- `.input` + `.textarea`(2 个)
- `.bar` + `.bar > i` + `.bar-warn > i`(进度条 3 个)

**Files (modify only):**
- `apps/desktop/src/index.css`

**Key Interfaces.**

参考 design-reference/styles.css 第 365-491 行。注意:

```css
@layer components {
  .tile-group { display: grid; gap: 10px; }
  .tile {
    display: flex; gap: 14px; padding: 16px 18px;
    border: 1px solid var(--line); border-radius: var(--r-md);
    background: var(--bg-elev); cursor: pointer;
    transition: all 120ms ease; text-align: left; width: 100%;
  }
  .tile:hover { border-color: var(--line-strong); }
  .tile.selected {
    border-color: var(--brand);
    background: var(--brand-softer);
    box-shadow: 0 0 0 3px rgba(31, 107, 58, 0.08);
  }
  .tile-radio {
    width: 16px; height: 16px; border-radius: 50%;
    border: 1.5px solid var(--line-strong);
    flex-shrink: 0; margin-top: 2px; position: relative;
  }
  .tile.selected .tile-radio { border-color: var(--brand); background: var(--brand); }
  .tile.selected .tile-radio::after {
    content: ''; position: absolute; inset: 3px;
    background: white; border-radius: 50%;
  }
  .tile-title { font-size: 13.5px; font-weight: 600; color: var(--ink-900); }
  .tile-desc  { font-size: 12.5px; color: var(--ink-500); margin-top: 3px; }

  .kbd {
    display: inline-grid; place-items: center;
    min-width: 18px; height: 18px; padding: 0 5px;
    border: 1px solid var(--line); border-bottom-width: 2px;
    border-radius: 4px;
    background: var(--bg-elev);
    font-family: var(--f-mono);
    font-size: 10.5px;
    color: var(--ink-500);
  }

  .input, .textarea {
    width: 100%; padding: 10px 12px;
    border: 1px solid var(--line); border-radius: var(--r-sm);
    background: var(--bg-elev);
    font-size: 13.5px; color: var(--ink-900);
    transition: border 120ms ease;
  }
  .input:focus, .textarea:focus { outline: none; border-color: var(--ink-500); }
  .textarea { min-height: 120px; resize: vertical; line-height: 1.6; }

  .bar { height: 4px; border-radius: 2px; background: var(--line); overflow: hidden; }
  .bar > i { display: block; height: 100%; background: var(--brand); border-radius: 2px; }
  .bar-warn > i { background: var(--warn); }
}
```

**Acceptance:**

```bash
grep -E "^\s*\.(tile|kbd|input|textarea|bar)" src/index.css | wc -l  # 应 ≥ 8
corepack pnpm exec tsc --noEmit
corepack pnpm lint
```

**Commit.** `style(design-system): land interactive classes in @layer components`

---

## V32.M0.1e — 排版共享类(.h1 / .h2 / .h3 / .body / .muted)

**Goal.** 落地排版类 5 个 className,~30 行 CSS。`.eyebrow` `.mono` 已存在,本节点不重复。

**Files (modify only):**
- `apps/desktop/src/index.css`

**Key Interfaces.**

```css
@layer components {
  .h1 {
    font-family: var(--f-serif);
    font-size: 42px;
    line-height: 1.1;
    font-weight: 400;
    letter-spacing: -0.02em;
    margin: 10px 0 6px;
    color: var(--ink-900);
  }
  .h2 { font-size: 18px; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
  .h3 { font-size: 14.5px; font-weight: 600; margin: 0; }
  .body { font-size: 13.5px; color: var(--ink-700); line-height: 1.6; }
  .muted { color: var(--ink-500); }
}
```

**Acceptance:**

```bash
grep -E "^\s*\.(h1|h2|h3|body|muted)\s*\{" src/index.css | wc -l  # 应 ≥ 5
corepack pnpm exec tsc --noEmit
corepack pnpm lint
```

**Commit.** `style(design-system): land typography classes in @layer components`

---

## V32.M0.1f — 布局共享类 + shadcn 退役

**Goal.** 收尾子节点。落地 7 个布局工具类 + 删除 shadcn 死代码 + 删除 HSL bridge 14 个变量。

**Files (modify):**
- `apps/desktop/src/index.css` — 加 7 个布局类(`.row` `.col` `.between` `.wrap` `.grow` `.divider` `.divider-v`);删除 `:root` 中的 14 个 shadcn HSL bridge 变量

**Files (delete after grep confirms 0 imports):**
- `apps/desktop/src/components/ui/button.tsx`
- `apps/desktop/src/components/ui/card.tsx`

**Files (rewrite):**
- `apps/desktop/src/components/ui/dialog.tsx` — 基于 Radix Primitive + 项目 `.card` + `.btn` 重写为 `EatitDialog`,**导出 name 保持兼容**(避免破坏现有 `pages/settings/DataManagement.tsx` 的 import 链)。Radix 自身不算"其他设计系统",它是 unstyled primitive

**Key Interfaces.**

布局类:

```css
@layer components {
  .row { display: flex; align-items: center; gap: 12px; }
  .col { display: flex; flex-direction: column; gap: 12px; }
  .between { justify-content: space-between; }
  .wrap { flex-wrap: wrap; }
  .grow { flex: 1; }
  .divider   { height: 1px; background: var(--line); border: 0; margin: 0; }
  .divider-v { width: 1px; background: var(--line); align-self: stretch; }
}
```

要删除的 14 个 HSL bridge 变量(在 `apps/desktop/src/index.css` 的 `:root` 块,大约第 54-77 行):
`--background` `--foreground` `--card` `--card-foreground` `--popover` `--popover-foreground` `--primary` `--primary-foreground` `--secondary` `--secondary-foreground` `--muted-foreground` `--accent` `--accent-foreground` `--destructive` `--destructive-foreground` `--border-hsl` `--input-hsl` `--ring`(实际可能 14 ~ 18 之间,以 grep 实际为准)

注:Tailwind config 中 `theme.colors.border: 'hsl(var(--border))'` 这条桥接需要保留作 lint 通过(M0.2 节点会处理 Tailwind config)。其他全删。

**Acceptance:**

```bash
# 1. 布局类落地
grep -E "^\s*\.(row|col|between|wrap|grow|divider|divider-v)\s*\{" src/index.css | wc -l  # 应 ≥ 7

# 2. shadcn 文件已删
test ! -f src/components/ui/button.tsx
test ! -f src/components/ui/card.tsx

# 3. dialog 重写后 0 shadcn 引用
grep -E "from .{0,3}@/components/ui/(button|card)" src/  # 应 0 hit

# 4. HSL bridge 退役
grep -E "var\(--(primary|background|destructive|popover|accent|ring)\)" src/  # 应 0 hit

# 5. 编译 + lint 全过
corepack pnpm exec tsc --noEmit
corepack pnpm lint

# 6. dev 启动后视觉走查:5 页面无回退,Settings 数据导出 dialog 还能弹
corepack pnpm dev
```

**Commit.** `style(design-system): land layout classes + retire shadcn ui`

提交 body 必须含:
- `BREAKING(internal)`: shadcn UI button/card 已下线,dialog 重写为 EatitDialog
- 7 个布局 className 落地清单
- 14 个 HSL bridge 变量删除清单
- 视觉走查 5 页面 OK 的人工确认

---

## V32.M0.2 — Tailwind 默认色板封禁

**Goal.** 让任何引入 `bg-green-500` / `text-orange-600` / `border-gray-200` 类 Tailwind 默认色板的代码在编译期 fail。

**Files:**

- `apps/desktop/tailwind.config.ts` — 修改 `theme.colors`:

```typescript
export default {
  // ...
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      border: 'hsl(var(--border-hsl, 214 20% 87%))',  // 仅保留 border 桥
      // 其他 color 不暴露;design tokens 通过 var(--brand) 等使用
    },
    extend: {
      // 不再 extend.colors,所有色值走 CSS var
    },
  },
}
```

- `apps/desktop/.eslintrc.cjs`(若存在;否则 `.eslintrc.json`) — 加自定义规则:

```javascript
module.exports = {
  // ...
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: "Literal[value=/^(bg|text|border|ring|fill|stroke)-(red|green|blue|yellow|orange|amber|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|gray|slate|zinc|neutral|stone)-\\d+$/]",
        message: '禁用 Tailwind 默认色板,请用 design token (var(--brand) 等)',
      },
      {
        selector: "Literal[value=/^#[0-9A-Fa-f]{3,6}$/]",
        message: '禁用十六进制色值,请用 var(--xxx) token',
      },
    ],
  },
}
```

- `apps/desktop/scripts/lint-design-tokens.sh`(新建,可执行):

```bash
#!/bin/bash
# Scan src/ for Tailwind default palette + hex colors
set -e
cd "$(dirname "$0")/.."

VIOLATIONS=$(grep -rE 'bg-(red|green|blue|yellow|orange|amber|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|gray|slate|zinc|neutral|stone)-[0-9]+|text-(red|green|blue|yellow|orange|amber|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|gray|slate|zinc|neutral|stone)-[0-9]+' src/ --include='*.ts' --include='*.tsx' --include='*.css' || true)

if [ -n "$VIOLATIONS" ]; then
  echo "❌ Tailwind default palette detected:"
  echo "$VIOLATIONS"
  exit 1
fi

HEX_VIOLATIONS=$(grep -rE '"#[0-9A-Fa-f]{6}"' src/ --include='*.ts' --include='*.tsx' | grep -vE '"#fff[0-9A-Fa-f]{0,3}"|"#000[0-9A-Fa-f]{0,3}"' || true)

if [ -n "$HEX_VIOLATIONS" ]; then
  echo "❌ Hard-coded hex color detected (excluding white/black):"
  echo "$HEX_VIOLATIONS"
  exit 1
fi

echo "✅ Design tokens clean"
```

- `apps/desktop/package.json` — `scripts` 加 `"lint:design-tokens": "bash scripts/lint-design-tokens.sh"`

- `.github/workflows/ci.yml` — `frontend` job 加一步:`- run: corepack pnpm lint:design-tokens`

**Acceptance** (从 `apps/desktop/` 跑):

```bash
# 1. 故意引入违规
echo "<div className=\"bg-green-500\">" > /tmp/violation_test.tsx
mv /tmp/violation_test.tsx src/__violation_test__.tsx
bash scripts/lint-design-tokens.sh  # 应 exit 1
rm src/__violation_test__.tsx

# 2. 实际项目 clean
bash scripts/lint-design-tokens.sh  # 应 exit 0 + ✅ Design tokens clean

# 3. ESLint 也能拦
echo 'const x = "bg-blue-600";' > src/__eslint_test__.tsx
corepack pnpm lint  # 应有 no-restricted-syntax error
rm src/__eslint_test__.tsx

# 4. CI 流水线确认
git diff .github/workflows/ci.yml  # 应有新 step
```

**Commit.** `chore(lint): forbid tailwind default palette`

---

## V32.M0.3 — F-314 PassProbabilityRing → HeroScoreCard(伦理红线整改)

**Goal.** PRD L0 红线整改:删除当前用 0-100 数值 + "不匹配" 文案的 `PassProbabilityRing`,替换为只显示"中上/中/中下"3 档枚举的 `HeroScoreCard`。后端新增 `pass_likelihood` 字段(老 `pass_probability` 保留),并加 12 个禁止词 fuzz 测试 + ai_verdict 负面词扫描。

本节是 P0 中唯一的"必须立即修"红线节点 —— 其他节点是渐进改进,这个是合规阻断。

**Files (delete):**
- `apps/desktop/src/pages/report/PassProbabilityRing.tsx`

**Files (new):**
- `apps/desktop/src/pages/report/HeroScoreCard.tsx`
- `apps/api/tests/agents/test_pass_likelihood_ethics.py`
- `apps/api/tests/agents/test_ai_verdict_scan.py`

**Files (modify):**
- `apps/api/app/schemas/reports.py` — `InterviewReportPayload` 加新字段(老字段全保留)
- `apps/api/app/agents/report/schemas.py` — `ReportAgentOutput` 同步
- `apps/api/app/domain/reports/service.py` — 加 `derive_pass_likelihood` 兜底 + 非法值强制覆盖
- `apps/api/app/prompts/report/system.md` — 加 `pass_likelihood` 输出说明 + 禁止词清单
- `apps/desktop/src/pages/ReportPage.tsx` — Hero 区域用 `HeroScoreCard` 替换 `PassProbabilityRing`
- `packages/shared-types/src/index.ts` — 同步新字段类型

**Key Interfaces.**

```python
# apps/api/app/schemas/reports.py(新增,老字段全保留)
from typing import Literal

class InterviewReportPayload(SchemaModel):
    # ===== L0 红线:老字段保留兼容 =====
    pass_probability: int = Field(default=0, ge=0, le=100)  # deprecated, 不向用户展示
    reasons: list[ReportReason] = Field(default_factory=list)  # 保留
    # ===== v3.2+ 新增 =====
    pass_likelihood: Literal["中上", "中", "中下"] | None = None
    ai_verdict: str | None = None
    overall_score: int | None = None  # 0-100,与 pass_probability 不同语义
    # ... 其他老字段不动
```

```python
# apps/api/app/domain/reports/service.py
from typing import Literal
import logging

logger = logging.getLogger(__name__)

VALID_PASS_LIKELIHOOD = {"中上", "中", "中下"}

def derive_pass_likelihood(
    overall_score: int | None,
    match_score: int | None,
) -> Literal["中上", "中", "中下"]:
    """Compute pass_likelihood from overall_score + match_score.
    Never returns "不建议" or any non-3-tier value (L0 ethical guardrail).
    """
    o = overall_score or 0
    m = match_score or 0
    if o >= 80 and m >= 75:
        return "中上"
    if o >= 65 and m >= 60:
        return "中"
    return "中下"  # 严禁"不建议"

def coerce_pass_likelihood(
    raw: str | None,
    overall_score: int | None,
    match_score: int | None,
) -> Literal["中上", "中", "中下"]:
    """Validate LLM output; force-override illegal values to derive result."""
    if raw in VALID_PASS_LIKELIHOOD:
        return raw  # type: ignore
    derived = derive_pass_likelihood(overall_score, match_score)
    logger.warning(
        "pass_likelihood illegal value %r overridden to %r (overall=%s match=%s)",
        raw, derived, overall_score, match_score,
    )
    return derived
```

```typescript
// apps/desktop/src/pages/report/HeroScoreCard.tsx
import { I } from '@/components/icons'

type Tier = '中上' | '中' | '中下'

interface Props {
  overallScore: number | null  // 数字仅用于内部 delta 计算,不直接展示
  passLikelihood: Tier | null
  scoreDelta?: number
}

export function HeroScoreCard({ overallScore, passLikelihood, scoreDelta }: Props) {
  return (
    <div className="row" style={{ gap: 16 }}>
      {overallScore !== null && (
        <div className="card card-pad" style={{ minWidth: 180 }}>
          <div className="muted" style={{ fontSize: 11.5 }}>总分</div>
          <div className="row" style={{ gap: 8, alignItems: 'baseline', marginTop: 4 }}>
            <span style={{ fontFamily: 'var(--f-serif)', fontSize: 40 }}>
              {overallScore}
            </span>
            {scoreDelta !== undefined && (
              <span className="mono" style={{ fontSize: 11, color: scoreDelta > 0 ? 'var(--brand)' : 'var(--ink-500)' }}>
                {scoreDelta > 0 ? '+' : ''}{scoreDelta} vs. 上一场
              </span>
            )}
          </div>
        </div>
      )}
      {passLikelihood && (
        <div className="card card-pad" style={{ minWidth: 180 }}>
          <div className="muted" style={{ fontSize: 11.5 }}>通过可能性</div>
          {/* 严格只显示 3 档枚举字符串,不显示数字 */}
          <div style={{ fontFamily: 'var(--f-serif)', fontSize: 40, marginTop: 4 }}>
            {passLikelihood}
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
            基于岗位 JD 的匹配度评估
          </div>
        </div>
      )}
    </div>
  )
}
```

**Test 1: pass_likelihood fuzz** (`apps/api/tests/agents/test_pass_likelihood_ethics.py`)

```python
import pytest
from app.domain.reports.service import coerce_pass_likelihood

FORBIDDEN_VALUES = [
    "不建议", "不通过", "不合格", "淘汰", "不推荐",
    "建议放弃", "不适合", "低", "差", "非常低",
    "reject", "no",
]

@pytest.mark.parametrize("forbidden", FORBIDDEN_VALUES)
def test_forbidden_pass_likelihood_coerces_to_zhongxia(forbidden, caplog):
    """L0 ethical guardrail: any forbidden value forced to '中下' + WARN log."""
    result = coerce_pass_likelihood(forbidden, overall_score=50, match_score=55)
    assert result == "中下"
    assert any("illegal value" in r.message for r in caplog.records)

@pytest.mark.parametrize("valid,expected", [
    ("中上", "中上"), ("中", "中"), ("中下", "中下"),
])
def test_valid_passes_through(valid, expected):
    assert coerce_pass_likelihood(valid, 80, 80) == expected

def test_none_input_uses_derive():
    assert coerce_pass_likelihood(None, 85, 80) == "中上"
    assert coerce_pass_likelihood(None, 70, 65) == "中"
    assert coerce_pass_likelihood(None, 30, 40) == "中下"
```

**Test 2: ai_verdict negative-word scan** (`apps/api/tests/agents/test_ai_verdict_scan.py`)

```python
import re

NEGATIVE_KEYWORDS = re.compile(
    r"(不建议|不通过|不合格|淘汰|不适合|建议放弃|放弃|差距很大|不推荐)"
)

def test_ai_verdict_no_negative_keywords(report_fixture):
    """ai_verdict 字段不得含负面打击词(L0 ethical guardrail)."""
    verdict = report_fixture.payload.ai_verdict or ""
    matches = NEGATIVE_KEYWORDS.findall(verdict)
    assert not matches, f"ai_verdict contains forbidden words: {matches}"
```

(`report_fixture` 用现有 conftest fixture 跑一场假 session 拿真实 LLM 输出)

**Acceptance** (从 `apps/api/` 跑):

```bash
# 1. fuzz 12 条全过
unset VIRTUAL_ENV
uv run pytest tests/agents/test_pass_likelihood_ethics.py -v
# 应看到 12 passed (or more)

# 2. ai_verdict 扫描
uv run pytest tests/agents/test_ai_verdict_scan.py -v

# 3. 类型检查
cd ../desktop
corepack pnpm exec tsc --noEmit

# 4. dev 启动后人工走查
corepack pnpm dev
# 在 ReportPage 验证:
#   - Hero 区域 NO 0-100 数值环形图
#   - Hero 区域 NO "不建议/不匹配/不通过" 文字
#   - 仅显示 "中上 / 中 / 中下" 3 档之一
```

**Commit.** `feat(F-314): replace PassProbabilityRing with 3-tier HeroScoreCard`

提交 body 必须包含:
- `L0 ethical guardrail enforced`
- 12 个禁止词 fuzz 测试输出末尾 `12 passed`
- ai_verdict 扫描通过
- 删除文件清单 + 新建文件清单

---

## V32.M0.4 — Sidebar 版本号统一改 v3.2

**Goal.** Sidebar 左上 brand 区版本号当前显示 `v0.1`(代码)/ `v1.4`(原型),与 PRD v3.2 不符。统一改为 `v3.2`。

**Files (modify):**
- `apps/desktop/src/components/Sidebar.tsx` — `brand-sub` 文案改为 `v3.2`
- `eatit/docs/design-reference/shell.jsx`(若 M0.6 已完成)或 `/Users/shixuan/project_0423_v2/design-reference/shell.jsx` — 同步改 `brand-sub` 为 `v3.2`

**Acceptance:**

```bash
# 1. grep 确认改完
grep -rE 'brand-sub.*v[0-9]+\.[0-9]+' src/ design-reference/ docs/  # 仅出现 v3.2

# 2. dev 启动 Sidebar 显示 v3.2
corepack pnpm dev
# 视觉:左侧 brand 区下方 mono 灰色字 "v3.2"
```

**Commit.** `chore(ui): update brand-sub to v3.2`

---

## V32.M0.5 — LangGraph 节点名锁断言

**Goal.** L0 红线"禁止改 LangGraph 节点名"目前没有自动化护栏,只靠 PROMPT.md 的口头约定。本节加一个运行时 assertion 测试,让任何重命名 PR 在 CI 阶段 fail。

**Files (new):**
- `apps/api/tests/orchestrator/test_graph_contract.py`

**Files (modify):**
- `apps/api/app/orchestrator/turn_graph.py` — 顶部加注释提示

**Key Interfaces:**

```python
# apps/api/tests/orchestrator/test_graph_contract.py
"""
LangGraph node-name lock test.

PRD L0 + AGENTS.md §6 forbid renaming nodes in turn_graph.
Any PR that renames / merges / splits nodes triggers this test fail.
"""
from app.orchestrator.turn_graph import build_turn_graph

EXPECTED_TURN_GRAPH_NODES = {"turn_assessment", "compression", "interviewer"}

def test_turn_graph_node_names_are_locked():
    """节点名集合锁:严禁重命名/合并/拆分."""
    graph = build_turn_graph(...)  # 复用现有构造方式;若需 stub deps 用 mock
    actual_nodes = set(graph.nodes.keys())
    assert actual_nodes == EXPECTED_TURN_GRAPH_NODES, (
        f"turn_graph nodes drift: expected {EXPECTED_TURN_GRAPH_NODES}, "
        f"got {actual_nodes}. See AGENTS.md §6 + v32-p0-constraints.md A7."
    )

def test_turn_graph_node_count_is_three():
    """节点个数锁:严禁加节点(新 Agent 必须独立 graph)."""
    graph = build_turn_graph(...)
    assert len(graph.nodes) == 3
```

```python
# apps/api/app/orchestrator/turn_graph.py 顶部
"""turn_graph — 单轮面试编排.

⚠️ DO NOT RENAME NODES — see AGENTS.md §6 + tests/orchestrator/test_graph_contract.py
节点名锁 (`turn_assessment`, `compression`, `interviewer`) 是 L0 红线。
新 Agent (Coach/Reflection 等 v3.3) 必须挂在独立 graph,不动本图。
"""
```

**Acceptance** (从 `apps/api/` 跑):

```bash
unset VIRTUAL_ENV
uv run pytest tests/orchestrator/test_graph_contract.py -v
# 应 2 passed

# 故意改名验证 fail
sed -i.bak 's/"turn_assessment"/"turn_eval"/' app/orchestrator/turn_graph.py 2>/dev/null || true
uv run pytest tests/orchestrator/test_graph_contract.py -v
# 应 fail (assertion message 含 "turn_graph nodes drift")
git checkout app/orchestrator/turn_graph.py  # 恢复
```

**Commit.** `test(orchestrator): lock turn_graph node names`

---

## V32.M0.6 — design-reference 目录归位到 eatit/docs/

**Goal.** 当前 design-reference 在仓库根 `/Users/shixuan/project_0423_v2/design-reference/`,但 AGENTS.md §8 + design-reference/README.md 都写的是 `docs/design-reference/`。统一搬到 `eatit/docs/design-reference/`,与文档对齐。

**Files (move):**
- `git mv` 整个目录 `/Users/shixuan/project_0423_v2/design-reference/` → `eatit/docs/design-reference/`
  - 9 个文件:README.md / styles.css / shell.jsx / icons.jsx / page-upload.jsx / page-config.jsx / page-live.jsx / page-history.jsx / page-report.jsx

**Files (modify):**
- `eatit/docs/design-reference/README.md` — 删除任何"实际路径与文档不一致"的注解
- 全仓 grep `/design-reference/`(不带 docs/ 前缀)的引用,统一改为 `docs/design-reference/`

注:由于 `git mv` 跨仓库目录(`/Users/shixuan/project_0423_v2/design-reference/` 不在 `eatit/` git 仓库下),实际操作是:

```bash
# 从 /Users/shixuan/project_0423_v2/eatit/ 仓库内
mkdir -p docs/
cp -r /Users/shixuan/project_0423_v2/design-reference docs/design-reference
git add docs/design-reference
# 注:仓库根的 /Users/shixuan/project_0423_v2/design-reference 不是 eatit git 仓的
# 一部分,无法 git mv;直接复制并加到 eatit/ 仓内
```

完成后,仓库根 `/Users/shixuan/project_0423_v2/design-reference/` 仍保留作历史快照,但所有 ralph 节点引用都改用 `eatit/docs/design-reference/`。

**Acceptance:**

```bash
# 1. 新路径文件齐全
ls docs/design-reference/  # 应有 9 个文件
ls docs/design-reference/styles.css docs/design-reference/page-upload.jsx

# 2. 全仓引用更新
grep -rE "design-reference" --include='*.md' --include='*.ts' --include='*.tsx' --include='*.py' \
  | grep -v "docs/design-reference" | grep -v "node_modules"
# 应 0 行(或仅历史 commit body 的引用)
```

**Commit.** `chore(repo): move design-reference into eatit/docs/`

---

## V32.M1.1 — InterviewConfig 4+6+3(F-307)

**Goal.** 把 v3.1 的 3 风格 + 3 方向单选 + 15/20/30 时长配置升级为 PRD v3.2 的 **4 风格 + 6 方向多选(1-3) + 15/30/45 三档**。老枚举值保留 + 兼容映射,严禁删字段(L0)。

**Files (new):**
- `apps/api/app/models/legacy_mapping.py` — 老 → 新枚举映射函数
- `apps/api/alembic/versions/mainline/<YYYYMMDD>_<NNNN>_v31_to_v32_directions.py` — 数据迁移
- `apps/desktop/src/pages/config/SummarySidebar.tsx` — 右侧 sticky aside
- `apps/api/tests/agents/test_config_v32.py`
- `apps/api/tests/api/test_session_create_v32.py`
- `apps/api/tests/migrations/test_v31_to_v32.py`

**Files (modify):**
- `apps/api/app/models/enums.py` — 新增 `InterviewStyleV32` + `InterviewDirectionV32`,保留老 `InterviewStyle`/`InterviewDirection`
- `apps/api/app/schemas/sessions.py` — `InterviewConfigRequest` 加 `directions: list[InterviewDirectionV32]` 新字段 + `duration_minutes: Literal[15,30,45]`
- `apps/api/app/agents/framework/schemas.py` — 同步
- `apps/api/app/prompts/framework/system.md` — Prompt 改"按方向均衡分配 question_budget"
- `apps/desktop/src/pages/ConfigPage.tsx` — 三 Section 重写
- `apps/desktop/src/stores/app-store.ts` — config slice 支持 directions: list
- `packages/shared-types/src/index.ts` — 同步类型

**Key Interfaces:**

```python
# apps/api/app/models/enums.py
from enum import StrEnum
from typing import Literal

# v3.2+ 新枚举
InterviewStyleV32 = Literal["structured", "pressure", "friendly", "expert"]
InterviewDirectionV32 = Literal[
    "ai-insight", "data-driven", "cross-func",
    "zero-to-one", "user-research", "strategy",
]

# v3.1 老枚举(保留,L0 不删)
class InterviewStyle(StrEnum):
    FRIENDLY_GUIDED = "friendly_guided"
    STANDARD_PROFESSIONAL = "standard_professional"
    HIGH_PRESSURE_FOLLOWUP = "high_pressure_followup"

class InterviewDirection(StrEnum):
    ROLE_MATCH = "role_match"
    PROJECT_DEEP_DIVE = "project_deep_dive"
    BEHAVIORAL_COMPREHENSIVE = "behavioral_comprehensive"
```

```python
# apps/api/app/models/legacy_mapping.py(新)
from typing import Literal
from .enums import InterviewStyle, InterviewDirection, InterviewStyleV32, InterviewDirectionV32

STYLE_LEGACY_TO_V32: dict[str, InterviewStyleV32] = {
    InterviewStyle.FRIENDLY_GUIDED.value: "friendly",
    InterviewStyle.STANDARD_PROFESSIONAL.value: "structured",
    InterviewStyle.HIGH_PRESSURE_FOLLOWUP.value: "pressure",
}

DIRECTION_LEGACY_TO_V32: dict[str, InterviewDirectionV32] = {
    InterviewDirection.ROLE_MATCH.value: "cross-func",
    InterviewDirection.PROJECT_DEEP_DIVE.value: "zero-to-one",
    InterviewDirection.BEHAVIORAL_COMPREHENSIVE.value: "cross-func",
}

def upgrade_legacy_style(value: str | None) -> InterviewStyleV32 | None:
    if value is None:
        return None
    if value in STYLE_LEGACY_TO_V32:
        return STYLE_LEGACY_TO_V32[value]
    return value  # type: ignore  # 假定已经是 v3.2 值

def upgrade_legacy_direction(value: str | None) -> InterviewDirectionV32 | None:
    if value is None:
        return None
    if value in DIRECTION_LEGACY_TO_V32:
        return DIRECTION_LEGACY_TO_V32[value]
    return value  # type: ignore
```

```python
# apps/api/app/schemas/sessions.py
from pydantic import Field, field_validator
from typing import Literal

class InterviewConfigRequest(SchemaModel):
    style: InterviewStyleV32 | InterviewStyle  # union 兼容
    # v3.2+ 新字段
    directions: list[InterviewDirectionV32] = Field(min_length=1, max_length=3)
    duration_minutes: Literal[15, 30, 45]
    # v3.1 deprecated(保留兼容入参)
    direction: InterviewDirection | None = None

    @field_validator('style', mode='before')
    def upgrade_style(cls, v):
        from app.models.legacy_mapping import upgrade_legacy_style
        return upgrade_legacy_style(v)

    @field_validator('directions', mode='before')
    def fill_directions_from_legacy(cls, v, info):
        # 若入参只有 direction(老前端),自动转成 directions=[direction]
        if not v and 'direction' in info.data and info.data['direction']:
            from app.models.legacy_mapping import upgrade_legacy_direction
            return [upgrade_legacy_direction(info.data['direction'])]
        return v
```

```typescript
// apps/desktop/src/pages/ConfigPage.tsx(片段)
const STYLES = [
  { id: 'structured', name: '结构化面试官', desc: '按既定框架推进,节奏稳定…', tag: '推荐', tagClass: 'tag tag-green' },
  { id: 'pressure',   name: '高压追问型',   desc: '连续深挖细节、不断质疑你的判断依据…', tag: null },
  { id: 'friendly',   name: '亲和启发型',   desc: '引导你自述,追问偏协助式…', tag: null },
  { id: 'expert',     name: '资深行业专家', desc: '以业务视角切入,追问行业理解…', tag: 'Beta', tagClass: 'tag tag-line' },
] as const

const DIRECTIONS = [
  { id: 'ai-insight',   name: 'AI 场景洞察', desc: '对新技术/新趋势的判断与边界感' },
  { id: 'data-driven',  name: '数据驱动决策', desc: '指标体系、AB 实验、归因分析' },
  { id: 'cross-func',   name: '跨职能协作',   desc: '与不同角色的协作与推动' },
  { id: 'zero-to-one',  name: '从 0 到 1',    desc: '应对不确定性与新业务' },
  { id: 'user-research', name: '用户洞察',    desc: '调研方法、客户分层' },
  { id: 'strategy',     name: '产品战略',     desc: '竞争分析、北极星指标' },
] as const

const DURATIONS = [15, 30, 45] as const

// 校验:directions.length must be 1-3
const isValid = directions.length >= 1 && directions.length <= 3
// CTA disabled when !isValid
```

**测试设计:**

```python
# apps/api/tests/agents/test_config_v32.py
import pytest
from pydantic import ValidationError
from app.schemas.sessions import InterviewConfigRequest

def test_valid_directions_length_2():
    cfg = InterviewConfigRequest(
        style="structured",
        directions=["ai-insight", "data-driven"],
        duration_minutes=30,
    )
    assert len(cfg.directions) == 2

def test_directions_length_0_fails():
    with pytest.raises(ValidationError, match="min_length"):
        InterviewConfigRequest(
            style="structured",
            directions=[],
            duration_minutes=30,
        )

def test_directions_length_4_fails():
    with pytest.raises(ValidationError, match="max_length"):
        InterviewConfigRequest(
            style="structured",
            directions=["ai-insight", "data-driven", "cross-func", "zero-to-one"],
            duration_minutes=30,
        )

def test_duration_20_minutes_rejected():
    with pytest.raises(ValidationError):
        InterviewConfigRequest(
            style="structured",
            directions=["ai-insight"],
            duration_minutes=20,
        )

def test_legacy_style_auto_upgrades():
    cfg = InterviewConfigRequest(
        style="standard_professional",  # v3.1 老值
        directions=["ai-insight"],
        duration_minutes=30,
    )
    assert cfg.style == "structured"

def test_legacy_direction_promotes_to_directions_list():
    cfg = InterviewConfigRequest(
        style="structured",
        direction="role_match",  # 老前端只传 direction
        directions=[],
        duration_minutes=30,
    )
    # validator 应把 direction 升级为 directions=["cross-func"]
    assert cfg.directions == ["cross-func"]
```

**Acceptance** (从 `apps/api/` 跑):

```bash
unset VIRTUAL_ENV
uv run pytest tests/agents/test_config_v32.py -v
uv run pytest tests/api/test_session_create_v32.py -v
uv run pytest tests/migrations/test_v31_to_v32.py -v
uv run alembic upgrade head  # migration 不报错

cd ../desktop
corepack pnpm exec tsc --noEmit
corepack pnpm dev
# 视觉:
#   - ConfigPage Section 01 看到 4 个 .tile 单选(structured 标推荐绿 tag, expert 标 Beta line tag)
#   - Section 02 看到 6 个 .tile 2 列 grid 多选,默认 AI 推荐 2 个高亮
#   - Section 03 看到 3 列 grid(15/30/45),无 60 档
#   - 取消所有 directions → 主 CTA disabled + inline warn
#   - 勾选第 4 个 direction → 第 4 个 tile 置灰不可勾
#   - 右侧 sticky aside 显示 SummaryRow×5 + 主 CTA + "剩余 N 次"
```

**Commit.** `feat(F-307): rewrite InterviewConfig to 4 styles + 6 directions(1-3) + 3 durations`

提交 body 必须包含:
- L0 兼容性策略说明(老枚举保留 + 映射函数)
- 新 Alembic migration 文件名
- 测试输出末尾 N passed

---

## V32.M1.2 — InterviewerPersona 4 人格名锁(F-308)

**Goal.** 引入数据驱动的 InterviewerPersona,4 个 style 一一对应 4 个固定虚拟形象(Sarah/Marcus/Lin/Daniel)。Pydantic Literal 锁死 4 个 name,任何改名 PR 触发测试 fail。Interviewer Agent 与 Report Agent 的 prompt 注入 persona,驱动语气与第一人称引述。

**Files (new):**
- `apps/api/app/agents/interviewer/personas.py`
- `apps/desktop/src/lib/personas.ts`
- `apps/api/tests/agents/test_persona_lock.py`
- `eatit/scripts/persona_name_guard.py`(pre-commit hook)

**Files (modify):**
- `apps/api/app/agents/interviewer/schemas.py` — `InterviewerAgentOutput` 加 `persona`
- `apps/api/app/agents/interviewer/service.py` — Prompt render 时注入
- `apps/api/app/agents/report/service.py` — 同样注入用于 ai_verdict
- `apps/api/app/prompts/interviewer/system.md` — 加 `{{persona_name}}` `{{persona_keywords}}` 槽位
- `apps/api/app/prompts/report/system.md` — 同上
- `apps/desktop/src/pages/InterviewPage.tsx` — Session meta strip 显示 persona
- `apps/desktop/src/pages/ReportPage.tsx` — Hero 元信息行加风格签名
- `packages/shared-types/src/index.ts` — 同步 InterviewerPersona 类型

**Key Interfaces:**

```python
# apps/api/app/agents/interviewer/personas.py
from typing import Final, Literal
from pydantic import BaseModel
from app.models.enums import InterviewStyleV32

PERSONA_NAME = Literal["Sarah", "Marcus", "Lin", "Daniel"]

class InterviewerPersona(BaseModel):
    name: PERSONA_NAME
    style: InterviewStyleV32
    keywords: tuple[str, str, str]

PERSONA_MAP: Final[dict[InterviewStyleV32, InterviewerPersona]] = {
    "structured": InterviewerPersona(
        name="Sarah",
        style="structured",
        keywords=("逻辑清晰", "节奏稳定", "客观中立"),
    ),
    "pressure": InterviewerPersona(
        name="Marcus",
        style="pressure",
        keywords=("直接犀利", "连续追问", "质疑判断"),
    ),
    "friendly": InterviewerPersona(
        name="Lin",
        style="friendly",
        keywords=("引导式", "协助展开", "适度肯定"),
    ),
    "expert": InterviewerPersona(
        name="Daniel",
        style="expert",
        keywords=("行业视角", "案例迁移", "商业本质"),
    ),
}

def get_persona(style: str) -> InterviewerPersona:
    """Fallback to Sarah/structured when style is illegal."""
    if style in PERSONA_MAP:
        return PERSONA_MAP[style]
    return PERSONA_MAP["structured"]  # safe default
```

```python
# apps/api/tests/agents/test_persona_lock.py
import pytest
from pydantic import ValidationError
from app.agents.interviewer.personas import (
    PERSONA_MAP, InterviewerPersona, get_persona,
)

def test_persona_map_has_4_styles():
    assert set(PERSONA_MAP.keys()) == {"structured", "pressure", "friendly", "expert"}

def test_persona_names_are_locked():
    """L0: 4 names must be exactly Sarah/Marcus/Lin/Daniel — no aliases."""
    names = {p.name for p in PERSONA_MAP.values()}
    assert names == {"Sarah", "Marcus", "Lin", "Daniel"}

def test_constructing_with_alien_name_fails():
    with pytest.raises(ValidationError):
        InterviewerPersona(
            name="Alice",  # type: ignore  # not in Literal
            style="structured",
            keywords=("a", "b", "c"),
        )

def test_get_persona_fallback_to_sarah():
    p = get_persona("nonexistent_style")
    assert p.name == "Sarah"
    assert p.style == "structured"

def test_each_style_maps_to_correct_name():
    assert PERSONA_MAP["structured"].name == "Sarah"
    assert PERSONA_MAP["pressure"].name == "Marcus"
    assert PERSONA_MAP["friendly"].name == "Lin"
    assert PERSONA_MAP["expert"].name == "Daniel"
```

```python
# eatit/scripts/persona_name_guard.py(pre-commit / CI hook)
"""Persona name lock — exits 1 if PERSONA_MAP names drift."""
import re
import sys
from pathlib import Path

LOCKED_NAMES = {"Sarah", "Marcus", "Lin", "Daniel"}

def main():
    persona_file = Path(__file__).parent.parent / "apps/api/app/agents/interviewer/personas.py"
    if not persona_file.exists():
        print("⚠️ personas.py missing — skipping lock check")
        return 0
    text = persona_file.read_text(encoding="utf-8")
    # match name="Sarah" or name='Sarah' patterns
    found = set(re.findall(r"name=[\"']([^\"']+)[\"']", text))
    if found != LOCKED_NAMES:
        missing = LOCKED_NAMES - found
        extra = found - LOCKED_NAMES
        print(f"❌ Persona name lock violated.")
        if missing:
            print(f"   Missing: {missing}")
        if extra:
            print(f"   Unexpected: {extra}")
        return 1
    print("✅ Persona names locked.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
```

**Acceptance:**

```bash
cd apps/api
unset VIRTUAL_ENV
uv run pytest tests/agents/test_persona_lock.py -v  # 5 passed

# guard 脚本
cd ../..
python scripts/persona_name_guard.py  # ✅ Persona names locked.

# 故意改名验证 fail
sed -i.bak 's/name="Sarah"/name="Alice"/' apps/api/app/agents/interviewer/personas.py
python scripts/persona_name_guard.py  # 应 exit 1
git checkout apps/api/app/agents/interviewer/personas.py

# 前端类型检查
cd apps/desktop
corepack pnpm exec tsc --noEmit
corepack pnpm dev
# 视觉:
#   - 选 style=structured 进入面试 → Session meta strip 显示 "面试官 Sarah · 结构化面试官"
#   - 选 style=pressure → "面试官 Marcus · 高压追问型"
#   - ReportPage Hero 元信息行同样有 persona 签名
```

**Commit.** `feat(F-308): introduce InterviewerPersona with locked 4-name map`

---

## V32.M1.3 — 五维度评分 + 单题评分(F-312/F-313)

**Goal.** Report 升级核心:加入 5 维度评分(name 严格锁:专业深度/结构化表达/批判性思考/业务直觉/沟通节奏)+ 每题独立 0-100 + tone(good/ok/warn)。LLM 输出 < 5 个 dimensions 时降级补 50 分。前端新增 DimensionRow 与 QuestionReview 折叠卡。

**Files (new):**
- `apps/desktop/src/pages/report/DimensionRow.tsx`
- `apps/desktop/src/pages/report/QuestionReview.tsx`
- `apps/api/tests/agents/test_report_dimensions.py`
- `apps/api/tests/agents/test_round_review_v2.py`

**Files (modify):**
- `apps/api/app/schemas/reports.py` — 新增 `DimensionScore` / `RoundReviewV2` / `Chip` + 字段(老字段全保留)
- `apps/api/app/agents/report/schemas.py` — `ReportAgentOutput` 同步
- `apps/api/app/prompts/report/system.md` — Prompt 重写,严格输出 5 维度 + name 锁定 + ai_verdict 第一人称
- `apps/api/app/domain/reports/service.py` — dimensions 长度 ≠ 5 时降级补 50 分
- `apps/desktop/src/pages/ReportPage.tsx` — 主区加入维度分析卡 + 逐题复盘卡(老报告 dimensions=[] 时空态)
- `packages/shared-types/src/index.ts` — 同步类型

**Key Interfaces:**

```python
# apps/api/app/schemas/reports.py(新增)
from typing import Literal
from pydantic import BaseModel, Field

class Chip(BaseModel):
    text: str = Field(max_length=20)
    good: bool

DIMENSION_NAMES = Literal[
    "专业深度", "结构化表达", "批判性思考", "业务直觉", "沟通节奏"
]

class DimensionScore(BaseModel):
    name: DIMENSION_NAMES  # L0 锁
    description: str
    score: int = Field(ge=0, le=100)
    evidence_chips: list[Chip] = Field(min_length=1, max_length=6)

class RoundReviewV2(BaseModel):
    turn_index: int
    question_tag: str
    question_text: str
    score: int = Field(ge=0, le=100)
    tone: Literal["good", "ok", "warn"]
    answer_summary: str
    ai_feedback: str

# InterviewReportPayload 扩展
class InterviewReportPayload(SchemaModel):
    # ... 老字段保留 ...
    dimensions: list[DimensionScore] = Field(default_factory=list)  # 严格 5 项 or 空
    round_reviews_v2: list[RoundReviewV2] = Field(default_factory=list)
    overall_score: int | None = None
```

```python
# apps/api/app/domain/reports/service.py 增加
DEFAULT_DIMENSION_NAMES = [
    "专业深度", "结构化表达", "批判性思考", "业务直觉", "沟通节奏",
]

def normalize_dimensions(raw: list[DimensionScore]) -> list[DimensionScore]:
    """Ensure dimensions has exactly 5 items in canonical order."""
    by_name = {d.name: d for d in raw}
    out = []
    for name in DEFAULT_DIMENSION_NAMES:
        if name in by_name:
            out.append(by_name[name])
        else:
            # 缺失维度补 50 分
            logger.warning("Dimension %r missing, padding with 50", name)
            out.append(DimensionScore(
                name=name,  # type: ignore
                description="评分异常,默认中性",
                score=50,
                evidence_chips=[Chip(text="数据不足", good=False)],
            ))
    assert len(out) == 5
    return out
```

```typescript
// apps/desktop/src/pages/report/DimensionRow.tsx
interface DimensionRowProps {
  name: '专业深度' | '结构化表达' | '批判性思考' | '业务直觉' | '沟通节奏'
  description: string
  score: number  // 0-100
  evidenceChips: Array<{ text: string; good: boolean }>
}

export function DimensionRow({ name, description, score, evidenceChips }: DimensionRowProps) {
  const tone = score >= 80 ? 'brand' : score >= 65 ? 'neutral' : 'warn'
  const colorVar = tone === 'brand' ? 'var(--brand)' : tone === 'warn' ? 'var(--warn)' : 'var(--ink-700)'
  return (
    <div style={{ padding: '14px 0', borderBottom: '1px dashed var(--line)' }}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{name}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{description}</div>
        </div>
        <div className="row" style={{ gap: 10, minWidth: 220, justifyContent: 'flex-end' }}>
          <div className="bar" style={{ width: 140 }}>
            <i style={{ width: `${score}%`, background: colorVar }} />
          </div>
          <span className="mono" style={{ fontSize: 14, fontWeight: 600, color: colorVar, minWidth: 26, textAlign: 'right' }}>{score}</span>
        </div>
      </div>
      <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
        {evidenceChips.map((c, i) => (
          <span key={i} className={`tag ${c.good ? 'tag-green' : 'tag-warn'}`} style={{ fontSize: 10.5 }}>
            {c.good ? '+' : '−'} {c.text}
          </span>
        ))}
      </div>
    </div>
  )
}
```

```typescript
// apps/desktop/src/pages/report/QuestionReview.tsx
interface QuestionReviewProps {
  index: number
  questionTag: string
  questionText: string
  score: number
  tone: 'good' | 'ok' | 'warn'
  answerSummary: string
  aiFeedback: string
  defaultExpanded?: boolean
}

export function QuestionReview(props: QuestionReviewProps) {
  const [expanded, setExpanded] = useState(props.defaultExpanded ?? false)
  const colorVar = props.score >= 80 ? 'var(--brand)' : props.score >= 65 ? 'var(--ink-700)' : 'var(--warn)'
  return (
    <div style={{ borderBottom: '1px solid var(--line)' }}>
      <button className="row between" onClick={() => setExpanded(!expanded)}
        style={{ width: '100%', padding: '16px 24px', cursor: 'pointer' }}>
        {/* 折叠态:Q编号 + 问题 + tag + tone tag + score + chevron */}
        ...
      </button>
      {expanded && (
        <div style={{ padding: '0 24px 20px 58px' }}>
          {/* 你的回答·摘要 bg-warm 卡 */}
          {/* AI 反馈 brand-softer 或 warn-softer 卡 */}
          ...
        </div>
      )}
    </div>
  )
}
```

**测试设计:**

```python
# apps/api/tests/agents/test_report_dimensions.py
import pytest
from pydantic import ValidationError
from app.schemas.reports import DimensionScore, Chip
from app.domain.reports.service import normalize_dimensions

def test_dimension_name_strict():
    """L0 name 锁:5 个名字一一锁定."""
    valid = DimensionScore(
        name="专业深度",
        description="x",
        score=80,
        evidence_chips=[Chip(text="a", good=True)],
    )
    assert valid.name == "专业深度"

def test_alien_dimension_name_rejected():
    with pytest.raises(ValidationError):
        DimensionScore(
            name="逻辑清晰度",  # type: ignore
            description="x",
            score=80,
            evidence_chips=[Chip(text="a", good=True)],
        )

def test_score_boundary_0_and_100():
    for s in [0, 100]:
        d = DimensionScore(
            name="专业深度", description="x", score=s,
            evidence_chips=[Chip(text="a", good=True)],
        )
        assert d.score == s

def test_score_out_of_range_fails():
    for s in [-1, 101]:
        with pytest.raises(ValidationError):
            DimensionScore(
                name="专业深度", description="x", score=s,
                evidence_chips=[Chip(text="a", good=True)],
            )

def test_normalize_dimensions_pads_missing():
    """LLM 只输出 4 个 dimensions 时,降级补缺失项为 50 分."""
    partial = [
        DimensionScore(name="专业深度", description="x", score=80, evidence_chips=[Chip(text="a", good=True)]),
        DimensionScore(name="结构化表达", description="x", score=75, evidence_chips=[Chip(text="a", good=True)]),
        DimensionScore(name="批判性思考", description="x", score=65, evidence_chips=[Chip(text="a", good=True)]),
        DimensionScore(name="业务直觉", description="x", score=70, evidence_chips=[Chip(text="a", good=True)]),
        # 缺 沟通节奏
    ]
    normalized = normalize_dimensions(partial)
    assert len(normalized) == 5
    last = next(d for d in normalized if d.name == "沟通节奏")
    assert last.score == 50
    assert last.description == "评分异常,默认中性"
```

```python
# apps/api/tests/agents/test_round_review_v2.py
import pytest
from pydantic import ValidationError
from app.schemas.reports import RoundReviewV2

@pytest.mark.parametrize("score,tone", [
    (0, "warn"), (50, "ok"), (75, "ok"), (80, "good"), (100, "good"),
])
def test_round_review_v2_valid(score, tone):
    rv = RoundReviewV2(
        turn_index=1, question_tag="x", question_text="y",
        score=score, tone=tone,
        answer_summary="a", ai_feedback="b",
    )
    assert rv.score == score
    assert rv.tone == tone

def test_round_review_v2_invalid_tone():
    with pytest.raises(ValidationError):
        RoundReviewV2(
            turn_index=1, question_tag="x", question_text="y",
            score=80, tone="bad",  # type: ignore
            answer_summary="a", ai_feedback="b",
        )

def test_round_review_v2_score_out_of_range():
    with pytest.raises(ValidationError):
        RoundReviewV2(
            turn_index=1, question_tag="x", question_text="y",
            score=101, tone="good",
            answer_summary="a", ai_feedback="b",
        )
```

**Acceptance:**

```bash
cd apps/api
unset VIRTUAL_ENV
uv run pytest tests/agents/test_report_dimensions.py -v
uv run pytest tests/agents/test_round_review_v2.py -v
# 全过

cd ../desktop
corepack pnpm exec tsc --noEmit
corepack pnpm dev
# 视觉:
#   - ReportPage 主区出现"维度分析"卡,5 行 DimensionRow
#   - 维度名严格 5 个:专业深度/结构化表达/批判性思考/业务直觉/沟通节奏
#   - "逐题复盘"卡默认 Q1 展开,其他折叠
#   - mock LLM 返回 4 个 dimensions → 实际渲染补齐第 5 个为 50 分
#   - v3.1 老 session 报告(dimensions=[])→ 维度区显示空态,不崩
```

**Commit.** `feat(F-312,F-313): add dimensions[5] and round_reviews_v2 to InterviewReportPayload`

---

## V32.M1.4 — 追问线索 chip(F-319)

**Goal.** Interviewer Agent 输出每题的 2-3 个追问线索(每个 ≤ 8 字),前端在当前问题卡问题正文下方展示为 `tag-info` 浅蓝 chip。后端用 Pydantic Field 锁长度边界。

**Files (new):**
- `apps/desktop/src/pages/interview/FollowupHintChips.tsx`
- `apps/api/tests/agents/test_followup_hints.py`

**Files (modify):**
- `apps/api/app/agents/interviewer/schemas.py` — `InterviewerAgentOutput` 加 `followup_hints: list[str]` 新字段(老 `followup_hint: str | None` 保留)
- `apps/api/app/prompts/interviewer/system.md` — 输出 schema 加该字段说明 + 2-3 个示例
- `apps/desktop/src/pages/InterviewPage.tsx` — 当前问题卡问题正文下方接入 FollowupHintChips
- `packages/shared-types/src/index.ts` — 同步

**Key Interfaces:**

```python
# apps/api/app/agents/interviewer/schemas.py
from pydantic import BaseModel, Field, field_validator

class InterviewerAgentOutput(BaseModel):
    # ... 现有字段 ...
    followup_hint: str | None = None  # v3.1 老字段,保留兼容
    # v3.2 新增
    followup_hints: list[str] = Field(default_factory=list, min_length=0, max_length=3)

    @field_validator('followup_hints')
    @classmethod
    def validate_each_hint_length(cls, v: list[str]) -> list[str]:
        # 严格规则:输出时必须 2-3 个,每个 ≤ 8 字
        # default_factory=[] 允许空 list 用作降级,但非空时必须 ≥ 2
        if 0 < len(v) < 2:
            raise ValueError(f"followup_hints must be empty (degraded) or 2-3 items, got {len(v)}")
        for hint in v:
            if len(hint) > 8:
                raise ValueError(f"hint '{hint}' exceeds 8 chars (length={len(hint)})")
        return v
```

```typescript
// apps/desktop/src/pages/interview/FollowupHintChips.tsx
interface Props { hints: string[] }

export function FollowupHintChips({ hints }: Props) {
  if (!hints || hints.length === 0) return null
  return (
    <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
      {hints.map((h, i) => (
        <span key={i} className="tag tag-info" style={{ fontSize: 11 }}>
          追问线索 · {h}
        </span>
      ))}
    </div>
  )
}
```

**测试设计:**

```python
# apps/api/tests/agents/test_followup_hints.py
import pytest
from pydantic import ValidationError
from app.agents.interviewer.schemas import InterviewerAgentOutput

VALID_BASE = {  # 其他必填字段的最小合法值
    "question_tag": "...",
    "question_text": "...",
    # ... 其他 InterviewerAgentOutput required fields ...
}

def test_empty_hints_is_ok_for_degradation():
    out = InterviewerAgentOutput(**VALID_BASE, followup_hints=[])
    assert out.followup_hints == []

def test_two_hints_ok():
    out = InterviewerAgentOutput(**VALID_BASE, followup_hints=["指标", "用户"])
    assert len(out.followup_hints) == 2

def test_three_hints_ok():
    out = InterviewerAgentOutput(**VALID_BASE, followup_hints=["指标", "用户", "成本"])
    assert len(out.followup_hints) == 3

def test_one_hint_fails():
    with pytest.raises(ValidationError):
        InterviewerAgentOutput(**VALID_BASE, followup_hints=["指标"])

def test_four_hints_fails():
    with pytest.raises(ValidationError):
        InterviewerAgentOutput(**VALID_BASE, followup_hints=["a", "b", "c", "d"])

def test_hint_over_8_chars_fails():
    with pytest.raises(ValidationError, match="exceeds 8 chars"):
        InterviewerAgentOutput(**VALID_BASE, followup_hints=["指标", "超过八个字的追问线索"])
```

**Acceptance:**

```bash
cd apps/api
unset VIRTUAL_ENV
uv run pytest tests/agents/test_followup_hints.py -v  # 6 passed

cd ../desktop
corepack pnpm exec tsc --noEmit
corepack pnpm dev
# 视觉:
#   - 进入面试看到当前问题下方 2-3 个浅蓝 chip "追问线索 · X"
#   - 老 session 数据 followup_hints=[] 时,前端不渲染 chips 区(空态)
```

**Commit.** `feat(F-319): add followup_hints[2-3, ≤8 chars] to InterviewerAgentOutput`

---

## V32.M1.5 — 专项训练 CTA 深色卡(F-317)

**Goal.** Report 页右下角加 ink-900 深色 CTA 卡"针对薄弱点再来一场",点击跳到 ConfigPage 并预填 directions(取 dimensions 最低分 1-2 项映射)+ style="pressure" + duration=30。

**Files (new):**
- `apps/desktop/src/pages/report/DarkActionCard.tsx`
- `apps/api/tests/domain/test_preset_config.py`

**Files (modify):**
- `apps/api/app/schemas/reports.py` — 新增 `NextActions` + `next_actions_v2: NextActions | None` 字段(老 `next_actions: list[str]` 保留)
- `apps/api/app/agents/report/schemas.py` — `ReportAgentOutput` 同步
- `apps/api/app/domain/reports/service.py` — 新增 `derive_preset_config(dimensions: list[DimensionScore]) -> InterviewConfigRequest`
- `apps/desktop/src/pages/ReportPage.tsx` — 右 aside 底部加 `DarkActionCard`
- `apps/desktop/src/pages/ConfigPage.tsx` — 支持 URL query 或 store 预填 directions/style/duration
- `apps/desktop/src/stores/app-store.ts` — 加 `presetConfig: InterviewConfigRequest | null`(可选 prefill)
- `packages/shared-types/src/index.ts` — 同步

**Key Interfaces:**

```python
# apps/api/app/schemas/reports.py
class NextActions(BaseModel):
    headline: str = Field(max_length=20)
    preset_config: InterviewConfigRequest
    reason: str

class InterviewReportPayload(SchemaModel):
    # ... 老字段 next_actions: list[str] 保留 ...
    next_actions_v2: NextActions | None = None
```

```python
# apps/api/app/domain/reports/service.py
from app.schemas.sessions import InterviewConfigRequest
from app.schemas.reports import DimensionScore, NextActions

# 维度 → 推荐 directions 映射
DIMENSION_TO_DIRECTION_MAP = {
    "专业深度":     "ai-insight",      # 弱→ AI 场景洞察方向加强专业深度
    "结构化表达":   "data-driven",     # 弱→ 数据驱动训练结构化表达
    "批判性思考":   "strategy",        # 弱→ 产品战略训练批判
    "业务直觉":     "user-research",   # 弱→ 用户洞察补业务直觉
    "沟通节奏":     "cross-func",      # 弱→ 跨职能协作练沟通
}

def derive_preset_config(
    dimensions: list[DimensionScore],
    last_session_job_title: str | None = None,
) -> NextActions | None:
    """Pick 1-2 weakest dimensions, map to directions, build preset config."""
    if not dimensions:
        return None
    # 取分数最低的 2 项(若分数 ≥ 80 全部跳过)
    sorted_dims = sorted(dimensions, key=lambda d: d.score)
    weak = [d for d in sorted_dims if d.score < 80][:2]
    if not weak:
        return None
    directions = list(set(
        DIMENSION_TO_DIRECTION_MAP.get(d.name, "cross-func") for d in weak
    ))
    if not directions:
        directions = ["cross-func"]
    preset = InterviewConfigRequest(
        style="pressure",  # 专项训练默认高压
        directions=directions,
        duration_minutes=30,
    )
    weak_names = "、".join(d.name for d in weak)
    return NextActions(
        headline="针对薄弱点再来一场",
        preset_config=preset,
        reason=f"本场 {weak_names} 维度得分偏低,建议高压追问型加强训练",
    )
```

```typescript
// apps/desktop/src/pages/report/DarkActionCard.tsx
interface Props {
  headline: string
  reason: string
  onPrimaryClick: () => void
  onSecondaryClick: () => void
}

export function DarkActionCard({ headline, reason, onPrimaryClick, onSecondaryClick }: Props) {
  return (
    <div className="card" style={{
      padding: '20px',
      background: 'var(--ink-900)',
      color: 'white',
      borderColor: 'var(--ink-900)',
    }}>
      <div className="mono" style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.08em' }}>
        下一步
      </div>
      <div style={{ fontFamily: 'var(--f-serif)', fontSize: 22, lineHeight: 1.3, margin: '6px 0 10px' }}>
        {headline}
      </div>
      <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)', marginBottom: 16, lineHeight: 1.5 }}>
        {reason}
      </div>
      <button className="btn btn-brand" style={{ width: '100%', justifyContent: 'center' }} onClick={onPrimaryClick}>
        重新面试 · 专项训练
      </button>
      <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 6, color: 'rgba(255,255,255,0.75)' }} onClick={onSecondaryClick}>
        修改配置后再开始
      </button>
    </div>
  )
}
```

**测试设计:**

```python
# apps/api/tests/domain/test_preset_config.py
import pytest
from app.schemas.reports import DimensionScore, Chip
from app.domain.reports.service import derive_preset_config

def make_dim(name: str, score: int) -> DimensionScore:
    return DimensionScore(
        name=name, description="x", score=score,
        evidence_chips=[Chip(text="a", good=True)],
    )

def test_picks_2_weakest_dimensions():
    dims = [
        make_dim("专业深度", 60),
        make_dim("结构化表达", 90),
        make_dim("批判性思考", 50),  # 最弱
        make_dim("业务直觉", 75),
        make_dim("沟通节奏", 80),
    ]
    result = derive_preset_config(dims)
    assert result is not None
    assert "strategy" in result.preset_config.directions  # 批判性思考 → strategy
    assert "ai-insight" in result.preset_config.directions  # 专业深度 → ai-insight
    assert result.preset_config.style == "pressure"
    assert result.preset_config.duration_minutes == 30

def test_returns_none_when_all_dimensions_strong():
    dims = [make_dim(n, 85) for n in ["专业深度", "结构化表达", "批判性思考", "业务直觉", "沟通节奏"]]
    assert derive_preset_config(dims) is None

def test_returns_none_when_dimensions_empty():
    assert derive_preset_config([]) is None
```

**Acceptance:**

```bash
cd apps/api
unset VIRTUAL_ENV
uv run pytest tests/domain/test_preset_config.py -v  # 3 passed

cd ../desktop
corepack pnpm exec tsc --noEmit
corepack pnpm dev
# 视觉:
#   - ReportPage 右下角看到深色 CTA 卡(ink-900 底,白字)
#   - 点击主 CTA "重新面试 · 专项训练" → 跳到 ConfigPage,directions/style 预填
#   - 点击次 CTA "修改配置后再开始" → 跳 ConfigPage,预填但保持可改
#   - dimensions 全空(老报告)→ DarkActionCard 不渲染
```

**Commit.** `feat(F-317): add DarkActionCard with preset_config from weakest dimensions`

---

## P0 完工后(11 节点全部 [x] 后)

人审过 11 个 commits 后,验证整体 Demo 路径:

1. 上传简历+JD → 解析 → ParsedPanel
2. ConfigPage:**4 风格 + 6 方向多选(默认勾 AI 推荐 2)+ 3 时长 (15/30/45)**
3. 进入面试:顶部 **"面试官 Sarah · 结构化面试官"**,问题下方 **2-3 个追问线索 chip**
4. 完成面试 → 报告页:
   - Hero 双卡:**总分 + 通过可能性"中上/中/中下"3 档**(绝不出现数值或"不建议")
   - **维度分析卡 5 行**:专业深度/结构化表达/批判性思考/业务直觉/沟通节奏
   - **逐题复盘卡**:每题 0-100 + good/ok/warn tone + 摘要 + AI 反馈
   - 右下角 **深色专项训练 CTA**:点击跳到预填弱项的 ConfigPage
5. 老 v3.1 session 数据打开不崩

P0 验收通过后:进入 M2(实时面试增强 + 老板新需求 F-320/F-321),需要新一轮 v32-p1-sections.md。
