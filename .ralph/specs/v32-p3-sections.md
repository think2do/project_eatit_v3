# v3.2+ P3/M4 Sections — 收口节点

**4 个节点 + 1 收尾文档同步**:F-315 配额 mock + 字体本地子集化 + Playwright 烟雾 E2E + locust 性能基线 + docs 同步。

按顺序执行:M4.1 → M4.2 → M4.3 → M4.4 → M4.X(可选,文档收尾)。

---

## V32.M4.1 — F-315 Sidebar 配额卡(纯前端 mock)

**Why**: PRD §0.4 商业化未定,但 Sidebar 缺一个"剩余次数"视觉占位,产品经理希望先有视觉锚,后期切真实计费时仅替换 quotaMock 模块即可。

**File List**:
- 新建:`apps/desktop/src/lib/quotaMock.ts`(read / increment / reset / getRemaining + localStorage 单 key 管理)
- 新建:`apps/desktop/src/components/SidebarQuotaCard.tsx`(brand-soft 卡 + "本月配额(占位) X / Y" + reset 链接 dev only)
- 修改:`apps/desktop/src/components/Sidebar.tsx`(在 SidebarFooter 内 BYOK 角标上方插入 `<SidebarQuotaCard />`)
- 新建测试:`apps/desktop/src/__tests__/quotaMock.test.ts`(≥ 4 条:首读默认值 / increment 累加 / reset 清零 / 跨月 resetAt 触发自动归零)
- 新建测试:`apps/desktop/src/__tests__/SidebarQuotaCard.test.tsx`(≥ 3 条:渲染默认 0/10 / mock localStorage 含 used=7 时显示 7/10 / 含"占位"或"mock"文案)

**Key Interfaces**:
```ts
// apps/desktop/src/lib/quotaMock.ts
const STORAGE_KEY = "eatit:quota:mock";
const DEFAULT_LIMIT = 10;

export interface QuotaMockState {
  used: number;
  limit: number;
  resetAt: string;  // ISO date,下月 1 号 00:00 UTC
}

export function readQuotaMock(): QuotaMockState;       // 含跨月自动归零
export function incrementQuotaMock(): QuotaMockState;  // used++ 并写回
export function resetQuotaMock(): QuotaMockState;      // dev only
export function getRemainingQuotaMock(): number;       // limit - used,clamp ≥ 0
```

**Visual spec**(参考 design-reference 的 brand-softer 卡):
- 容器:`brand-soft` 底,8px padding,12.5px font,3px gap
- 第一行:`var(--brand-ink)` 色 mono "本月配额(占位)"
- 第二行:serif 18px `{used}` + "/" + `{limit}` mono
- 第三行(仅当 used >= limit*0.7):tag-warn "近上限"
- 整张卡 click 不触发任何动作(纯展示)

**Acceptance**(从 `apps/desktop/` cwd 跑):
1. `corepack pnpm exec vitest run src/__tests__/quotaMock.test.ts` 4 条全过
2. `corepack pnpm exec vitest run src/__tests__/SidebarQuotaCard.test.tsx` 3 条全过
3. `corepack pnpm exec vitest run` 总数 160 → 167(+7)
4. `corepack pnpm exec tsc --noEmit` 0 错
5. `grep -rn "quota" ../api/app/ ../api/app/schemas/ ../api/app/api/` → 0 hit(后端零侵入)

**Commit**: `feat(F-315): SidebarQuotaCard with localStorage mock`

Body:
- 改动统计
- vitest 输出末尾 N passed
- F-315 行
- 备注 "L0 A18 enforced — backend untouched"

---

## V32.M4.2 — 字体本地子集化(woff2)

**Why**: PRD §性能 + AGENTS L0 隐性要求 — Tauri 启动不得依赖外网。当前 `index.css:1` 从 `fonts.googleapis.com` 加载 3 套字体,离线 / 网络抖动场景会导致页面 FOUT 或长白屏。

**File List**:
- 新建目录:`apps/desktop/public/fonts/`
- 新建:`apps/desktop/public/fonts/Inter-Regular.woff2`(latin + CJK punctuation,目标 ≤ 80 KB)
- 新建:`apps/desktop/public/fonts/Inter-Medium.woff2`
- 新建:`apps/desktop/public/fonts/Inter-Semibold.woff2`
- 新建:`apps/desktop/public/fonts/InstrumentSerif-Regular.woff2`(latin only,≤ 60 KB)
- 新建:`apps/desktop/public/fonts/JetBrainsMono-Regular.woff2`(latin only,≤ 50 KB)
- 新建:`apps/desktop/public/fonts/LICENSE-Inter.txt`(SIL OFL 1.1)
- 新建:`apps/desktop/public/fonts/LICENSE-InstrumentSerif.txt`(SIL OFL 1.1)
- 新建:`apps/desktop/public/fonts/LICENSE-JetBrainsMono.txt`(SIL OFL 1.1)
- 修改:`apps/desktop/src/index.css`(删第 1 行 `@import url(googleapis...)`,新增 5 个 `@font-face` 块在文件顶部)

**Key Interfaces** — `index.css` 顶部块替换:
```css
/* 原:@import url("https://fonts.googleapis.com/css2?..."); — 已删除 */

@font-face {
  font-family: "Inter";
  src: url("/fonts/Inter-Regular.woff2") format("woff2");
  font-weight: 400 450;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Inter";
  src: url("/fonts/Inter-Medium.woff2") format("woff2");
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Inter";
  src: url("/fonts/Inter-Semibold.woff2") format("woff2");
  font-weight: 600 700;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Instrument Serif";
  src: url("/fonts/InstrumentSerif-Regular.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "JetBrains Mono";
  src: url("/fonts/JetBrainsMono-Regular.woff2") format("woff2");
  font-weight: 400 500;
  font-style: normal;
  font-display: swap;
}
```

**Font 来源**(在节点内执行):
- Inter:从 `https://github.com/rsms/inter/releases/latest` 下载 woff2
- Instrument Serif:从 `https://github.com/Instrument/instrument-serif/releases` 下载
- JetBrains Mono:从 `https://github.com/JetBrains/JetBrainsMono/releases` 下载
- 子集化用 `npx pyftsubset --flavor=woff2`(若不可用,用 fontTools Python 包:`uv tool run --with fonttools pyftsubset`)
- 子集 unicode-range:`U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD,U+3000-303F`(latin + 常用 CJK 标点)

**Acceptance**(从 `apps/desktop/` cwd 跑):
1. `ls public/fonts/*.woff2` → 5 个文件,每个 size 在 spec 范围内(`du -h public/fonts/*.woff2`)
2. `grep -c "fonts.googleapis.com\|fonts.gstatic.com" src/index.css` → 0
3. `grep -c "@font-face" src/index.css` → 5
4. `corepack pnpm dev` 启动后,DevTools Network 面板**没有** googleapis 域请求(本节点不要求自动验证,人工确认即可,commit body 注明)
5. `corepack pnpm exec tsc --noEmit` 0 错
6. `corepack pnpm exec vitest run` 仍 167 passed(M4.1 已加 7)

**Commit**: `chore(perf): inline woff2 fonts, drop fonts.googleapis dependency`

Body:
- 5 个 woff2 文件大小列表
- 备注 "A19 enforced — no network font dependency"
- 若子集化失败 fallback 用全字体(注明大小)

---

## V32.M4.3 — Playwright 烟雾 E2E(2 个金标场景)

**Why**: 单元 + Vitest 覆盖了组件层,但**整链路**(上传→配置→面试→报告)从未跑过自动化烟雾。M4 引入 Playwright 极简骨架,2 个金标场景:Upload→Config skip path + Report 渲染。

**File List**:
- 新建:`apps/desktop/playwright.config.ts`(testDir = `tests/e2e`,baseURL `http://localhost:5173`,workers=1,timeout=30s)
- 新建目录:`apps/desktop/tests/e2e/`
- 新建:`apps/desktop/tests/e2e/upload-to-config.spec.ts`(场景 1:进上传页 → 选 mock 简历 + JD → 跳到 config 页 → 看到 4 风格 tile)
- 新建:`apps/desktop/tests/e2e/report-renders.spec.ts`(场景 2:用 mocked report API 直接进 /report → 看到 HeroScoreCard"中上"+ 维度卡 + 不出现 0-100 数字)
- 新建:`apps/desktop/tests/e2e/fixtures/mockApi.ts`(MSW-like setup,intercept fetch:GET /sessions/* /reports/* /reflections/* 全部返回 hardcoded fixture)
- 新建:`apps/desktop/tests/e2e/fixtures/parseResult.ts` + `interviewReport.ts`(JSON 文件,内容来自 schema 类型)
- 修改:`apps/desktop/package.json`(devDeps 加 `@playwright/test`;script 加 `"e2e": "playwright test"`)

**Key Interfaces** — `playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "corepack pnpm dev --port 5173",
    port: 5173,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
  },
});
```

**Key Interfaces** — `tests/e2e/report-renders.spec.ts`:
```ts
import { test, expect } from "@playwright/test";
import { mockReportApi } from "./fixtures/mockApi";

test("report 页渲染 HeroScoreCard + 维度卡(L0 A18 视觉护栏)", async ({ page }) => {
  await mockReportApi(page);
  await page.goto("/report?session=mock-session-1");
  await expect(page.getByText(/通过可能性/)).toBeVisible();
  await expect(page.getByText(/中上|中|中下/)).toBeVisible();
  // L0 A18:绝不能出现 0-100 通过率数字
  const banned = await page.locator('text=/(\\d{1,3})%/').count();
  expect(banned).toBe(0);
  // 5 维度名锁
  for (const dim of ["专业深度","结构化表达","批判性思考","业务直觉","沟通节奏"]) {
    await expect(page.getByText(dim)).toBeVisible();
  }
});
```

**Acceptance**(从 `apps/desktop/` cwd 跑):
1. `corepack pnpm add -D @playwright/test` 成功(若失败,用 npm 兜底)
2. `corepack pnpm exec playwright install chromium` 成功
3. `corepack pnpm exec playwright test --reporter=line` 2/2 passed,总时长 ≤ 60s
4. `corepack pnpm exec tsc --noEmit` 0 错
5. `corepack pnpm exec vitest run` 仍 167 passed(M4.1 加的 7 不变)
6. `cat playwright.config.ts | grep "headless: true"` → 1 hit

**降级路径**:
- 若 `playwright install` 在沙盒中网络受限,**节点跳过 install + test 步骤**,但 config / spec / fixture 必须落地。Commit body 注明"playwright install 待人工 `corepack pnpm exec playwright install` 后跑"
- 若 `webServer.command` 在 ralph 子进程中卡住,改用 `webServer: undefined`,要求 e2e 跑前手动 `pnpm dev`(写到 README)

**Commit**: `test(e2e): playwright smoke — upload-to-config + report-renders`

Body:
- 2 个 spec 文件大小
- A20 enforced(mock backend,无真 LLM)
- 备注是否完成 install(若网络阻塞)

---

## V32.M4.4 — locust 性能基线(parse 端点)

**Why**: PRD §性能 P95 目标(parse ≤15s / question ≤4s / report ≤30s / Coach ≤60s)从未本地实测。M4 落地 locust 极简骨架 + 1 个端点(parse)的 baseline 跑通脚本,后续可扩展。

**File List**:
- 新建目录:`apps/api/tests/perf/`
- 新建:`apps/api/tests/perf/__init__.py`(空)
- 新建:`apps/api/tests/perf/parse_baseline.py`(locust HttpUser,单一 task `/api/v1/sessions/parse`,使用 mock LLM 注入固定延迟)
- 新建:`apps/api/tests/perf/conftest_perf.py`(注入 mock LLM gateway 用 sleep 模拟 1.5s P50 / 8s P95)
- 新建:`apps/api/tests/perf/baseline.md`(占位,首次跑完后人工填数字)
- 新建:`apps/api/tests/perf/README.md`(本地跑命令 + CI 不跑说明)
- 修改:`apps/api/pyproject.toml`(`[dependency-groups.dev]` 加 `locust>=2.20`;若已存在 dev group 则 append)
- 修改:`pytest` 配置(`pyproject.toml` 或 `pytest.ini`)— 加 `norecursedirs = ["tests/perf"]` 防止 collect

**Key Interfaces** — `parse_baseline.py`:
```python
"""
本地跑:
  cd apps/api
  uv run locust -f tests/perf/parse_baseline.py --headless -u 5 -r 1 -t 60s --host http://localhost:8000

注意:
- 必须先启动 backend(uv run uvicorn app.main:app --port 8000)
- backend 必须用 mock LLM gateway(EATIT_LLM_BACKEND=mock)
- CI 不跑(详见 ../README.md)
"""
from locust import HttpUser, between, task

class ParseUser(HttpUser):
    wait_time = between(1, 3)
    
    @task
    def parse(self):
        with open("tests/fixtures/sample_resume.pdf", "rb") as f:
            resume = f.read()
        with open("tests/fixtures/sample_jd.txt", "rb") as f:
            jd = f.read()
        self.client.post(
            "/api/v1/sessions/parse",
            files={
                "resume": ("resume.pdf", resume, "application/pdf"),
                "jd": ("jd.txt", jd, "text/plain"),
            },
        )
```

**Key Interfaces** — `tests/perf/baseline.md`:
```markdown
# Eatit Performance Baseline

最近一次本地跑:`<未跑>`

| 端点 | P50 | P95 | P99 | RPS | failure rate |
|---|---|---|---|---|---|
| POST /api/v1/sessions/parse | TODO | TODO | TODO | TODO | TODO |

> 跑完后人工填,作为后续优化的对比锚。
> CI 不跑,只在本地用 `uv run locust -f tests/perf/parse_baseline.py ...` 触发。
```

**Acceptance**(从 `apps/api/` cwd 跑):
1. `uv add --dev "locust>=2.20"` 成功(写入 pyproject.toml)
2. `uv run python -c "from locust import HttpUser"` 0 错(import 通过)
3. `uv run pytest --collect-only 2>&1 | grep -c "tests/perf"` → 0(不被收集)
4. `uv run pytest -q` 仍 471 passed
5. `ls tests/perf/parse_baseline.py tests/perf/baseline.md tests/perf/README.md` → 3 个文件
6. `cat tests/perf/README.md | grep -c "CI 不跑"` → 1 hit
7. **不要**真的运行 locust(本节点只落骨架,实测留给人工)

**Commit**: `test(perf): locust scaffold — parse_baseline.py + baseline.md placeholder`

Body:
- A21 enforced(本地 only,CI 不跑)
- pytest collect 验证 0 perf cases
- 备注 "首次实测留给人工"

---

## V32.M4.X — M4 收尾文档同步(可选,如果 M4.1-M4.4 全过)

**Why**: M4 全部完成 = v3.3 全收尾。FEATURES 加一行 F-315,fix_plan 收尾 banner,STATUS 块给 EXIT_SIGNAL=true。

**File List**:
- 修改:`docs/FEATURES.md`(F-315 行 ⏳ pending → ✅ done + 本节点 commit hash;追加 v3.3 全部完成的 banner 行)
- 修改:`.ralph/fix_plan.md`(M4.1-M4.4 全 [x] + Completed 段;High Priority 留空 + 加"v3.3 全收尾"banner)

**Acceptance**:
1. `grep "F-315" docs/FEATURES.md` → ✅ done
2. `grep -c "^- \[ \]" .ralph/fix_plan.md` → 0(High Priority 全空)
3. `git status` 仅本节点 2 文件待 commit

**Commit**: `docs: M4 收口 — F-315 done + fix_plan v3.3 全收尾`

Body 含 EXIT_SIGNAL: true 提示。

---

## 节点顺序约束

```
M4.1 (F-315 quota mock)
  ↓
M4.2 (woff2 fonts)
  ↓
M4.3 (Playwright smoke)
  ↓
M4.4 (locust scaffold)
  ↓
M4.X (docs + 收尾,可选)
```

任一节点 fail 不要继续向后跑。

## 单循环超时预算(参考)

- M4.1 ≤ 12 min(纯前端 + 5 测试)
- M4.2 ≤ 18 min(下载字体 + 子集化网络依赖较重,可能超时,降级跑全字体)
- M4.3 ≤ 18 min(playwright install 体积大,易超时,降级路径已写入 spec)
- M4.4 ≤ 8 min(纯骨架,locust 不实跑)

每个节点单 commit;失败 1 节点不污染下一节点工作树。
