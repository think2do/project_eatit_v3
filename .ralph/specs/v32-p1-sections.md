# v3.2+ P1/M2.1 Sections — 实时面试体验增强(第一批)

P1 / M2.1 = **实时面试增强**(F-309 / F-310 / F-311 / F-306 + InterviewPage 顶部重构),共 **5 个 ralph 节点**。

> ⚠️ M2.2 解析体验扩展(F-301~F-305)与 M2.3 老板新需求(F-320 联网情报 + F-321 题目预测)在后续批跑,本文件不含。

所有节点遵守 [v32-p1-constraints.md](v32-p1-constraints.md) + [v32-p0-constraints.md](v32-p0-constraints.md) 全部红线。

## Execution order

| # | Section | Deps | Commit prefix |
|---|---|---|---|
| 1 | **V32.M2.1.1 F-309 实时观察侧栏(live_observation 字段)** | M0/M1 已 done | `feat(F-309): add live_observation to NextQuestion + LiveObservationCard` |
| 2 | **V32.M2.1.2 F-310 实时统计(纯前端 hook)** | M2.1.1 | `feat(F-310): useTurnStats hook (wpm + filler words + elapsed)` |
| 3 | **V32.M2.1.3 F-311 键盘快捷键(Space/R/Esc)** | M2.1.2 | `feat(F-311): useGlobalKeymap hook (Space/R/Esc + end-confirm dialog)` |
| 4 | **V32.M2.1.4 F-306 Tips Carousel 替换 WaitingTips** | M2.1.3 | `feat(F-306): TipsCarousel with completion transition + tips.json library` |
| 5 | **V32.M2.1.5 InterviewPage 顶部重构 + 近 3 轮摘要 + WaveBars** | M2.1.4 | `feat(ui): InterviewPage REC topbar + Session meta strip + WaveBars + recent rounds` |

P0 + M2.1 完工后:**16 + 5 = 21 个节点 done**。M2.2 / M2.3 后续批继续。

---

## V32.M2.1.1 — F-309 实时观察侧栏

**Goal.** PRD v3.2 §6.3.6 / §8.4 — Interviewer Agent 在 turn_evaluating 阶段一次输出 `live_observation` 字段(≤30 字),前端在 InterviewPage 右 aside 第 3 张卡(brand-softer 底)显示。当前 v3.1 用独立 Observer Agent + WS 事件兜底,本节点改为 NextQuestion 字段优先 + Observer fallback **双轨**。

**Files (modify):**
- `apps/api/app/agents/interviewer/schemas.py` — `InterviewerAgentOutput` 加 `live_observation: str | None = Field(default=None, max_length=30)`
- `apps/api/app/prompts/interviewer/system.j2` — 加 live_observation 输出说明 + 教学语气要求 + 首轮 None 规则
- `apps/desktop/src/pages/InterviewPage.tsx` — 右 aside 接入 `LiveObservationCard`,优先 NextQuestion.live_observation,null 时 fallback 到现有 Observer WS 事件
- `packages/shared-types/src/index.ts` — 同步 `live_observation` 类型字段

**Files (new):**
- `apps/desktop/src/pages/interview/LiveObservationCard.tsx` — sparkle icon + "AI 实时观察" + 文本(关键词 brand-ink 加粗;空态 muted "AI 正在听…")
- `apps/api/tests/agents/test_live_observation.py` — 边界:30 字 / 31 字(fail)/ None / 评判式样例(后置 regex 扫)

**Key Interfaces.**

```python
# apps/api/app/agents/interviewer/schemas.py
class InterviewerAgentOutput(BaseModel):
    # ... 现有字段 ...
    followup_hints: list[str] = Field(default_factory=list, min_length=0, max_length=3)  # M1.4 已 done
    # v3.3 新增
    live_observation: str | None = Field(
        default=None,
        max_length=30,
        description="对上一轮回答的轻量观察,≤30 字,口语化非评判式;turn 0 时为 None",
    )
```

```python
# apps/api/app/prompts/interviewer/system.j2 增加段落
"""
... 现有指令 ...

【live_observation 字段(F-309)】
若当前是 turn 0(第一题),设 live_observation = null。
若是 turn ≥ 1,根据上一轮候选人回答,输出一句 ≤ 30 字的轻量观察。

要求:
- 长度严格 ≤ 30 字(超出后端会拒绝)
- 教学语气,**不得评判式**
- 关键术语自然嵌入,不夸张

合规样例:
- "结构清晰,但优先级判断一带而过"
- "举例具体,数据有支撑;可补判断维度"
- "答得稳,语速略快,可放慢一拍"

违规样例(后端会拒绝):
- "你回答得很差" ← 评判式
- "完全没有抓住要点" ← 否定式
- "缺乏深度" ← 否定式
"""
```

```typescript
// apps/desktop/src/pages/interview/LiveObservationCard.tsx
interface Props {
  text: string | null  // null 表示 turn 0 或还没生成
  fallback?: string | null  // Observer WS 事件兜底
}

export function LiveObservationCard({ text, fallback }: Props) {
  const display = text ?? fallback ?? null
  return (
    <div className="card" style={{ padding: '16px 20px', background: 'var(--brand-softer)', borderColor: 'var(--brand-soft)' }}>
      <div className="row" style={{ gap: 8, marginBottom: 6, color: 'var(--brand-ink)' }}>
        {/* sparkle icon */}
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>AI 实时观察</span>
      </div>
      {display ? (
        <div style={{ fontSize: 12.5, color: 'var(--ink-700)', lineHeight: 1.6 }}>{display}</div>
      ) : (
        <div className="muted" style={{ fontSize: 12 }}>AI 正在听…</div>
      )}
    </div>
  )
}
```

**测试设计**:

```python
# apps/api/tests/agents/test_live_observation.py
import pytest
from pydantic import ValidationError
from app.agents.interviewer.schemas import InterviewerAgentOutput

VALID_BASE = { ... }  # 其他必填字段最小合法值

def test_live_observation_30_chars_ok():
    obs = "结构清晰,但优先级判断一带而过缺补充示例"  # 调到 30 字
    InterviewerAgentOutput(**VALID_BASE, live_observation=obs)

def test_live_observation_31_chars_rejected():
    with pytest.raises(ValidationError, match="max_length"):
        InterviewerAgentOutput(**VALID_BASE, live_observation="a" * 31)

def test_live_observation_none_for_turn_0():
    out = InterviewerAgentOutput(**VALID_BASE, live_observation=None)
    assert out.live_observation is None
```

**Acceptance** (从 `apps/api/` 跑):

```bash
unset VIRTUAL_ENV
uv run python -m pytest tests/agents/test_live_observation.py -v
uv run python -m pytest -q  # 全量回归

cd ../desktop
corepack pnpm exec tsc --noEmit
corepack pnpm lint
corepack pnpm lint:design-tokens
```

**Commit.** `feat(F-309): add live_observation to NextQuestion + LiveObservationCard`

提交 body:
- 双轨设计说明(NextQuestion 优先,Observer WS fallback)
- 测试输出末尾 N passed
- 不动现有 Observer Agent / WS 事件协议

---

## V32.M2.1.2 — F-310 实时统计(纯前端 hook)

**Goal.** PRD v3.2 §6.3.4 — InterviewPage 我的回答卡底部 stat row 显示 `⏱ 本题用时 X:XX` + `语速 [适中/偏慢/偏快]` + `填充词 N 次`。100ms 刷新,纯前端实时计算,**不增加 LLM 成本**。

**Files (new):**
- `apps/desktop/src/lib/fillerWords.ts` — **L0 锁:7 个固定词,严禁修改**
- `apps/desktop/src/pages/interview/useTurnStats.ts` — React hook(语速 / 填充词 / 用时)
- `apps/desktop/src/__tests__/useTurnStats.test.ts` — Vitest 单元测试(本节同时引入 Vitest 框架)
- `apps/desktop/src/__tests__/fillerWords.test.ts` — fillerWords 锁测试

**Files (also create — 引入 Vitest 框架):**
- `apps/desktop/vitest.config.ts` — Vitest 配置(jsdom 环境)
- `apps/desktop/package.json` — `scripts.test` 加 `"test": "vitest run"` + `devDependencies` 加 `vitest` + `@testing-library/react` + `@testing-library/jest-dom` + `jsdom`

**Files (modify):**
- `apps/desktop/src/pages/InterviewPage.tsx` — 我的回答卡底部接入 `useTurnStats` 返回值,显示 stat row
- `apps/api/app/agents/observer/constants.py`(若不存在则新建)— 后端镜像 fillerWords 列表(L0 一致)

**Key Interfaces.**

```typescript
// apps/desktop/src/lib/fillerWords.ts
// L0 红线 A9:7 词锁,严禁修改/删除/增加
export const FILLER_WORDS_CN = [
  "嗯", "呃", "那个", "就是", "这个", "反正", "然后然后",
] as const;

export const FILLER_WORDS_LENGTH = 7;  // 锁

// apps/desktop/src/pages/interview/useTurnStats.ts
import { useState, useEffect, useMemo } from 'react'
import { FILLER_WORDS_CN } from '@/lib/fillerWords'

export interface TurnStats {
  elapsedSeconds: number
  wpm: number               // 字/分(中文字符级)
  rateLabel: 'slow' | 'moderate' | 'fast'
  fillerCount: number
}

export function useTurnStats(
  finalText: string,
  recordingStartMs: number | null,
): TurnStats {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!recordingStartMs) return
    const t = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(t)
  }, [recordingStartMs])

  const elapsedSeconds = recordingStartMs
    ? Math.floor((now - recordingStartMs) / 1000)
    : 0
  const wordCount = finalText.length
  const wpm = elapsedSeconds > 0 ? Math.round((wordCount / elapsedSeconds) * 60) : 0
  const rateLabel: 'slow' | 'moderate' | 'fast' =
    wpm > 200 ? 'fast' : wpm < 100 ? 'slow' : 'moderate'

  const fillerCount = useMemo(() => {
    return FILLER_WORDS_CN.reduce((sum, w) => {
      const matches = finalText.match(new RegExp(w, 'g'))
      return sum + (matches?.length ?? 0)
    }, 0)
  }, [finalText])

  return { elapsedSeconds, wpm, rateLabel, fillerCount }
}
```

```python
# apps/api/app/agents/observer/constants.py(后端镜像,L0 双端一致)
"""Filler words list — L0 red line A9.

This list MUST stay identical to apps/desktop/src/lib/fillerWords.ts.
CI grep validates synchronization (see scripts/lint-filler-words.sh).
"""
from typing import Final

FILLER_WORDS_CN: Final[tuple[str, ...]] = (
    "嗯", "呃", "那个", "就是", "这个", "反正", "然后然后",
)
```

**测试设计**:

```typescript
// apps/desktop/src/__tests__/useTurnStats.test.ts
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTurnStats } from '@/pages/interview/useTurnStats'

describe('useTurnStats', () => {
  it('returns 0 wpm when not recording', () => {
    const { result } = renderHook(() => useTurnStats('', null))
    expect(result.current.wpm).toBe(0)
  })

  it('counts filler words from final text', () => {
    const text = '嗯,我觉得这个项目就是要,反正先把,那个核心做出来'
    const { result } = renderHook(() => useTurnStats(text, Date.now()))
    expect(result.current.fillerCount).toBeGreaterThanOrEqual(4)  // 嗯/这个/就是/反正/那个
  })

  it('rate label moderate at ~150 wpm', () => {
    // 50 字 / 20 秒 = 150 wpm
    const text = 'a'.repeat(50)
    const start = Date.now() - 20000
    const { result } = renderHook(() => useTurnStats(text, start))
    expect(result.current.rateLabel).toBe('moderate')
  })
})
```

```typescript
// apps/desktop/src/__tests__/fillerWords.test.ts
import { describe, it, expect } from 'vitest'
import { FILLER_WORDS_CN, FILLER_WORDS_LENGTH } from '@/lib/fillerWords'

describe('FILLER_WORDS_CN — L0 lock', () => {
  it('has exactly 7 words', () => {
    expect(FILLER_WORDS_CN.length).toBe(FILLER_WORDS_LENGTH)
  })

  it('contains exact 7 specified words(锁)', () => {
    expect(new Set(FILLER_WORDS_CN)).toEqual(
      new Set(['嗯', '呃', '那个', '就是', '这个', '反正', '然后然后']),
    )
  })
})
```

**Acceptance:**

```bash
cd apps/desktop
corepack pnpm add -D vitest @testing-library/react @testing-library/jest-dom jsdom
corepack pnpm test  # vitest run
# 应 5+ passed

corepack pnpm exec tsc --noEmit
corepack pnpm lint
corepack pnpm lint:design-tokens

# 后端镜像同步 grep 验证
cd ../..
grep -c '"嗯"' apps/desktop/src/lib/fillerWords.ts apps/api/app/agents/observer/constants.py
# 双端各 1 命中
```

**Commit.** `feat(F-310): useTurnStats hook (wpm + filler words + elapsed)`

提交 body:
- 引入 Vitest 框架(devDependencies + config)
- 双端 L0 锁(前端 fillerWords.ts + 后端 constants.py 同 7 词)
- 测试输出 N passed

---

## V32.M2.1.3 — F-311 键盘快捷键(Space / R / Esc)

**Goal.** PRD v3.2 §6.3.6 ④ — InterviewPage 全局 keymap:
- `Space` 完成回答(等价于点"完成回答 →")
- `R` 重听问题(等价于点 volume icon)
- `Esc` 弹"结束面试"确认弹窗(不直接结束,需要二次确认)

input / textarea focus 时**不响应**(用户在文字输入模式下按 Space 不应触发提交)。

**Files (new):**
- `apps/desktop/src/lib/useGlobalKeymap.ts` — 全局 keydown listener hook
- `apps/desktop/src/components/EndConfirmDialog.tsx` — Esc 触发的确认弹窗(基于 EatitDialog,M0.1f 重写)
- `apps/desktop/src/__tests__/useGlobalKeymap.test.ts` — 单元测试(input focus 不响应)

**Files (modify):**
- `apps/desktop/src/pages/InterviewPage.tsx` — mount 时注册 useGlobalKeymap,接 handleSubmit / handleReplay / setEndConfirmOpen
- `apps/desktop/src/pages/interview/` 新加 `KeyboardShortcutHelper.tsx`(右 aside 底部,muted 11.5px,用 .kbd 类)

**Key Interfaces.**

```typescript
// apps/desktop/src/lib/useGlobalKeymap.ts
import { useEffect } from 'react'

export interface KeymapHandlers {
  onSubmit?: () => void
  onReplay?: () => void
  onEnd?: () => void
}

export function useGlobalKeymap(handlers: KeymapHandlers, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return
    function onKey(e: KeyboardEvent) {
      // input/textarea focus 时不响应
      const target = e.target as HTMLElement
      if (target instanceof HTMLInputElement) return
      if (target instanceof HTMLTextAreaElement) return
      if (target.isContentEditable) return

      if (e.code === 'Space') {
        e.preventDefault()
        handlers.onSubmit?.()
      } else if (e.key === 'r' || e.key === 'R') {
        handlers.onReplay?.()
      } else if (e.key === 'Escape') {
        handlers.onEnd?.()  // 触发弹窗,不直接结束
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, handlers.onSubmit, handlers.onReplay, handlers.onEnd])
}
```

```typescript
// apps/desktop/src/pages/interview/KeyboardShortcutHelper.tsx
export function KeyboardShortcutHelper() {
  return (
    <div className="muted" style={{ fontSize: 11.5, padding: '4px 2px', lineHeight: 1.5 }}>
      <kbd className="kbd">Space</kbd> 完成回答 · <kbd className="kbd">R</kbd> 重听
      <br />
      <kbd className="kbd">Esc</kbd> 结束面试
    </div>
  )
}
```

```typescript
// apps/desktop/src/components/EndConfirmDialog.tsx(基于 EatitDialog)
interface Props {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function EndConfirmDialog({ open, onConfirm, onCancel }: Props) {
  if (!open) return null
  return (
    <EatitDialog open={open} onClose={onCancel}>
      <div className="card-pad-lg">
        <h2 className="h2">结束面试?</h2>
        <p className="body muted" style={{ marginTop: 8 }}>
          当前进度会保留,稍后可继续或重新开始。
        </p>
        <div className="row" style={{ gap: 8, marginTop: 24, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel}>取消</button>
          <button className="btn btn-danger-soft" onClick={onConfirm}>确认结束</button>
        </div>
      </div>
    </EatitDialog>
  )
}
```

**测试设计**:

```typescript
// apps/desktop/src/__tests__/useGlobalKeymap.test.ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useGlobalKeymap } from '@/lib/useGlobalKeymap'

describe('useGlobalKeymap', () => {
  it('Space triggers onSubmit when not in input', () => {
    const onSubmit = vi.fn()
    renderHook(() => useGlobalKeymap({ onSubmit }))
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    expect(onSubmit).toHaveBeenCalled()
  })

  it('Space ignored when input focused', () => {
    const onSubmit = vi.fn()
    renderHook(() => useGlobalKeymap({ onSubmit }))
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Esc triggers onEnd (which opens dialog, not immediate end)', () => {
    const onEnd = vi.fn()
    renderHook(() => useGlobalKeymap({ onEnd }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onEnd).toHaveBeenCalled()
  })
})
```

**Acceptance:**

```bash
cd apps/desktop
corepack pnpm test src/__tests__/useGlobalKeymap.test.ts -- --run
# 3 passed

corepack pnpm exec tsc --noEmit
corepack pnpm lint
corepack pnpm lint:design-tokens
```

**Commit.** `feat(F-311): useGlobalKeymap hook (Space/R/Esc + end-confirm dialog)`

提交 body:
- input/textarea focus 不响应行为
- Esc 触发 EndConfirmDialog(基于 P0 重写的 EatitDialog),不直接结束
- KeyboardShortcutHelper 用 .kbd 共享类

---

## V32.M2.1.4 — F-306 Tips Carousel(替换简陋 WaitingTips)

**Goal.** PRD v3.2 §5.7 / §6.1.5 / §6.5.7 — 把 v3.1 的简陋 `WaitingTips`(单条文字旋转)替换为完整的 `TipsCarousel`:卡片切换 + 4-5s 间隔 + 完成态 "已完成 ✓" 0.3-0.5s 过渡 + 圆点指示器。本地 tips.json 库 + 个性化 tips 合并算法(personalized 优先,本地兜底)。

**Files (new):**
- `apps/desktop/src/data/tips.json` — 静态本地库(20-30 条,按"开场/表达/数据/决策/收尾" 5 类)
- `apps/desktop/src/components/TipsCarousel.tsx` — 完整组件(替换 WaitingTips)
- `apps/desktop/src/lib/tips.ts` — `selectTips(context, sessionCount, cache)` 合并函数
- `apps/desktop/src/__tests__/TipsCarousel.test.tsx` — Vitest 测试(自动切换 + 完成态过渡)

**Files (modify):**
- `apps/desktop/src/pages/UploadPage.tsx`(或对应 ParseResultCard 父组件)— parse_in_progress 时显示 TipsCarousel(540px 卡片)
- `apps/desktop/src/pages/ReportPage.tsx` — generating 状态时显示 TipsCarousel(全屏卡片)

**Files (delete):**
- `apps/desktop/src/components/WaitingTips.tsx` — 旧简陋实现,grep 确认 0 引用后删

**Key Interfaces.**

```json
// apps/desktop/src/data/tips.json (节选,完整 20-30 条)
[
  { "id": "t-001", "content": "回答前花 3 秒做个简短结构,STAR / 因果三段式都可以", "category": "表达" },
  { "id": "t-002", "content": "数据要具体:不只是'增长很快',而是'季度环比 35%,从 2k 到 2.7k DAU'", "category": "数据" },
  { "id": "t-003", "content": "举例尽量是亲历项目,而不是行业典型案例", "category": "表达" },
  { "id": "t-004", "content": "对追问的判断依据要补'我当时考虑的反例是 X'", "category": "决策" },
  { "id": "t-005", "content": "节奏控制:每题 1.5-3 分钟回答,留时间给追问", "category": "节奏" }
]
```

```typescript
// apps/desktop/src/lib/tips.ts
import localTips from '@/data/tips.json'

export interface TipsCard {
  id: string
  content: string
  category: string
}

export function selectTips(
  context: 'parsing' | 'report_generating',
  sessionCount: number,
  personalizedCache: TipsCard[] = [],
): TipsCard[] {
  // 用户场次 < 3 → 纯本地;≥ 3 且有个性化 → personalized 优先
  if (sessionCount >= 3 && personalizedCache.length > 0) {
    const merged = [...personalizedCache]
    if (merged.length < 5) {
      // personalized 不足 5 条,补本地
      const supplement = localTips.slice(0, 5 - merged.length)
      merged.push(...supplement)
    }
    return merged
  }
  // 默认本地库,按上下文挑选(parsing 选偏前置类,report_generating 选偏复盘类)
  return localTips as TipsCard[]
}

export function getFallbackTips(): TipsCard[] {
  // 即使 tips.json 加载失败,组件 hardcoded 8 条 fallback
  return [
    { id: 'fallback-1', content: '保持自然语速,语速适中比快或慢都好', category: '节奏' },
    // ... 至少 8 条 hardcoded
  ]
}
```

```typescript
// apps/desktop/src/components/TipsCarousel.tsx
import { useState, useEffect } from 'react'
import { TipsCard } from '@/lib/tips'

interface Props {
  tips: TipsCard[]
  size?: 'small' | 'large' | 'full'  // 360px / 540px / 全屏
  completing?: boolean  // 操作完成时,展示"已完成 ✓"过渡
  onCompleted?: () => void  // 过渡结束回调
  intervalMs?: number  // 默认 4500ms
}

export function TipsCarousel({ tips, size = 'small', completing, onCompleted, intervalMs = 4500 }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [showDone, setShowDone] = useState(false)

  // 自动切换
  useEffect(() => {
    if (completing) return  // 完成状态时停止切换
    const t = setInterval(() => {
      setActiveIndex(i => (i + 1) % tips.length)
    }, intervalMs)
    return () => clearInterval(t)
  }, [tips.length, intervalMs, completing])

  // 完成态过渡
  useEffect(() => {
    if (!completing) return
    setShowDone(true)
    const t = setTimeout(() => {
      setShowDone(false)
      onCompleted?.()
    }, 400)  // 0.3-0.5s 之间
    return () => clearTimeout(t)
  }, [completing, onCompleted])

  const widthMap = { small: 360, large: 540, full: '100%' }

  return (
    <div style={{ width: widthMap[size], margin: '0 auto' }}>
      <div className="card card-pad-lg" style={{ background: 'var(--bg-warm)' }}>
        {showDone ? (
          <div className="row" style={{ gap: 8, color: 'var(--brand)', fontSize: 16, fontWeight: 600 }}>
            <span>✓</span> 已完成
          </div>
        ) : (
          <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>
            <span style={{ color: 'var(--brand-ink)', fontWeight: 600 }}>面试 Tip · </span>
            {tips[activeIndex]?.content ?? ''}
          </div>
        )}
      </div>
      {/* 圆点指示器 */}
      <div className="row" style={{ justifyContent: 'center', gap: 6, marginTop: 12 }}>
        {tips.map((_, i) => (
          <span
            key={i}
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: i === activeIndex ? 'var(--brand)' : 'var(--ink-200)',
            }}
          />
        ))}
      </div>
    </div>
  )
}
```

**测试设计**:

```typescript
// apps/desktop/src/__tests__/TipsCarousel.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { TipsCarousel } from '@/components/TipsCarousel'

const mockTips = [
  { id: '1', content: 'Tip 1', category: 'a' },
  { id: '2', content: 'Tip 2', category: 'b' },
  { id: '3', content: 'Tip 3', category: 'c' },
]

describe('TipsCarousel', () => {
  it('shows first tip initially', () => {
    const { getByText } = render(<TipsCarousel tips={mockTips} intervalMs={1000} />)
    expect(getByText(/Tip 1/)).toBeTruthy()
  })

  it('auto-switches after intervalMs', () => {
    vi.useFakeTimers()
    const { getByText } = render(<TipsCarousel tips={mockTips} intervalMs={1000} />)
    act(() => { vi.advanceTimersByTime(1100) })
    expect(getByText(/Tip 2/)).toBeTruthy()
    vi.useRealTimers()
  })

  it('shows "已完成 ✓" when completing=true', () => {
    const { rerender, getByText } = render(<TipsCarousel tips={mockTips} />)
    rerender(<TipsCarousel tips={mockTips} completing={true} />)
    expect(getByText(/已完成/)).toBeTruthy()
  })

  it('calls onCompleted after transition', async () => {
    vi.useFakeTimers()
    const onCompleted = vi.fn()
    const { rerender } = render(<TipsCarousel tips={mockTips} />)
    rerender(<TipsCarousel tips={mockTips} completing={true} onCompleted={onCompleted} />)
    act(() => { vi.advanceTimersByTime(450) })
    expect(onCompleted).toHaveBeenCalled()
    vi.useRealTimers()
  })
})
```

**Acceptance:**

```bash
cd apps/desktop
corepack pnpm test src/__tests__/TipsCarousel.test.tsx -- --run
# 4 passed

# WaitingTips 已删除
test ! -f src/components/WaitingTips.tsx
grep -r "WaitingTips" src/  # 应 0 命中(导入处都迁移到 TipsCarousel)

corepack pnpm exec tsc --noEmit
corepack pnpm lint
corepack pnpm lint:design-tokens
```

**Commit.** `feat(F-306): TipsCarousel with completion transition + tips.json library`

提交 body:
- 删除旧 WaitingTips
- 引入 tips.json 静态库(20-30 条)
- selectTips 合并算法(场次<3 纯本地;≥3 + 个性化 = 个性化优先)
- TipsCarousel 三 size + 4 测试

---

## V32.M2.1.5 — InterviewPage 顶部重构 + 近 3 轮摘要 + WaveBars

**Goal.** PRD v3.2 §6.3.1 / §6.3.2 / §6.3.5 — InterviewPage 完整对齐 page-live.jsx 原型:

- **Topbar 重构**:左侧 REC 红色脉冲 + mm:ss 计时器,右侧暂停 + 结束面试 btn-danger-soft(M2.1.3 已加 EndConfirmDialog,本节接入)
- **Session meta strip**:三段(当前岗位 / 面试官风格 + 名字 / 进度 X/Y + 进度条)+ divider-v 28px 高
- **WaveBars 波形可视化**:8 根条带,active 时 0.9s wave 动画 + 0.08s 错峰
- **近 3 轮摘要**:页面下方,每条 Q-N + 问题 + tone tag(good/risk/normal)+ 摘要

**Files (new):**
- `apps/desktop/src/pages/interview/RecBadge.tsx` — REC 红色脉冲 + mm:ss
- `apps/desktop/src/pages/interview/SessionMetaStrip.tsx` — 三段 meta(岗位/Persona/进度)
- `apps/desktop/src/pages/interview/WaveBars.tsx` — 8 根条带波形,active 时 0.9s 动画
- `apps/desktop/src/pages/interview/RecentRounds.tsx` — 近 3 轮摘要列表

**Files (modify):**
- `apps/desktop/src/pages/InterviewPage.tsx` — 整页重构,接入 RecBadge / SessionMetaStrip / WaveBars / RecentRounds + KeyboardShortcutHelper(M2.1.3)+ LiveObservationCard(M2.1.1)+ TurnStats stat row(M2.1.2)+ EndConfirmDialog(M2.1.3)+ 共享 className 替换 inline style

**Key Interfaces.**

```typescript
// RecBadge.tsx
export function RecBadge({ recording, elapsedSeconds }: { recording: boolean; elapsedSeconds: number }) {
  const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')
  const ss = String(elapsedSeconds % 60).padStart(2, '0')
  return (
    <span className="tag tag-dot" style={{ color: 'var(--warn)', background: 'var(--warn-softer)' }}>
      <span style={{
        display: 'inline-block', width: 7, height: 7, background: 'var(--warn)', borderRadius: '50%',
        animation: recording ? 'eatit-pulse 1.4s infinite' : 'none',
      }} />
      REC {mm}:{ss}
    </span>
  )
}

// 在 index.css 加 keyframe(若没有)
// @keyframes eatit-pulse { 50% { opacity: 0.35; } }
```

```typescript
// SessionMetaStrip.tsx
interface Props {
  jobTitle: string
  personaName: string
  styleLabel: string
  currentTurn: number
  totalTurns: number
}

export function SessionMetaStrip({ jobTitle, personaName, styleLabel, currentTurn, totalTurns }: Props) {
  return (
    <div className="row between" style={{ marginBottom: 18 }}>
      <div className="row" style={{ gap: 16 }}>
        <div>
          <div className="eyebrow">当前岗位</div>
          <div style={{ fontSize: 13.5, fontWeight: 500, marginTop: 2 }}>{jobTitle}</div>
        </div>
        <div className="divider-v" style={{ height: 28 }} />
        <div>
          <div className="eyebrow">面试官风格</div>
          <div style={{ fontSize: 13.5, fontWeight: 500, marginTop: 2 }}>{styleLabel} · {personaName}</div>
        </div>
        <div className="divider-v" style={{ height: 28 }} />
        <div>
          <div className="eyebrow">进度</div>
          <div className="row" style={{ gap: 8, marginTop: 2 }}>
            <span className="mono" style={{ fontSize: 13, fontWeight: 500 }}>{currentTurn} / {totalTurns}</span>
            <div className="bar" style={{ width: 80 }}>
              <i style={{ width: `${(currentTurn / totalTurns) * 100}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

```typescript
// WaveBars.tsx
export function WaveBars({ active }: { active: boolean }) {
  const heights = [6, 14, 10, 18, 8, 16, 11, 13]
  return (
    <div className="row" style={{ gap: 2, alignItems: 'flex-end', height: 20 }}>
      {heights.map((h, i) => (
        <span
          key={i}
          style={{
            width: 2.5,
            height: active ? h : 4,
            background: active ? 'var(--brand)' : 'var(--ink-300)',
            borderRadius: 2,
            animation: active ? `eatit-wave 0.9s ${i * 0.08}s infinite ease-in-out` : 'none',
            transformOrigin: 'bottom',
          }}
        />
      ))}
    </div>
  )
}

// index.css 加 keyframe
// @keyframes eatit-wave { 0%, 100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }
```

```typescript
// RecentRounds.tsx
interface Round {
  index: number
  question: string
  answerSummary: string
  tone: 'good' | 'risk' | 'normal'
  toneLabel: string
}

export function RecentRounds({ rounds }: { rounds: Round[] }) {
  if (rounds.length === 0) return null
  return (
    <div>
      <div className="row between" style={{ marginBottom: 10 }}>
        <span className="eyebrow">近几轮问答摘要</span>
        <span className="muted" style={{ fontSize: 11.5 }}>仅展示最近 3 轮 · 完整记录在报告中查看</span>
      </div>
      <div className="col" style={{ gap: 10 }}>
        {rounds.slice(-3).map(r => (
          <div key={r.index} className="card" style={{ padding: '12px 16px' }}>
            <div className="row between" style={{ marginBottom: 4 }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-400)' }}>Q{r.index}</span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{r.question}</span>
              </div>
              <span className={`tag ${r.tone === 'good' ? 'tag-green' : r.tone === 'risk' ? 'tag-warn' : 'tag-line'}`}>
                {r.toneLabel}
              </span>
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginLeft: 26 }}>{r.answerSummary}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Acceptance:**

```bash
cd apps/desktop

# 4 个新组件存在
test -f src/pages/interview/RecBadge.tsx
test -f src/pages/interview/SessionMetaStrip.tsx
test -f src/pages/interview/WaveBars.tsx
test -f src/pages/interview/RecentRounds.tsx

# index.css 加了两个 keyframe
grep -c "eatit-pulse\|eatit-wave" src/index.css  # ≥ 2

corepack pnpm exec tsc --noEmit
corepack pnpm lint
corepack pnpm lint:design-tokens
corepack pnpm build  # vite build 成功
```

**Commit.** `feat(ui): InterviewPage REC topbar + Session meta strip + WaveBars + recent rounds`

提交 body:
- 4 个新组件接入
- 整页 InterviewPage 重构对照 page-live.jsx 原型
- 共享 className(.card / .row / .between / .col / .eyebrow / .divider-v / .bar / .tag-dot 等)直接复用,严禁 inline style 重写
- index.css 加 eatit-pulse + eatit-wave 两个 keyframe

---

## P1/M2.1 完工后

完成 5 个节点后 fix_plan.md 全 [x],ralph EXIT_SIGNAL: true 收口。下一批 M2.2(F-301~F-305 解析体验)+ M2.3(F-320/F-321 老板新需求)由人工启动新 specs(`v32-p1b-sections.md` 或 `v32-p2-sections.md`)。

**M2.1 完工后 Demo 路径**:
1. 进 InterviewPage
2. Topbar 看到 **REC 红脉冲 + mm:ss 计时器**
3. Session meta strip:岗位 / **面试官 Sarah · 结构化** / X/Y 进度条
4. 我的回答卡录音时:**WaveBars 8 根 brand 色波动** + 底部 stat row(语速 / 填充词 / 用时)
5. 右 aside 第 3 张卡:**AI 实时观察**(brand-softer 底,文本 ≤30 字)
6. 右 aside 底部:`<kbd>Space</kbd> 完成回答` 三快捷键提示
7. 按 Esc 弹"结束面试?"确认弹窗
8. 上传 / 报告等待:**TipsCarousel 卡片 4-5s 切换**,完成时 0.4s "已完成 ✓"过渡

---

## V32.M2.1.X — 测试缺口修补(audit fix)

**Goal.** 2026-04-30 tester agent 独立审计 M2.1 5 节点测试质量,发现 **2 个 🔴 严重 + 7 个 🟡 中等 + 1 个 🟢 轻微** 共 10 个缺口。本节点统一修补,把 L0 红线(A9 后端 fillerWords 锁、A12 live_observation 教学语气)真正打实,把边界测试补齐到 spec 要求的水平。

**优先级背景**:M2.1 5 节点已 100% [x],但测试质量评分 6.5/10。M2.2 启动前必须把 G2 + G3 这 2 条 🔴 修掉(L0 红线伪装通过);其余 7 个 🟡 一并补,只有 G8 + G10(🟢)允许后续补。

**Files (new):**
- `apps/api/tests/agents/test_filler_words_lock.py` — G3 修补:后端 `FILLER_WORDS_CN` 锁(7 词、内容、长度,与前端镜像一致)
- `apps/api/tests/agents/test_legacy_schema_fields.py` — G9 修补:A10 schema 只增不改专项守护(`pass_probability` / `next_actions: list[str]` / `Verdict` / 老 `RoundReview` / 老 `InterviewStyle` 枚举仍存在)
- `apps/api/tests/orchestrator/test_bootstrap_force_none.py` — G1 修补:turn 0 时 runtime force-None 路径(mock LLM 输出非 None,断言 event 出来仍是 None)
- `apps/desktop/src/__tests__/LiveObservationCard.test.tsx` — G7 修补:A13 双轨 fallback 路径(text=null 时渲染 fallback;text 与 fallback 都 null 时渲染空态)
- `apps/desktop/src/__tests__/InterviewPageRefactor.test.tsx` — G10 smoke 测试(降级版,只测 RecBadge 渲染 mm:ss 格式 + WaveBars 8 根条带 + SessionMetaStrip 三段 + RecentRounds 不超过 3 条)

**Files (modify — 修测试,不动产品代码):**
- `apps/api/tests/agents/test_live_observation.py` — **G2 修补(🔴 关键)**:
  - 删除 `test_prompt_template_violating_samples_match_judgmental_regex` 这条**自证循环**测试
  - 改注释明确"runtime 没有 regex 扫,只有 prompt 教学示例"
  - 新增 `test_prompt_template_contains_dont_examples`(锁定 prompt 文本里的 do/don't 示例存在,不假装 runtime 扫)
- `apps/desktop/src/__tests__/useTurnStats.test.ts` — G4 修补:补 wpm=100 / wpm=200 精确边界用例
- `apps/desktop/src/__tests__/TipsCarousel.test.tsx` — G5 + G6 修补:
  - G5:`advanceTimersByTime(350)` 后断言 `onCompleted` 尚未被调用(lower bound 锁)
  - G6:用默认 `intervalMs=4500` 实测自动切换(锁住 spec "4-5s")
- `apps/desktop/src/__tests__/useGlobalKeymap.test.ts` — G8 修补:补 contentEditable focus Space 不响应

**Files (NOT modified — 严格不动产品代码):**
- 严禁修改任何 `app/**/*.py`(后端业务代码)
- 严禁修改任何 `apps/desktop/src/**` 下的非测试文件(组件 / hook / lib 实现)
- 本节点**只补测试**,不改产品行为

**Key Interfaces.**

### G3:后端 fillerWords 锁

```python
# apps/api/tests/agents/test_filler_words_lock.py
"""
L0 A9 — 后端 fillerWords 锁。

前端 apps/desktop/src/lib/fillerWords.ts 已有等价测试。本测试守护后端
constants.py 的 FILLER_WORDS_CN 不被静默修改,前后端一致。
"""
from app.agents.observer.constants import FILLER_WORDS_CN

EXPECTED = ("嗯", "呃", "那个", "就是", "这个", "反正", "然后然后")

def test_filler_words_length_is_7():
    assert len(FILLER_WORDS_CN) == 7

def test_filler_words_exact_content():
    assert tuple(FILLER_WORDS_CN) == EXPECTED

def test_filler_words_no_duplicates():
    assert len(set(FILLER_WORDS_CN)) == 7

def test_filler_words_matches_frontend():
    """双端镜像锁:任何修改后端 7 词也要同步前端,反之亦然.

    通过读 apps/desktop/src/lib/fillerWords.ts 用 regex 抽出前端列表,
    对比后端,不一致则 fail."""
    import re
    from pathlib import Path
    fe = Path(__file__).parent.parent.parent.parent / "desktop/src/lib/fillerWords.ts"
    text = fe.read_text(encoding="utf-8")
    # match: "嗯", "呃", ...
    found = tuple(re.findall(r'"([^"]+)"', text)[:7])
    assert found == EXPECTED, f"frontend fillerWords drifted: {found}"
```

### G9:A10 schema 只增不改守护

```python
# apps/api/tests/agents/test_legacy_schema_fields.py
"""L0 A10 — 数据契约只增不改专项守护."""
from app.schemas.reports import InterviewReportPayload
from app.models.enums import InterviewStyle, InterviewDirection

def test_legacy_pass_probability_field_retained():
    """老 pass_probability(0-100 int)字段必须保留作向后兼容."""
    fields = InterviewReportPayload.model_fields
    assert "pass_probability" in fields
    # 保留作 deprecated 但 schema 仍接受

def test_legacy_next_actions_list_str_retained():
    """老 next_actions: list[str] 字段保留(M1.5 加了 next_actions_v2: NextActions 并行)."""
    fields = InterviewReportPayload.model_fields
    assert "next_actions" in fields

def test_legacy_interview_style_enum_retained():
    """老 InterviewStyle 枚举(friendly_guided / standard_professional / high_pressure_followup)保留作兼容."""
    legacy_values = {m.value for m in InterviewStyle}
    assert "friendly_guided" in legacy_values
    assert "standard_professional" in legacy_values
    assert "high_pressure_followup" in legacy_values

def test_legacy_interview_direction_enum_retained():
    """老 InterviewDirection 枚举保留."""
    legacy_values = {m.value for m in InterviewDirection}
    assert "role_match" in legacy_values
    assert "project_deep_dive" in legacy_values
    assert "behavioral_comprehensive" in legacy_values
```

### G1:bootstrap turn 0 force-None 守护

```python
# apps/api/tests/orchestrator/test_bootstrap_force_none.py
"""G1 修补 — turn 0 时 runtime 即使 LLM 给出 live_observation,
也强制覆盖为 None(spec A12)."""
import pytest
from unittest.mock import AsyncMock, MagicMock
from app.orchestrator.runtime import SessionRuntime

@pytest.mark.asyncio
async def test_bootstrap_turn_0_forces_live_observation_to_none(...):
    """LLM 在 turn 0 输出非 None 的 live_observation 时,
    runtime 必须强制覆盖为 None(因为 turn 0 没有上一轮可观察)."""
    # mock InterviewerAgentService.run 返回 live_observation="不应该出现"
    # 调 bootstrap_first_question
    # 断言 emit 出去的 NextQuestion event 中 live_observation is None
    pass  # 完整实现见 spec
```

### G2:删除自证循环测试,改 prompt 文本检查

```python
# apps/api/tests/agents/test_live_observation.py
# 删除原来的 test_prompt_template_violating_samples_match_judgmental_regex
# 改为:

def test_prompt_template_contains_donts():
    """A12 教学语气护栏:prompt 模板里必须有 don't 示例,
    告诉 LLM '你回答得很差' 这类是违规的.

    注意:runtime 没有 regex 扫描,只靠 prompt 教学.LLM 偶尔违规
    会逃过 runtime 拦截,这是已知 trade-off(避免 false positive)."""
    from pathlib import Path
    prompt_path = Path(__file__).parent.parent.parent / "app/prompts/interviewer/system.j2"
    text = prompt_path.read_text(encoding="utf-8")
    # 必须含 don't 示例(评判式样例)
    assert "你回答得很差" in text or "don't" in text.lower(), "prompt 缺 don't 示例"
    # 必须含 do 示例(教学式样例)
    assert "结构清晰" in text, "prompt 缺 do 示例"
```

### G4 / G5 / G6 / G7 / G8 / G10

详细写法见 [tester audit report](../logs/) 第四节缺口清单。每条 ≤ 20 行测试代码。

**Acceptance** (从 `apps/api/` 跑后端 + `apps/desktop/` 跑前端):

```bash
# 1. 后端新增 3 个测试文件全过
cd apps/api
unset VIRTUAL_ENV
uv run python -m pytest tests/agents/test_filler_words_lock.py -v
uv run python -m pytest tests/agents/test_legacy_schema_fields.py -v
uv run python -m pytest tests/orchestrator/test_bootstrap_force_none.py -v
# 期望:test_filler_words_lock 4 passed / test_legacy_schema_fields 4 passed / test_bootstrap_force_none ≥ 1 passed

# 2. 后端 G2 修复
uv run python -m pytest tests/agents/test_live_observation.py -v
# 期望:test_prompt_template_violating_samples_match_judgmental_regex 不存在;test_prompt_template_contains_donts 通过

# 3. 后端全量回归
uv run python -m pytest -q
# 期望:265+ passed(257 + ~8 新)

# 4. 前端补的边界测试 + 新文件
cd ../desktop
corepack pnpm test -- --run
# 期望:35+ passed(26 + 9 新)

# 5. 前后端 fillerWords 一致性手验
diff <(grep -oE '"[^"]{1,3}"' src/lib/fillerWords.ts | head -7) \
     <(grep -oE '"[^"]{1,3}"' ../api/app/agents/observer/constants.py | head -7)
# 应无差异

# 6. tsc + lint + lint:design-tokens
corepack pnpm exec tsc --noEmit
corepack pnpm lint
corepack pnpm lint:design-tokens
```

**Commit.** `test(audit): fix 10 test gaps from M2.1 quality audit`

提交 body 必须包含:
- 10 个缺口逐项修补说明(列出 G1-G10,每条 1-2 行)
- 严重缺口 G2 + G3 修补的细节说明(尤其 G2 — 明确"runtime 无 regex 扫,prompt-only,这是 trade-off")
- 测试套总数变化(后端 257→265+ / 前端 26→35+)
- 不动产品代码声明(只补测试)

---

## P1/M2.1 + audit-fix 完工后

完成 V32.M2.1.X 后,M2.1 batch 完整收尾(5 主节点 + 1 audit 节点共 6 commits + N marker commits)。

---

# P1/M2.2 — 解析体验扩展(F-301 ~ F-305,4 节点)

> 2026-04-30 M2.1 audit-fix 完工后启动。把 v3.1 的简陋 ParseResultCard(只有 4 类输出 + 平铺)扩展为 PRD v3.2 §6.1.4 完整的 ParsedPanel — 综合解析 7 类输出 + MatchDial SVG 圆环 + 上传卡元数据 + 进度指示器 + 建议侧重(可编辑)+ 解析态元信息(由 AI 于 N 秒前生成)。

## Execution order

| # | Section | Deps | Commit prefix |
|---|---|---|---|
| 1 | **V32.M2.2.1 F-301 后端 ParseResult schema 扩展** | — | `feat(F-301): extend ParseResult with match_score + profile_summary + advantages/gaps + interview_focus + project_hooks` |
| 2 | **V32.M2.2.2 F-303 上传卡元数据 + F-304 进度指示器** | M2.1.X done | `feat(F-303,F-304): UploadCard meta chips + 3-step progress indicator` |
| 3 | **V32.M2.2.3 F-302 建议面试侧重(可编辑)+ F-305 解析态元信息** | M2.2.1 | `feat(F-302,F-305): editable InterviewFocus cards + parsed-at meta with re-parse button` |
| 4 | **V32.M2.2.4 ParsedPanel 整页重构 + 子组件** | M2.2.1, M2.2.2, M2.2.3 | `feat(ui): ParsedPanel full layout — MatchDial / StrengthGapList / FocusCards / TipsCarousel integration` |

---

## V32.M2.2.1 — F-301 后端 ParseResult schema 扩展

**Goal.** 把 ParseAgent 输出从 v3.1 的 5 类(job_requirements / candidate_highlights / candidate_risks / project_hooks / match_summary)扩展为 PRD v3.2 §5.1 / §8.2 的 7 类完整输出。

**Files (new):**
- `apps/api/tests/agents/test_parse_v32_extended.py` — 边界:match_score 0/100/-1/101 / level 推导 / interview_focus 长度 2-3 / direction_id 6 枚举 / project_hooks 1-2 / advantages 与 gaps 各 3-5 条

**Files (modify):**
- `apps/api/app/agents/parse/schemas.py` — `ParseAgentOutput` 加新字段(老字段保留,L0 A10)
- `apps/api/app/schemas/parse.py` — `ParseResultPayload` 同步;新增子 schema(MatchScore, MatchAdvantage, Gap, InterviewFocus, ProjectHook)
- `apps/api/app/prompts/parse/system.j2` — Prompt 重写,要求输出 7 类
- `apps/api/app/agents/parse/service.py` — Instructor retry / fallback(降级保底 2-3 条 advantages/gaps,避免 LLM 输出不足)
- `packages/shared-types/src/index.ts` — 同步类型

**Files (NOT modified):**
- 不删老字段(L0 A10)— `match_summary` 保留作 deprecated
- 不动 Framework Agent(M2.2.1 范围只到 ParseResult,Framework 在后续节点扩 PredictedQuestionBank 时改)

**Key Interfaces.**

```python
# apps/api/app/schemas/parse.py
from typing import Literal
from pydantic import BaseModel, Field

class MatchScore(BaseModel):
    """整体匹配度评分(F-301)."""
    score: int = Field(ge=0, le=100)
    level: Literal["LOW", "MID", "HIGH"]
    one_line: str = Field(max_length=80)  # 一句解读

class MatchAdvantage(BaseModel):
    label: str = Field(max_length=30)
    tag: Literal["强匹配", "匹配"]
    evidence: str = Field(max_length=200)  # 来自简历的依据片段

class Gap(BaseModel):
    label: str = Field(max_length=30)
    tag: Literal["需补充", "待评估"]
    evidence: str = Field(max_length=200)

class InterviewFocus(BaseModel):
    direction_id: Literal[
        "ai-insight", "data-driven", "cross-func",
        "zero-to-one", "user-research", "strategy",
    ]
    priority: Literal["high", "mid", "low"]
    title: str = Field(max_length=30)
    description: str = Field(max_length=120)

class ProjectHook(BaseModel):
    name: str = Field(max_length=50)
    why: str = Field(max_length=120)  # 为什么作为主打项目

class CandidateProfile(BaseModel):
    """v3.2 新结构:角色 / 年限 / 公司 / 方向标签."""
    role: str = Field(max_length=40)
    years: int = Field(ge=0, le=60)
    companies: list[str] = Field(default_factory=list, max_length=10)
    domain_tags: list[str] = Field(default_factory=list, max_length=10)

# ParseResultPayload 扩展(老字段全保留)
class ParseResultPayload(SchemaModel):
    # ===== 老字段保留(L0 A10)=====
    job_requirements: list[str] = Field(default_factory=list)  # v3.1 简单 list
    candidate_highlights: list[str] = Field(default_factory=list)
    candidate_risks: list[str] = Field(default_factory=list)
    match_summary: str | None = None  # v3.1 单条 deprecated

    # ===== v3.2 新增 =====
    candidate_profile: CandidateProfile | None = None
    match_score: MatchScore | None = None
    profile_summary: str | None = Field(default=None, max_length=300)  # 2-3 句 AI 画像摘要
    match_advantages: list[MatchAdvantage] = Field(default_factory=list, max_length=5)
    gaps: list[Gap] = Field(default_factory=list, max_length=5)
    interview_focus: list[InterviewFocus] = Field(default_factory=list, min_length=0, max_length=3)
    project_hooks: list[ProjectHook] = Field(default_factory=list, min_length=0, max_length=2)
```

**降级路径**:
- LLM 输出 `match_score` 缺失 → service 层根据 `len(advantages) - len(gaps)` 粗估(≥2 → MID 65, ≥0 → LOW 50, <0 → LOW 40)
- LLM 输出 `interview_focus` 长度 < 2 → Instructor retry 1 次 → 仍失败 fallback 默认 2 个方向("cross-func" + "zero-to-one")
- 其他字段不强制存在,默认 [] / None

**测试设计**:

```python
# apps/api/tests/agents/test_parse_v32_extended.py
import pytest
from pydantic import ValidationError
from app.schemas.parse import (
    MatchScore, MatchAdvantage, Gap, InterviewFocus, ProjectHook, ParseResultPayload,
)

# match_score 边界
@pytest.mark.parametrize("score,level", [(0, "LOW"), (59, "LOW"), (60, "MID"), (75, "MID"), (76, "HIGH"), (100, "HIGH")])
def test_match_score_level_alignment(score, level):
    """level 与 score 区间对齐(< 60 LOW / 60-75 MID / >= 76 HIGH)."""
    ms = MatchScore(score=score, level=level, one_line="x")
    assert ms.level == level

def test_match_score_out_of_range_rejected():
    for invalid in [-1, 101]:
        with pytest.raises(ValidationError):
            MatchScore(score=invalid, level="LOW", one_line="x")

# direction_id 6 枚举锁
@pytest.mark.parametrize("did", ["ai-insight", "data-driven", "cross-func", "zero-to-one", "user-research", "strategy"])
def test_interview_focus_direction_id_valid(did):
    f = InterviewFocus(direction_id=did, priority="high", title="x", description="y")
    assert f.direction_id == did

def test_interview_focus_alien_direction_id_rejected():
    with pytest.raises(ValidationError):
        InterviewFocus(direction_id="legacy_role_match", priority="high", title="x", description="y")

# interview_focus 长度边界
def test_interview_focus_3_items_ok():
    payload = ParseResultPayload(
        interview_focus=[
            InterviewFocus(direction_id="ai-insight", priority="high", title="t", description="d"),
            InterviewFocus(direction_id="data-driven", priority="mid", title="t", description="d"),
            InterviewFocus(direction_id="cross-func", priority="low", title="t", description="d"),
        ],
    )
    assert len(payload.interview_focus) == 3

def test_interview_focus_4_items_rejected():
    with pytest.raises(ValidationError, match="max_length"):
        ParseResultPayload(
            interview_focus=[
                InterviewFocus(direction_id=did, priority="mid", title="t", description="d")
                for did in ["ai-insight", "data-driven", "cross-func", "zero-to-one"]
            ],
        )

# advantages / gaps 长度上界
def test_advantages_5_max():
    payload = ParseResultPayload(match_advantages=[
        MatchAdvantage(label=f"l{i}", tag="匹配", evidence="e") for i in range(5)
    ])
    assert len(payload.match_advantages) == 5

def test_advantages_6_rejected():
    with pytest.raises(ValidationError, match="max_length"):
        ParseResultPayload(match_advantages=[
            MatchAdvantage(label=f"l{i}", tag="匹配", evidence="e") for i in range(6)
        ])

# tag enum 锁
def test_match_advantage_alien_tag_rejected():
    with pytest.raises(ValidationError):
        MatchAdvantage(label="x", tag="一般", evidence="y")  # 只允许"强匹配"/"匹配"

def test_gap_alien_tag_rejected():
    with pytest.raises(ValidationError):
        Gap(label="x", tag="不行", evidence="y")  # 只允许"需补充"/"待评估"

# 老字段保留(向后兼容)
def test_legacy_match_summary_field_retained():
    """老 match_summary 字段必须保留作向后兼容(L0 A10)."""
    fields = ParseResultPayload.model_fields
    assert "match_summary" in fields
    assert "job_requirements" in fields
    assert "candidate_highlights" in fields
    assert "candidate_risks" in fields
```

**Acceptance** (从 `apps/api/` 跑):

```bash
unset VIRTUAL_ENV
uv run python -m pytest tests/agents/test_parse_v32_extended.py -v
# 应 ≥ 12 passed

uv run python -m pytest -q
# 全量 270+ passed(269 + 12 新)

cd ../desktop
corepack pnpm exec tsc --noEmit  # shared-types 同步后类型 clean
```

**Commit.** `feat(F-301): extend ParseResult with match_score + profile_summary + advantages/gaps + interview_focus + project_hooks`

提交 body 必须含:
- 老字段保留清单(L0 A10)
- 新增 7 个子 schema 类
- LLM 降级路径(match_score 缺失推导 / interview_focus 长度不足 retry)
- 测试输出末尾 N passed

---

## V32.M2.2.2 — F-303 上传卡元数据 + F-304 进度指示器

**Goal.** UploadCard "done" 状态显示元数据 chips(角色·年限 / 公司 / 方向标签 for 简历;公司·岗位 / 方向 / 地点 for JD)+ 文件大小、页数/字数 mono;每页顶部加 eyebrow 进度指示器"第 X 步 · 共 3 步"(F-304)。

**Files (new):**
- `apps/desktop/src/components/PageStepIndicator.tsx` — 复用组件:eyebrow + "第 X 步 · 共 3 步"

**Files (modify):**
- `apps/desktop/src/pages/upload/UploadCard.tsx`(若已有)或 `ParseResultCard.tsx` — done 状态加 chips 行(读 ParseResult.candidate_profile / job_profile)+ meta 行(`· 428 KB · 4 页` mono 字体)
- `apps/desktop/src/pages/UploadPage.tsx` — 顶部加 `<PageStepIndicator step={1} />` (eyebrow "第 1 步 · 共 3 步")
- `apps/desktop/src/pages/ConfigPage.tsx` — 顶部加 step={2}
- `apps/desktop/src/pages/InterviewPage.tsx` — Session meta strip 之前加 step={3}(若 PRD §3.1 不要求实时面试页显示则跳过 — 取决于实测,默认加上,后续可拆)
- `apps/desktop/src/__tests__/PageStepIndicator.test.tsx` — 3 个 step 渲染对应文案

**Key Interfaces.**

```typescript
// PageStepIndicator.tsx
interface Props {
  step: 1 | 2 | 3
}

const STEP_LABELS = {
  1: "上传与解析",
  2: "面试配置",
  3: "实时面试",
} as const

export function PageStepIndicator({ step }: Props) {
  return (
    <div className="eyebrow" style={{ marginBottom: 4 }}>
      第 {step} 步 · 共 3 步 · {STEP_LABELS[step]}
    </div>
  )
}
```

**Acceptance:**

```bash
cd apps/desktop
corepack pnpm test src/__tests__/PageStepIndicator.test.tsx -- --run
# 3+ passed

corepack pnpm exec tsc --noEmit
corepack pnpm lint
corepack pnpm lint:design-tokens
```

**Commit.** `feat(F-303,F-304): UploadCard meta chips + 3-step progress indicator`

---

## V32.M2.2.3 — F-302 建议面试侧重(可编辑)+ F-305 解析态元信息

**Goal.**
- F-302:ParsedPanel 底部"建议面试侧重"区域,3 张 InterviewFocus 卡片可点击切换"选中态",选中数据通过 store 传到 ConfigPage 自动预选 directions(联动)
- F-305:ParsedPanel 头部加"由 Eatit AI · 于 N 秒前生成" mono 灰文 + "重新解析" ghost button

**Files (new):**
- `apps/desktop/src/pages/upload/FocusCard.tsx` — 单张 InterviewFocus 卡片(选中态边框变 brand)
- `apps/desktop/src/pages/upload/ParsedMetaBar.tsx` — 头部"由 AI · N 秒前生成 + 重新解析"
- `apps/desktop/src/lib/relativeTime.ts` — 工具函数(N 秒前 / N 分钟前 / N 小时前)
- `apps/desktop/src/__tests__/relativeTime.test.ts` — 边界(0/30/60/3600/86400 秒)
- `apps/desktop/src/__tests__/FocusCard.test.tsx` — 选中态切换 + 联动 store

**Files (modify):**
- `apps/desktop/src/stores/app-store.ts` — 加 `selectedFocusIds: string[]`(用户选中的 InterviewFocus.direction_id)+ `setSelectedFocusIds()` action
- `apps/desktop/src/pages/ConfigPage.tsx` — useStore 取 selectedFocusIds,初始化 directions = selectedFocusIds(2-3 个);用户在 ConfigPage 仍可改

**Key Interfaces.**

```typescript
// relativeTime.ts
export function formatRelativeTime(timestamp: Date | string | number): string {
  const ms = Date.now() - new Date(timestamp).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 5) return "刚刚"
  if (sec < 60) return `${sec} 秒前`
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前`
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小时前`
  return `${Math.floor(sec / 86400)} 天前`
}

// FocusCard.tsx
interface Props {
  focus: InterviewFocus  // direction_id / priority / title / description
  selected: boolean
  onToggle: () => void
}

export function FocusCard({ focus, selected, onToggle }: Props) {
  const priorityClass = focus.priority === "high" ? "tag-warn" : "tag-line"
  const priorityLabel = focus.priority === "high" ? "高优先级" : focus.priority === "mid" ? "中优先级" : "低优先级"
  return (
    <button
      onClick={onToggle}
      className={`card ${selected ? "selected" : ""}`}
      style={{ padding: "14px 16px", borderColor: selected ? "var(--brand)" : "var(--line)", background: selected ? "var(--brand-softer)" : "var(--bg-warm)", borderRadius: "var(--r-md)" }}
    >
      <div className="row between" style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{focus.title}</span>
        <span className={`tag ${priorityClass}`} style={{ fontSize: 10.5 }}>{priorityLabel}</span>
      </div>
      <div className="muted" style={{ fontSize: 12.5 }}>{focus.description}</div>
    </button>
  )
}
```

**Acceptance:**

```bash
cd apps/desktop
corepack pnpm test -- --run
# 全量 ≥ 50 passed(46 + 4 新)

corepack pnpm exec tsc --noEmit
corepack pnpm lint
corepack pnpm lint:design-tokens
```

**Commit.** `feat(F-302,F-305): editable InterviewFocus cards + parsed-at meta with re-parse button`

---

## V32.M2.2.4 — ParsedPanel 整页重构

**Goal.** PRD v3.2 §6.1.4 — 把 v3.1 简陋 ParseResultCard 替换为完整 ParsedPanel:头部(F-305 已 done)+ MatchDial + AI 画像摘要 + StrengthGapList 双栏 + InterviewFocus 三列(M2.2.3 已 done)+ 底部 CTA。同时把 M2.1.4 落地的 TipsCarousel 接入 parse_in_progress 状态。

**Files (new):**
- `apps/desktop/src/pages/upload/MatchDial.tsx` — SVG 圆环(160×160, R=52, strokeWidth=8;数字 serif 42px;LOW/MID/HIGH mono 标签)
- `apps/desktop/src/pages/upload/StrengthGapList.tsx` — 双栏(优势 brand-soft + 差距 warn-soft);每条 row(label + tag)
- `apps/desktop/src/pages/upload/ParsedPanel.tsx` — 顶级容器,集成 MatchDial / 摘要 / StrengthGapList / FocusCard 网格 / 底部 CTA
- `apps/desktop/src/__tests__/MatchDial.test.tsx` — score 0/50/78/100 渲染检查;LOW/MID/HIGH 标签
- `apps/desktop/src/__tests__/StrengthGapList.test.tsx` — 优势/差距 column 分别渲染 + 空态

**Files (modify):**
- `apps/desktop/src/pages/UploadPage.tsx` — 完整接入 ParsedPanel,parse_in_progress 显示 TipsCarousel(540px)而非简陋 shimmer

**Files (delete after grep):**
- `apps/desktop/src/pages/upload/ParseResultCard.tsx`(老组件)— 若 grep 0 引用则删

**Key Interfaces.**

```typescript
// MatchDial.tsx
interface Props { score: number; level: "LOW" | "MID" | "HIGH" }

export function MatchDial({ score, level }: Props) {
  const R = 52
  const C = 2 * Math.PI * R
  const offset = C * (1 - score / 100)
  return (
    <div style={{ position: "relative", width: 160, height: 160, margin: "12px auto 4px" }}>
      <svg width="160" height="160" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={R} stroke="var(--line)" strokeWidth="8" fill="none" />
        <circle cx="70" cy="70" r={R} stroke="var(--brand)" strokeWidth="8" fill="none"
          strokeDasharray={C} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 70 70)" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <div style={{ fontFamily: "var(--f-serif)", fontSize: 42, lineHeight: 1, color: "var(--ink-900)" }}>
            {score}<span style={{ fontSize: 16, color: "var(--ink-500)" }}> / 100</span>
          </div>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--brand)", marginTop: 8, letterSpacing: "0.08em" }}>
            MATCH · {level}
          </div>
        </div>
      </div>
    </div>
  )
}

// ParsedPanel.tsx 整体结构(伪代码)
function ParsedPanel({ payload }: { payload: ParseResultPayload }) {
  return (
    <div className="card">
      <ParsedMetaBar generatedAt={payload.generated_at} onReparse={...} />  {/* M2.2.3 */}
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr" }}>
        <div style={{ padding: "28px", borderRight: "1px solid var(--line)" }}>
          <div className="eyebrow">整体匹配度</div>
          {payload.match_score && <MatchDial {...payload.match_score} />}
          <div className="muted">{payload.match_score?.one_line}</div>
        </div>
        <div style={{ padding: "28px 32px" }}>
          <div className="eyebrow">AI 画像摘要</div>
          <p style={{ fontFamily: "var(--f-serif)", fontSize: 19 }}>{payload.profile_summary}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <StrengthGapList title="匹配优势" items={payload.match_advantages} tint="green" />
            <StrengthGapList title="潜在差距" items={payload.gaps} tint="warn" />
          </div>
        </div>
      </div>
      <hr className="divider" />
      <div style={{ padding: "22px 28px" }}>
        <div className="row between">
          <h3 className="h3">建议面试侧重</h3>
          <span className="tag tag-line">可编辑</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {payload.interview_focus.map(f => <FocusCard key={f.direction_id} focus={f} ... />)}
        </div>
        <div className="row between" style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
          <div className="muted">解析结果仅作为 AI 面试官出题参考...</div>
          <button className="btn btn-brand btn-lg">进入面试配置 →</button>
        </div>
      </div>
    </div>
  )
}
```

**Acceptance:**

```bash
cd apps/desktop

# 新组件存在
test -f src/pages/upload/MatchDial.tsx
test -f src/pages/upload/StrengthGapList.tsx
test -f src/pages/upload/ParsedPanel.tsx

# 老组件已删
test ! -f src/pages/upload/ParseResultCard.tsx

# Vitest
corepack pnpm test -- --run
# 全量 ≥ 56 passed(50 + 6 新)

corepack pnpm exec tsc --noEmit
corepack pnpm lint
corepack pnpm lint:design-tokens
corepack pnpm build
```

**Commit.** `feat(ui): ParsedPanel full layout — MatchDial / StrengthGapList / FocusCards / TipsCarousel integration`

提交 body 必须含:
- 删除老 ParseResultCard.tsx 声明(grep 验证 0 引用)
- 接入 M2.1.4 落地的 TipsCarousel(parse_in_progress 状态显示 540px 卡片)
- 接入 M2.2.3 落地的 FocusCard 联动(选中态 + store)
- 视觉对照 page-upload.jsx 原型

---

## P1/M2.2 完工后

完成 4 节点后,M2 总进度:M2.1(5 主 + 1 audit)+ M2.2(4 节点)= 10 节点。剩 M2.3(F-320 / F-321 老板新需求,~5 节点)由人工启动新 spec(`v32-p1c-sections.md` 或同文件追加)。

---

## V32.M2.2.X — M2.2 audit-fix(测试质量审计后修补)

**Goal.** 2026-04-30 tester agent 独立审计 M2.2 4 个节点,评分 5.5/10。发现:

- 🔴 **F-303 UploadCard metadata chips 完全未实现** — Ralph 在 M2.2.2 commit body 自报实现,但 DropZone.tsx done 状态只显示文件名,完全没有 candidate_profile chips / 文件元信息;**M2.2.2 commit 实际只做了 F-304 PageStepIndicator 一部分**
- 🔴 **MatchScore level-score 无 cross-field validator** — `MatchScore(score=10, level="HIGH")` 静默通过 Pydantic,UI 会渲染数字与标签矛盾的脏数据
- 🔴 (随 #1)F-303 无任何测试覆盖
- 🟡 service.py 的 `_derive_match_score` + `_DEFAULT_INTERVIEW_FOCUS` 两个 fallback 路径**零集成测试**
- 🟡 `ConfigPage.tsx:110-117` `seededFromFocus = useRef(false)` 是组件实例级 ref,组件卸载后重置,导致用户手改 directions → 返回 UploadPage → 再进 ConfigPage 时被反复覆盖(UX bug)
- 🟡 ParsedPanel 整页无集成测试(子组件测试无法覆盖整页逻辑如"match_score=null 不渲染 MatchDial")
- 🟡 ParsedMetaBar 相对时间不刷新(组件挂载时算出后静止)
- 🟢 interview_focus fallback 实际只做 fallback 没做 Instructor retry(spec 偏差,推到后续节点)

本节点统一修补 🔴+🟡 共 7 个缺口(🟢 推迟)。原则:**只补/改测试 + 实现明确缺失的功能,不大改产品行为**。

**Files (modify — 实现真功能):**
- `apps/desktop/src/pages/upload/DropZone.tsx`(或新建 `UploadCard.tsx` 替换之)— done 状态接 ParseResult,渲染:
  - candidate_profile chips:`{role}·{years} 年` + companies join + domain_tags(简历)
  - jd 侧:岗位标题 chips(若 JdProfile 存在,M2.2.1 已落地的 schema 内)
  - 文件元信息:`· {sizeKB} KB · {pages} 页` 或 `· {sizeKB} KB · {wordCount} 字`(mono 字体)
- `apps/api/app/schemas/parse.py` — `MatchScore` 加 `@model_validator(mode="after")`:
  ```python
  @model_validator(mode="after")
  def _validate_score_level_alignment(self) -> "MatchScore":
      if self.score < 60 and self.level != "LOW":
          raise ValueError(f"score {self.score} < 60 must be LOW, got {self.level}")
      if 60 <= self.score < 76 and self.level != "MID":
          raise ValueError(f"score {self.score} in [60,76) must be MID, got {self.level}")
      if self.score >= 76 and self.level != "HIGH":
          raise ValueError(f"score {self.score} >= 76 must be HIGH, got {self.level}")
      return self
  ```
- `apps/desktop/src/pages/ConfigPage.tsx`(L110-117)— 把 `seededFromFocus = useRef(false)` 改为读 store 的 `hasSyncedFocusToConfig: boolean`:
  - app-store.ts 加 `hasSyncedFocusToConfig: boolean` + `markFocusSyncedToConfig()` action
  - patchUpload 触发新 parse 时 `hasSyncedFocusToConfig = false`(允许下次 ConfigPage mount 重新 seed)
  - 用户手改 directions(任何 patchConfig)时 `hasSyncedFocusToConfig = true`(锁定不再覆盖)
- `apps/desktop/src/pages/upload/ParsedMetaBar.tsx` — 加 `useEffect(() => setInterval(rerender, 60_000))` 每 60s rerender 一次刷新相对时间

**Files (modify — 修测试):**
- `apps/api/tests/agents/test_parse_v32_extended.py` — 加 1 个反向 case:`MatchScore(score=10, level="HIGH")` 应抛 `ValidationError`;再加一组同样反向 cases(score=80 但 level=LOW 等)

**Files (new — 补缺失测试):**
- `apps/api/tests/agents/test_parse_service_fallback.py` — 用 `ScriptedGateway` mock 2 个集成场景:
  - LLM 输出不含 `match_score` 字段 → service 返回结果含 `_derive_match_score` 结果(基于 advantages_n / gaps_n delta)
  - LLM 输出 `interview_focus=[]` → service 返回结果 `interview_focus = _DEFAULT_INTERVIEW_FOCUS`(2 项)
- `apps/desktop/src/__tests__/ParsedPanel.test.tsx` — 至少 3 个 case:
  - `match_score=null` 时不渲染 MatchDial
  - `interview_focus=[]` 时显示占位文案("AI 暂未识别推荐方向")
  - 点击"进入面试配置"按钮触发 onContinue 回调
- `apps/desktop/src/__tests__/ConfigPage.focusSync.test.tsx` — 新建:
  - 模拟 selectedFocusIds=[a,b],ConfigPage mount → directions 自动初始化为 [a,b],hasSyncedFocusToConfig=true
  - 用户手改 directions=[c],unmount,然后 remount → directions 仍为 [c](不被覆盖)
  - 模拟新一轮 parse(patchUpload),hasSyncedFocusToConfig 重置为 false → 下次 ConfigPage mount 时重新 seed

**Files (NOT modified — 严格不动):**
- M2.2.1-4 已 commit 的产品代码(除 ConfigPage 的 seededFromFocus 那一处必须改的)
- 任何老 schema 字段(L0 A10)
- LangGraph turn_graph 节点(L0 A7)
- 4 个 InterviewerPersona 名 + 5 个 Dimension name(L0 A6/A8)

**Acceptance** (从 `apps/api/` 跑后端 + `apps/desktop/` 跑前端):

```bash
# 1. F-303 UploadCard metadata chips 实现验证
cd apps/desktop
grep -E "candidate_profile|domain_tags|companies\.join" src/pages/upload/  # 应有命中
corepack pnpm build  # vite build 成功

# 2. MatchScore validator 反向测试
cd ../api
unset VIRTUAL_ENV
uv run python -m pytest tests/agents/test_parse_v32_extended.py::test_match_score_alien_level_rejected -v
# 应 passed(spec 加的反向 case)
uv run python -m pytest tests/agents/test_parse_v32_extended.py -v
# 全过(原 30+ 测试 + 新反向 case)

# 3. service fallback 集成测试
uv run python -m pytest tests/agents/test_parse_service_fallback.py -v
# 至少 2 passed

# 4. 后端全量回归(应 ≥ 302)
uv run python -m pytest -q
# 期望 302+ passed

# 5. 前端 ParsedPanel 集成测试
cd ../desktop
corepack pnpm test src/__tests__/ParsedPanel.test.tsx -- --run
# 3+ passed
corepack pnpm test src/__tests__/ConfigPage.focusSync.test.tsx -- --run
# 3+ passed

# 6. 前端全量回归(应 ≥ 80)
corepack pnpm test -- --run
# 期望 80+ passed

# 7. tsc + lint + lint:design-tokens
corepack pnpm exec tsc --noEmit
corepack pnpm lint
corepack pnpm lint:design-tokens

# 8. seededFromFocus 改 store 后,ConfigPage 编译/类型 OK
grep "hasSyncedFocusToConfig" src/stores/app-store.ts src/pages/ConfigPage.tsx
# 双端各 ≥ 1 命中
```

**Commit.** `test(audit): fix M2.2 audit gaps — F-303 chips + MatchScore validator + fallback tests + ConfigPage focus sync`

提交 body 必须含:
- 8 个缺口逐项修补说明
- 🔴 #1 F-303 metadata chips:实现 DropZone done 状态接 ParseResult,引用具体行号
- 🔴 #2 MatchScore validator:加 model_validator,引用 schema 行号
- 🟡 #3 service fallback:test_parse_service_fallback.py 两个 case
- 🟡 #4 ConfigPage seededFromFocus → store flag(hasSyncedFocusToConfig):patchUpload 重置 + patchConfig 锁定
- 🟡 #5 ParsedPanel 集成测试 3 case
- 🟡 #6 ParsedMetaBar 60s 自刷新
- 测试套总数变化(后端 299→302+ / 前端 74→80+)
- 不动 M2.2.1-4 已 commit 产品代码声明(除必须改的 ConfigPage)

PRD: PRD §6.1.4 ParsedPanel + §3.2 InterviewConfig 联动 + §0.1 L0 数据契约一致性
AGENTS.md: §6 红线 A10 数据契约只增不改 — MatchScore validator 是契约自洽,不破坏 schema

