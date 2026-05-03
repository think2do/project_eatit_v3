# v3.4 macOS App Store Port — Hard Constraints

> **生效阶段**:M1(Xcode 工程脚手架)~ M7(Review 处理上架)全过程
> **PRD 权威**:[`eatit/docs/PRD/Eatit_PRD_v3_4_macos_appstore.md`](../../docs/PRD/Eatit_PRD_v3_4_macos_appstore.md) 第 9.2 / 9.3 节
> **仓库护栏**:[`AGENTS.md`](../../AGENTS.md) 第 6 节条款 13(总纲红线)+ 条款 1-12(继承)
>
> 这是 v3.4 重构期间所有 Ralph loop / subagent / 人工实施都不可违反的红线。任何节点的实施步骤一旦触发以下任一条款,**立即停下报告,不要继续**。

---

## A. 总纲红线(优先级 = MAX,违反任一即破坏 v3.4)

### A0 — Mac App Store 上架是不可妥协的最终交付定义(继承 PRD 9.2.17)

- **唯一交付定义**:v3.4 完成 = 应用通过 Mac App Store Review + 在商店里可被搜索/下载/双击运行
- **唯一分发渠道**:禁止 DMG 直分发 / ad-hoc 签名 / 自家网站下载 / Homebrew Cask;**仅 TestFlight 内测例外**
- **冲突立即调整**:与 App Store Review Guidelines 冲突的方案当场调整,不得"先上线再说"
- **永久排除清单**:Tauri + Python sidecar + faster-whisper + PyAV + Web Speech 之外的任何 Web Worker ASR 方案

### A0.1 — Sandbox 必须开启

`apps/macos/Eatit/Eatit.entitlements` 内必须含:
```xml
<key>com.apple.security.app-sandbox</key><true/>
```
任何节点试图删除或注释此行 = 立即报告,不实施。

### A0.2 — Network entitlements 严格白名单

允许:
```xml
<key>com.apple.security.network.client</key><true/>
```
**禁止**:
```xml
<!-- 严禁 -->
<key>com.apple.security.network.server</key><true/>
<key>com.apple.security.cs.disable-library-validation</key><true/>
<key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
<key>com.apple.security.cs.allow-jit</key><true/>
<key>com.apple.security.cs.allow-dyld-environment-variables</key><true/>
```

任何节点试图加上述任一禁项 = 立即报告 + 触发 architect re-review(因为这等价于回退到方案 A,违反总纲)。

### A0.3 — 出站请求 host 白名单

WKWebView 内 fetch 与 Swift `URLSession` 出站连接仅允许命中:

| 用途 | Host |
|---|---|
| LLM | `https://ark.cn-beijing.volces.com` |
| ASR | `wss://openspeech.bytedance.com` |
| App Store / Apple 系统 API | `*.apple.com`(macOS 系统底层调用,Sandbox 默认放行,不计入业务白名单) |

其他 host 出站 = 立即报告。Build Phase 必须含 `WKContentRuleList` 拦截白名单外 host(M1.4 节点落地)。

### A0.4 — API Key 处置红线(继承 v3.3 §C + macOS 特化)

API Key(`ARK_API_KEY` / 火山 ASR `AppID + Access Token`)严禁出现在:

- 任何 `*.swift` / `*.ts` / `*.tsx` 源码字面量中(用 Keychain 取)
- 任何日志输出(`os_log` / `print` / `console.log` / `console.error`)
- 任何 SQLite 表的 column value
- 任何 `UserDefaults` / `NSUbiquitousKeyValueStore`
- 任何 commit message body
- 任何 PrivacyInfo.xcprivacy / Info.plist 字段
- 任何 git diff(检查 `git log -p | grep -E '(sk-|ark-|AKAI)'`)

仅允许:
- macOS Keychain(`com.eatit.desktop` service)的 `kSecValueData` 字段
- Swift `LLMGateway` / `ASRGateway` 函数 stack 内的局部变量(每次请求结束后 Swift 自动释放)
- `URLRequest.allHTTPHeaderFields["Authorization"]`(发出后立即丢)

### A0.5 — 不得运行时下载可执行代码(Guideline 2.5.2)

允许下载:文本 / JSON / 图像(jpg/png/webp)/ 音频(用户面试录音上传给 ASR 不算,因为是用户主动行为)
**禁止下载并执行**:
- `.so` / `.dylib` / `.framework` / `.bundle`
- 动态加载的 JavaScript bundle(`<script src="https://..."`)
- WebAssembly `.wasm`(即使是数据,也建议避免;若必须用必须先 PRD 增量备案)
- HTML / CSS 模板(只能从 bundle 内 `Resources/web/` 读)

---

## B. Engineering Discipline(继承 v32 §B + macOS 特化)

### B1 — One commit per section

每个 ralph loop 一个 commit,Conventional Commits 前缀严格按 sections spec 定义。

### B2 — Full errors surfaced

任何 verification 命令失败必须输出**完整错误**,禁止 `--no-verify` / `pytest -x` 沉默 / `xcodebuild ... 2>/dev/null` / `swift build 2>&1 | tail -1` 等截断手段。

### B3 — No placeholder implementations

如果 spec acceptance 说 "Keychain.save 必须真实写入",一个 stub return `nil` 不算完成。

### B4 — Relative paths only

`/Users/shixuan/...` 不得出现在源码、测试、文档、Xcode 工程的任何位置。`Eatit.xcodeproj` 用 `$(SRCROOT)` / `$(PROJECT_DIR)` 等变量。

### B5 — No remote push

Ralph 仅 commit 不 push。Push 是用户的操作。

### B6 — `.ralph/` 与 `.ralphrc` 是 protected paths

任何节点试图修改 `.ralph/` 内容 = 立即报告。

### B7 — macOS 工具链版本锁

| 工具 | 锁定版本 | 检查命令 |
|---|---|---|
| Xcode | ≥ 15.4 | `xcodebuild -version` |
| Swift | ≥ 5.10 | `swift --version` |
| macOS SDK | ≥ 14.0 | `xcrun --show-sdk-version` |
| pnpm | ≥ 9.x | `pnpm --version` |
| Node.js | ≥ 20.x | `node --version` |

CI / 本地开发不得用更老版本(包括 Apple Silicon 与 Intel macOS 共存场景下意外切到老链)。

### B8 — Xcode 工程不得 manual 编辑

`Eatit.xcodeproj/project.pbxproj` 必须由 Xcode 自身或 `xcodebuild` 生成,人工不可手改(避免 merge conflict 黑洞)。如果需要新增文件,必须打开 Xcode GUI 添加或用 [`tuist`](https://tuist.io)/[`xcodegen`](https://github.com/yonaskolb/XcodeGen)(本项目暂不引入 tuist/xcodegen,直接 Xcode GUI)。

### B9 — Bridge 协议双端契约

JS↔Swift Bridge 任意方法新增/修改时,必须**同一 commit**包含:
- Swift 端 Codable struct 定义(`apps/macos/Eatit/Bridge/`)
- TS 端 Zod schema(`apps/desktop/src/services/nativeBridge.ts`)
- Vitest 单测覆盖 happy path + 至少 1 个 error case

任何一端修改而另一端未跟进 = 节点未完成。

---

## C. Secrets Hygiene(macOS 特化)

### C1 — Keychain Service / Account 命名锁

| Account | 用途 | Service |
|---|---|---|
| `ark-api-key` | 火山方舟 ARK API Key(LLM 调用)| `com.eatit.desktop` |
| `volc-asr-credentials` | 火山 ASR `{appId, accessToken}` JSON 串 | `com.eatit.desktop` |
| `app-encryption-key` | 数据库本地加密密钥(M2.3 节点决定是否启用)| `com.eatit.desktop` |

任何节点新增 Keychain account 必须:
- 在本节登记
- 提供 Settings 页 UI 让用户管理(查看/重置)
- 卸载应用时 macOS 自动清理(无需我们写清理逻辑)

### C2 — Keychain Access Group

```xml
<key>keychain-access-groups</key>
<array>
    <string>$(AppIdentifierPrefix)com.eatit.desktop</string>
</array>
```

`AppIdentifierPrefix` 由 Apple Developer Team ID 自动注入,人工不得 hard-code。

### C3 — Bridge 调用不得反向暴露 Key

`webkit.messageHandlers.eatit.postMessage({method: "keychain.get", params: {account}})` 在 Swift 端接收后,**返回值 data 字段不得直接含 secret**——只能返回 `{exists: bool}` 给前端 UI(用于"已配置/未配置"显示)。

真正的 secret 仅由 LLMGateway / ASRGateway 在 Swift 内部消费,**不出 Swift 边界**。

### C4 — Privacy Manifest 必备字段

`apps/macos/Eatit/PrivacyInfo.xcprivacy`(M6 起强制):
```xml
<key>NSPrivacyTracking</key><false/>
<key>NSPrivacyTrackingDomains</key><array/>
<key>NSPrivacyCollectedDataTypes</key><array/>
<key>NSPrivacyAccessedAPITypes</key><array>...</array>
```

`NSPrivacyAccessedAPITypes` 必含 `FileTimestamp` 与 `UserDefaults` 两类(对应使用了 `attributes(of:)` 与 `UserDefaults` 读写;按 Apple 2024 规则强制声明)。

---

## D. Design System(继承 v32 §D,WebView 内零变更)

WKWebView 内的 React 应用沿用 v3.3 设计系统:

- 21 个共享 className(.btn / .card / .tag / .tile / .kbd / .input / .bar / .row / .col / .h1-3 / .body / .muted / .between / .wrap / .grow / .divider / .divider-v 等)
- design tokens(CSS 变量 var(--brand) / var(--ink-900) / var(--bg-elev) 等)
- 严禁 Tailwind 默认色板 / 严禁直写 hex 色值

`pnpm lint:design-tokens` 在 v3.4 重构期间必须保持 green。

新增的 macOS 系统 UI(如 Settings 页面新引入的 Toggle / Stepper)如果走 Swift 原生(SwiftUI)而非 WebView 实现,**走 macOS Human Interface Guidelines**,不强求与 design system 一致(但要写在 PR description 里)。

---

## E. Database Migration(macOS 特化)

### E1 — 老用户数据不迁移(老板拍板)

v3.4 视为全新 app,不读取老 Tauri 版本的 SQLite。

但**仍需保留 migration 框架**:M2.3 节点的 `DatabaseService` 必须实现 `applyMigrations()` 流程,M3 起每个 schema 变更都要写 migration 脚本,以便后续版本(v3.5+)对老 v3.4 用户做迁移。

### E2 — Migration 脚本格式

```swift
// apps/macos/Eatit/Services/DatabaseService.swift
let migrations: [(version: Int, sql: String)] = [
    (1, """
    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY NOT NULL,
        ...
    );
    """),
    (2, "ALTER TABLE sessions ADD COLUMN ..."),
]
```

每条 migration 必须 idempotent(`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`)。

### E3 — 不得在 SQLite 存秘密

`sessions.config_snapshot` / `app_settings.value` 等字段在写入前必须经 `redactSecrets()`(M2.3 实现),把任何形如 `sk-*` / `ark-*` / 长度 > 30 的纯字母数字字符串替换为 `<redacted>`。

---

## F. v3.4 Test Coverage Floor

新增节点必过的测试矩阵:

| 测试 | 文件 | 验证内容 | M 节点 |
|---|---|---|---|
| Bridge 协议 happy path | `apps/desktop/src/__tests__/nativeBridge.test.ts` | 18 个 method 全部 happy path | M2.X |
| Bridge 协议 error path | 同上 | 每个 method 至少 1 个 error case | M2.X |
| Keychain SecItem 生命周期 | `apps/macos/EatitTests/KeychainServiceTests.swift` | save/get/delete + 重启不丢 | M2.2 |
| 数据库迁移幂等 | `apps/macos/EatitTests/DatabaseServiceTests.swift` | 跑 2 次 migrations 状态一致 | M2.3 |
| LangGraph.js turn_graph 节点名锁 | `apps/desktop/src/__tests__/turnGraph.contract.test.ts` | 节点集合 = `{turn_assessment, compression, next_question}` | M3.3 |
| LangGraph.js intake_graph 节点名锁 | `apps/desktop/src/__tests__/intakeGraph.contract.test.ts` | 节点集合 = `{parse_node, research_node, predict_questions_node}` | M3.3 |
| LangGraph.js post_report_graph 节点名锁 | `apps/desktop/src/__tests__/postReportGraph.contract.test.ts` | 节点集合 = `{coach_node, reflection_node}` | M3.3 |
| 五维度 name 锁(TS 端)| `apps/desktop/src/__tests__/dimensions.contract.test.ts` | name 严格匹配 5 项中文 | M3.3 |
| Persona 4 名锁(TS 端)| `apps/desktop/src/__tests__/persona.contract.test.ts` | 4 个英文名固定 | M3.3 |
| 填充词 7 词锁(TS 端)| `apps/desktop/src/__tests__/fillerWords.contract.test.ts` | 列表严格匹配 | M3.3 |
| 12 禁止词 fuzz | `apps/desktop/src/__tests__/passLikelihoodEthics.test.ts` | 任意输入下 pass_likelihood ∈ {中上,中,中下} | M3.3 |
| 流式 ASR partial → final | `apps/desktop/src/__tests__/volcStreamAsr.test.ts` | mock Bridge 推 partial 5 次 + final 1 次,字幕状态正确 | M3.4 |
| Sandbox entitlements 完整性 | shell + `codesign -d --entitlements -` | M1.4 起每节点末尾 acceptance 命令含 | M1.4+ |
| 出站 host 白名单 | `apps/desktop/src/__tests__/hostWhitelist.test.ts` | fetch 命中非白名单 host 抛错 | M2.7 |

**总计 ≥ 14 个 contract 测试**,M3.3 完成后所有锁必须绿。

---

## G. PRD / AGENTS.md 同步

每个节点 commit body 必含:

- `F-XXX:` 行(若节点对应 F-401~F-406 之一)
- 涉及的 PRD 章节(如 "PRD 9.3.1 节点级闸门")
- 涉及的 AGENTS.md 段落(如 "AGENTS.md 条款 13 衍生红线 4")

PRD / AGENTS.md / FEATURES.md 的人工增量在节点完成后由人工整理(不在 ralph loop 内)。

---

## H. 多 Agent 协作约定(v3.4 核心新增)

### H1 — Subagent 角色映射

Ralph 在每个 loop 内,根据节点 spec 头部声明的 `Lead Agent` 派发对应 subagent 来主导实施:

| Lead Agent | Subagent type | 何时用 |
|---|---|---|
| **architect** | `architect` | 节点涉及结构性设计(工程脚手架 / 协议设计 / 跨模块架构);本 loop 不写实施代码,只产出 design doc |
| **developer** | `developer` | 节点是明确的编码任务;实施 + 跑 acceptance + commit |
| **tester** | `tester` | 节点是测试设计 / re-audit / E2E 验证;不动产品代码,只写测试或 audit report |
| **product-manager** | `product-manager` | 节点涉及文案 / 用户故事拆解(M6 App Store 元数据);不写代码 |
| **Explore** | `Explore` | 节点开始前 30 秒代码调研(只读,不修改);用于"我要改的这个 service 已经有什么 / API 怎么调用"等问题 |

### H2 — 单 loop 内 subagent 调度模板

```
Loop 开始(Ralph 主进程)
  ↓
1. 读 v34-macos-port-constraints.md 红线
2. 读 fix_plan.md,锁定本 loop 节点 X
3. 读 v34-macos-port-sections.md 节点 X 的 spec
4. 提取节点 X 头部的 Lead Agent 声明
  ↓
5. (可选)如果 spec 含 "Helper: Explore <调研问题>",先派 Explore subagent 做 30 秒调研
  ↓
6. 派 Lead Agent subagent 实施(在 Agent 工具调用中传入完整 spec 内容 + constraints + 已有相关代码片段)
  ↓
7. Lead Agent 返回后,Ralph 主进程跑 spec.Acceptance 命令
  ↓
8. (可选)如果 spec 含 "Audit gate: tester <重点>",再派 tester subagent 做 re-audit;tester 输出 audit report 写入 .ralph/logs/<loop-id>-audit.md
  ↓
9. (条件)如果 audit 发现 🔴 严重问题,本 loop 标 BLOCKED + 挂 audit-fix 任务到 fix_plan;如果只 🟡 minor 可下 loop 修
  ↓
10. commit + 更新 fix_plan + 输出 status block
Loop 结束
```

### H3 — Architect-led 节点的两阶段拆分

如果节点头部标 `Lead Agent: architect`,该节点产出 **design doc**(只 markdown,不写实施代码),写入:

```
.ralph/docs/v34-design/<NODE_ID>-design.md
```

**下一 loop** 自动接续同一节点的 `developer` 实施步骤,Lead Agent 切换为 developer,Ralph 读 architect 产出的 design doc 作为实施依据。

为了让 Ralph 知道"上 loop 是 architect,本 loop 是 developer 续做",节点 ID 后缀:

- `M2.1.arch` — architect 出方案
- `M2.1.dev` — developer 实施
- `M2.1.test` — tester audit(可选)

`M2.1` 整体完成 = 三个子节点全部 [x]。

### H4 — Tester-led 节点(独立 audit 节点)

每个 M.X 完成后,自动安排一个 `M.X.audit` 节点:

```
Lead Agent: tester
Goal: 独立复审 M.X 全部子节点(M.X.1 ~ M.X.N),输出 audit report
Files: .ralph/logs/M.X.X-audit.md (new)
Acceptance: audit report 必含 4 段(优势 / 🔴 严重缺口 / 🟡 minor 缺口 / 整体评分 N/10)
```

发现 🔴 严重缺口 → 自动产生 `M.X.audit-fix` 节点(默认 tester 标记缺口,architect / developer 接续修)

### H5 — 单 loop 内并行 subagent

某些节点的 Files 列表内,文件之间互不依赖(典型如 M2.2 / M2.3 / M2.4 三个 Swift Service 都是独立的)。这种情况下,**Ralph 主进程在 step 6 可以一次派出多个 Lead Agent subagent 并行实施**,通过单条消息内多个 Agent 工具调用实现。

但满足以下所有条件才能并行:

1. 节点 spec 头部标 `Parallel-safe: yes`
2. Files 列表内的文件无 import 依赖(不能 file A import file B)
3. Acceptance 命令内的测试不存在跨文件断言
4. 单 loop 总改动 ≤ 350 行(略放宽 200 行限制,因为是 N 个独立小改动叠加)

不满足任一条 = 串行实施。

### H6 — 跨 loop 并行(用户启多个 Ralph 实例)

用户可以同时启动多个 Ralph 实例,每个实例跑独立节点。条件:

1. 节点 spec 头部标 `Parallel-safe: yes`
2. 节点之间 deps 字段不互相引用
3. 不冲突修改同一文件(grep `Files:` 段确认)
4. 节点同属于一个 M.X(M2.X 内可并行,M2 与 M3 不可)

具体哪些节点可并行,见 [`v34-macos-port-sections.md`](v34-macos-port-sections.md) 的 `Parallel-safe matrix` 段。

### H7 — Audit gate 时机表(强制)

| 节点 | Audit gate |
|---|---|
| M1 整 M 末 | tester audit 整个 Xcode 工程 + entitlements + TestFlight 链 |
| M2 整 M 末 | tester audit 全部 7 个 Swift Service + Bridge 协议契约 |
| M3.3 末(LangGraph.js 三图)| **tester re-audit 必须**(继承 v3.3 经验,LangGraph 节点名锁是 L0)|
| M3.4 末(流式 ASR)| **tester re-audit 必须**(端到端关键路径,易"假完成")|
| M4 末(UI 全替换 Tauri invoke)| tester E2E smoke |
| M5 末(后端删除)| tester audit 残余引用 + Vitest 测试覆盖率回归 |
| M6 末(App Store 提交前)| **tester + product-manager 双审**(隐私政策 / Privacy Manifest / Review Notes 完整性)|

跳过 audit gate = 立即报告 + 强制回滚到上一节点。

### H8 — Subagent prompt 必备段(Ralph 主进程派发时)

每次派 subagent 时,Ralph 必须传入:

1. **任务上下文**:本节点 spec 全文 + 直接相关的依赖节点 spec
2. **红线提醒**:本 constraints 文件 A0/A0.1~A0.5 的总纲红线 + 节点强相关的具体红线
3. **代码上下文**:相关已有文件的关键片段(用 Read tool 读出后嵌入 prompt)
4. **明确任务边界**:你能动哪些文件 / 不能动哪些文件 / 跑哪些 acceptance 命令
5. **预期产出形态**:design doc 还是代码?有则在哪个文件?
6. **失败处理**:遇到红线冲突立即停下报告,不要"打补丁绕过"

PROMPT.md 的 step 5(派发)部分有完整模板。

---

## I. v3.4 Phase 5 Test Floor(M5 末门禁)

M5 完成 = 删除 `apps/api/` 整个目录后,以下命令必须全绿:

```bash
# 前端
cd apps/desktop
corepack pnpm install
corepack pnpm exec tsc --noEmit
corepack pnpm lint
corepack pnpm lint:design-tokens
corepack pnpm test  # vitest,目标 ≥ 400 passed
corepack pnpm exec playwright test  # smoke E2E,目标 5 个金标全过

# Xcode 工程
cd apps/macos
xcodebuild -scheme Eatit -configuration Release \
    -destination "platform=macOS" \
    -archivePath build/Eatit.xcarchive \
    archive
xcodebuild -exportArchive \
    -archivePath build/Eatit.xcarchive \
    -exportOptionsPlist ExportOptions-AppStore.plist \
    -exportPath build/

# Swift 单测
xcodebuild test -scheme EatitTests -destination "platform=macOS"

# 残余 Python 检查
test ! -d ../api  # apps/api/ 必须不存在
test ! -f ../../pyproject.toml
test ! -f ../../uv.lock
grep -rE "(uvicorn|fastapi|alembic|sqlalchemy|pydantic|instructor|litellm|langgraph)" \
    --include="*.py" --include="*.toml" --include="*.json" \
    apps/ packages/ docs/ \
    | grep -v "node_modules" \
    | grep -v "_archived" \
    && exit 1 || exit 0  # 不应有任何 Python 库残余引用
```

任何一项不过 = M5 未完成,必须回 fix_plan 补节点。

---

## J. 文档变更联动(macOS 特化)

每个 v3.4 节点完成后,如果触碰以下任一类目,必须更新对应文档:

| 触碰内容 | 必更文档 |
|---|---|
| Bridge 协议 method 增删 | PRD §4.4.3 + 本 constraints §B9 |
| Swift Service 增删 | PRD §4.2 仓库结构 + AGENTS.md 第 2 节 |
| LangGraph.js 三图节点变更 | PRD §6 + 本 constraints §F + 三个 contract test |
| Entitlements 字段变更 | PRD §4.3 + 本 constraints §A0.1/A0.2 |
| 火山引擎接入参数变更 | PRD §4.5 + 本 constraints §A0.3 |

文档更新由人工在节点完成后整理,**不在 ralph loop 内**。但 commit body 必须列出"待更新文档清单"作为人工 follow-up 提示。

---

## K. 反模式黑名单(继承 PRD 9.3.3,在 Ralph 实施时必须主动拒绝)

任何 subagent / Ralph 主进程在实施过程中提议以下做法时,**当场拒绝并报告**:

1. ❌ "先上 Developer ID 公证版给老板看,App Store 后面慢慢搞"
2. ❌ "先把 Python sidecar 跑起来,后面再想办法过 Sandbox"
3. ❌ "Privacy Manifest 后面再写,先把功能跑通"
4. ❌ "ASR 先用浏览器内 WebSocket 调试,后面再迁 Swift"
5. ❌ "跨 macOS 版本兼容到 13,扩大用户群"
6. ❌(macOS 特化)"为了节省 Bridge 调用次数,把 API Key 通过 messageHandler 传给 JS 层临时存内存"——违反 §C3
7. ❌(macOS 特化)"为了 ASR 调试方便,临时加 `disable-library-validation`"——违反 §A0.2 + 总纲
8. ❌(macOS 特化)"为了让 Swift 端能 spawn helper 工具,加 `network.server`"——违反 §A0.2

每条反模式都有共同特征:**短期省事,长期破坏总纲 A0**。
