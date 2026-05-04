# v3.4 macOS App Store Port — Section Specs

> **PRD 权威**:[`eatit/docs/PRD/Eatit_PRD_v3_4_macos_appstore.md`](../../docs/PRD/Eatit_PRD_v3_4_macos_appstore.md)
> **红线**:[`v34-macos-port-constraints.md`](v34-macos-port-constraints.md)(必读,任何节点违反任一红线立即报告)
> **总纲**:Mac App Store 上架是不可妥协的最终交付定义(PRD 9.2.17 / AGENTS.md 条款 13)
>
> 共 **7 个 milestone(M1~M7)**,**~52 个 ralph 节点**(含 architect 设计节点 + developer 实施节点 + tester audit 节点)。每个节点 = 一个 ralph loop = 一个 commit。
>
> 节点拆分纪律(继承 v32 经验):单节点 ≤ 200 行 / ≤ 8 文件 / spec ≤ 100-150 行 markdown,避免 Stream Idle Timeout。

---

## Spec 字段说明

每个节点包含以下段:

- **Lead Agent**:`architect` / `developer` / `tester` / `product-manager` / `Explore`
- **Helper Agents**(可选):此节点过程中由 Lead Agent 派的辅助 subagent
- **Parallel-safe**:`yes` / `no`(同 milestone 内可否多 Ralph 实例并跑)
- **Deps**:依赖的前置节点
- **Goal**:一句话说为什么做
- **Files**:绝对路径列表 + modify/new/delete 标注
- **Key Interfaces**:Swift / TS / SQL 关键代码片段(让实施 agent 直接抄)
- **Deliverables**:本节点完成后可见的具体产物清单
- **Acceptance**:可执行命令清单
- **Commit**:Conventional Commits 前缀

---

## Execution Order Master Table

### M1 — Xcode 工程脚手架(1 周,5 节点)

| # | 节点 | Lead | Parallel | Deps | Commit prefix |
|---|---|---|---|---|---|
| 1 | M1.1.arch Xcode 工程结构设计 | architect | no | — | `docs(v34): design xcode project structure` |
| 2 | M1.1.dev Xcode 工程脚手架 | developer | no | M1.1.arch | `feat(F-401): scaffold xcode macos app project` |
| 3 | M1.2 WKURLSchemeHandler + React build 加载 | developer | no | M1.1.dev | `feat(F-401): wire wkwebview to bundle web resources` |
| 4 | M1.3 Apple Developer 证书 + TestFlight 第一份 build | developer | no | M1.2 | `chore(F-401): provision and upload first testflight build` |
| 5 | M1.4 entitlements + Info.plist + PrivacyInfo 占位 | developer | no | M1.1.dev | `feat(F-401,F-406): land sandbox entitlements and privacy manifest stub` |
| 6 | M1.X tester audit M1 全段 | tester | no | M1.1~M1.4 | `test(v34): audit M1 xcode scaffold` |

### M2 — Swift Native Services(1.5 周,12 节点)

| # | 节点 | Lead | Parallel | Deps | Commit prefix |
|---|---|---|---|---|---|
| 7 | M2.1.arch Bridge 协议设计 | architect | no | M1.X | `docs(v34): design webkit bridge protocol` |
| 8 | M2.1.dev BridgeRouter + Codable + Zod 双端契约 | developer | no | M2.1.arch | `feat(F-404): land bridge router and dual-side schema` |
| 9 | M2.2 KeychainService | developer | yes | M2.1.dev | `feat(F-404): implement keychain service` |
| 10 | M2.3 DatabaseService(GRDB.swift)| developer | yes | M2.1.dev | `feat(F-404): implement database service via grdb` |
| 11 | M2.4 FilePickerService | developer | yes | M2.1.dev | `feat(F-404): implement file picker service` |
| 12 | M2.5 PDFParserService(PDFKit)| developer | yes | M2.1.dev | `feat(F-404): implement pdf parser service` |
| 13 | M2.6 AudioCaptureService(AVAudioEngine)| developer | no | M2.1.dev | `feat(F-403,F-404): implement audio capture service` |
| 14 | M2.7.arch LLMGateway SSE 设计 | architect | no | M2.1.dev | `docs(v34): design llm gateway sse streaming` |
| 15 | M2.7.dev LLMGateway 实施 + ARK 接通 | developer | no | M2.7.arch | `feat(F-402,F-404): implement llm gateway with volcengine ark` |
| 16 | M2.8.arch ASRGateway WS 设计 | architect | no | M2.6 | `docs(v34): design asr gateway websocket framing` |
| 17 | M2.8.dev ASRGateway 实施 + 火山 SAUC 接通 | developer | no | M2.8.arch | `feat(F-403,F-404): implement asr gateway with volcengine sauc` |
| 18 | M2.X tester audit M2 全段 | tester | no | M2.1~M2.8 | `test(v34): audit M2 swift services` |

### M3 — 后端逻辑迁 TS(3-4 周,21 节点)

| # | 节点 | Lead | Parallel | Deps | Commit prefix |
|---|---|---|---|---|---|
| 19 | M3.1.1 Zod schemas × 11 | developer | no | M2.X | `feat(F-405): port pydantic schemas to zod` |
| 20 | M3.1.2 LLM provider 抽象 + ARK provider TS | developer | no | M3.1.1 | `feat(F-402,F-405): land ark llm provider via swift bridge` |
| 21 | M3.1.3 LangGraph.js 接入 + Hello World graph | developer | no | M3.1.2 | `feat(F-405): bootstrap langgraph.js` |
| 22 | M3.2.1 Parse Agent (TS) | developer | yes | M3.1.* | `feat(F-405): port parse agent to typescript` |
| 23 | M3.2.2 Reference Agent (TS) | developer | yes | M3.1.* | `feat(F-405): port reference agent to typescript` |
| 24 | M3.2.3 Compression Agent (TS) | developer | yes | M3.1.* | `feat(F-405): port compression agent to typescript` |
| 25 | M3.2.4 Observer Agent (TS) | developer | yes | M3.1.* | `feat(F-405): port observer agent to typescript` |
| 26 | M3.3.1.arch turn_graph 设计 | architect | no | M3.2.* | `docs(v34): design turn_graph in langgraph.js` |
| 27 | M3.3.1.dev turn_graph + Interviewer Agent | developer | no | M3.3.1.arch | `feat(F-405): land turn_graph with locked node names` |
| 28 | M3.3.2.arch intake_graph 设计 | architect | no | M3.3.1.dev | `docs(v34): design intake_graph in langgraph.js` |
| 29 | M3.3.2.dev intake_graph + Framework + Research | developer | no | M3.3.2.arch | `feat(F-405): land intake_graph with research opt-in` |
| 30 | M3.3.3.arch post_report_graph 设计 | architect | no | M3.3.2.dev | `docs(v34): design post_report_graph in langgraph.js` |
| 31 | M3.3.3.dev post_report_graph + Coach + Reflection + Report | developer | no | M3.3.3.arch | `feat(F-405): land post_report_graph with parallel coach||reflection` |
| 32 | M3.3.X tester re-audit 三图(必须)| tester | no | M3.3.3.dev | `test(v34): re-audit langgraph.js node-name locks` |
| 33 | M3.4.1.arch 流式 ASR Bridge → AsyncIterator 设计 | architect | no | M2.8.dev | `docs(v34): design volc streaming asr async iterator` |
| 34 | M3.4.1.dev volcStreamAsr + InterviewPage 接入 | developer | no | M3.4.1.arch | `feat(F-403,F-405): wire streaming asr partial to live caption` |
| 35 | M3.4.X tester re-audit 流式 ASR(必须)| tester | no | M3.4.1.dev | `test(v34): re-audit streaming asr end-to-end` |

### M4 — UI 改造(1 周,4 节点)

| # | 节点 | Lead | Parallel | Deps | Commit prefix |
|---|---|---|---|---|---|
| 36 | M4.1 Tauri invoke → nativeBridge 全替换 | developer | no | M3.X | `refactor(v34): replace tauri invoke with native bridge` |
| 37 | M4.2 WebSocket interview stream → AsyncIterator | developer | no | M4.1 | `refactor(v34): replace ws stream with async iterator` |
| 38 | M4.3 21 F-ID UI 走查 + 修 | developer | no | M4.2 | `fix(v34): align 21 f-ids with design-reference under wkwebview` |
| 39 | M4.X tester E2E smoke (Onboarding → Report 全流程)| tester | no | M4.3 | `test(v34): e2e smoke for full happy path` |

### M5 — 测试迁移 + 后端删除(1-2 周,6 节点)

| # | 节点 | Lead | Parallel | Deps | Commit prefix |
|---|---|---|---|---|---|
| 40 | M5.1 后端 471 pytest 分类(保留/删除)| tester | no | M4.X | `docs(v34): triage backend pytest for migration` |
| 41 | M5.2 Vitest 扩充至 ≥ 400 | developer | no | M5.1 | `test(v34): port pytest to vitest reaching 400+` |
| 42 | M5.3 Playwright E2E 改造为启 Eatit.app | developer | no | M5.2 | `test(v34): rewire playwright to launch eatit.app` |
| 43 | M5.4.arch apps/api 删除决策 | architect | no | M5.3 | `docs(v34): plan python backend retirement` |
| 44 | M5.4.dev 删除 apps/api + 残余清理 | developer | no | M5.4.arch | `chore(v34): retire python backend permanently` |
| 45 | M5.5 README + AGENTS.md + workspace 同步 | developer | no | M5.4.dev | `docs(v34): sync top-level docs to ts-only architecture` |

### M6 — Privacy Manifest + App Store 准备(3-5 天,5 节点)

| # | 节点 | Lead | Parallel | Deps | Commit prefix |
|---|---|---|---|---|---|
| 46 | M6.1 PrivacyInfo.xcprivacy 完整版 | developer | no | M5.5 | `feat(F-406): finalize privacy manifest` |
| 47 | M6.2 5 张截图 + 文案 | product-manager | yes | M5.5 | `chore(v34): produce app store screenshots and captions` |
| 48 | M6.3 隐私政策网页 | product-manager | yes | M5.5 | `chore(v34): publish privacy policy webpage` |
| 49 | M6.4 App Store Connect 元数据 | product-manager | yes | M5.5 | `chore(v34): fill app store connect metadata` |
| 50 | M6.X tester + product-manager 双审 | tester | no | M6.1~M6.4 | `test(v34): dual audit before first review submission` |
| 51 | M6.5 第一次 Archive + 上传 App Store Connect | developer | no | M6.X | `chore(v34): submit first review` |

### M7 — Review 处理 + 上架(1 周,反应式 1+ 节点)

| # | 节点 | Lead | Parallel | Deps | Commit prefix |
|---|---|---|---|---|---|
| 52 | M7.1+ Review reject 处理(反应式,按 reject 内容现场拆节点)| developer/architect/tester | no | M6.5 | `fix(v34): address app review reject N` |

---

## Parallel-safe Matrix

以下节点群在用户启多个 Ralph 实例时**可并行跑**(同 milestone 内,无文件冲突):

- M2.2 / M2.3 / M2.4 / M2.5(4 个独立 Swift Service,Parallel-safe)
- M3.2.1 / M3.2.2 / M3.2.3 / M3.2.4(4 个简单 Agent TS port,Parallel-safe)
- M6.2 / M6.3 / M6.4(App Store 资产,3 类 product-manager 任务,Parallel-safe)

其他节点严格串行(依赖链清晰)。

---

# M1 — Xcode 工程脚手架

## M1.1.arch — Xcode 工程结构设计

**Lead Agent**: architect
**Helper Agents**: Explore(读 PRD §4.2 + §4.3 + 现有 `apps/desktop/` 结构)
**Parallel-safe**: no
**Deps**: —

**Goal.** 出一份 design doc 明确 Xcode 工程的目录结构、Build Phases、entitlements 字段、Info.plist 关键 key、Swift package 依赖(GRDB.swift + 其他)、Resources 同步策略,作为 M1.1.dev 的实施依据。

**Files (new):**
- `eatit/.ralph/docs/v34-design/M1.1-xcode-project-structure.md`(architect 产出)

**Key Interfaces.** design doc 必含以下段:

1. 目录树(对照 PRD §4.2 仓库结构)
2. Build Phases 清单:
   - Compile Sources
   - Copy Bundle Resources(`Resources/web/` 同步)
   - Run Script: 校验 entitlements 完整(`codesign -d --entitlements -`)
   - Run Script: 校验所有内嵌二进制 Team ID 签名一致
3. entitlements 字段(对应 constraints §A0.1 + §A0.2)
4. Info.plist 必需 key:
   - `NSMicrophoneUsageDescription` = "Eatit 需要使用麦克风以录制您的面试回答"
   - `LSMinimumSystemVersion` = "14.0"
   - `LSApplicationCategoryType` = "public.app-category.education"
   - `NSAppTransportSecurity` 配置(明确禁止 arbitrary loads,白名单 ATS exception)
5. Swift Package Manager 依赖:
   - `GRDB.swift` ≥ 6.x(数据库)
6. Vite build → Resources/web/ 同步策略(Run Script Phase 调用 `pnpm --filter @eatit/desktop build` 后 rsync 到 `Eatit/Resources/web/`)

**Deliverables.**
- `eatit/.ralph/docs/v34-design/M1.1-xcode-project-structure.md`(完整 design doc,~150 行)

**Acceptance.**
```bash
test -f .ralph/docs/v34-design/M1.1-xcode-project-structure.md
grep -c "## " .ralph/docs/v34-design/M1.1-xcode-project-structure.md  # ≥ 6 个 H2 段
```

**Commit.** `docs(v34): design xcode project structure`

---

## M1.1.dev — Xcode 工程脚手架

**Lead Agent**: developer
**Helper Agents**: —
**Parallel-safe**: no
**Deps**: M1.1.arch

**Goal.** 按 M1.1.arch design doc 创建 Xcode 工程骨架,能 `xcodebuild` 构建出空壳 .app(WKWebView 显示 Hello World)。

**Files (new):**
- `apps/macos/Eatit.xcodeproj/`(Xcode 自动生成,人工不改 pbxproj)
- `apps/macos/Eatit/EatitApp.swift`
- `apps/macos/Eatit/AppDelegate.swift`
- `apps/macos/Eatit/WebViewController.swift`
- `apps/macos/Eatit/Eatit.entitlements`
- `apps/macos/Eatit/Info.plist`
- `apps/macos/Eatit/Resources/web/index.html`(占位 Hello World)
- `apps/macos/EatitTests/`(目录,空壳测试 target)

**Key Interfaces.**

```swift
// EatitApp.swift
import SwiftUI
import AppKit

@main
struct EatitApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    var body: some Scene {
        WindowGroup {
            WebViewContainer()
                .frame(minWidth: 1000, minHeight: 700)
        }
        .windowStyle(.titleBar)
        .commands { /* 后续节点添加菜单 */ }
    }
}

struct WebViewContainer: NSViewControllerRepresentable {
    func makeNSViewController(context: Context) -> WebViewController { WebViewController() }
    func updateNSViewController(_: WebViewController, context: Context) {}
}
```

```swift
// WebViewController.swift
import AppKit
import WebKit

final class WebViewController: NSViewController {
    private var webView: WKWebView!

    override func loadView() {
        let config = WKWebViewConfiguration()
        // 注:WKURLSchemeHandler 在 M1.2 节点接入 eatit:// scheme
        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        // M1.1.dev 阶段先用 file:// 加载占位 index.html
        if let url = Bundle.main.url(forResource: "index", withExtension: "html",
                                      subdirectory: "web") {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
    }
}
```

**Deliverables.**
- 一个能 `xcodebuild build -scheme Eatit -destination "platform=macOS"` 成功的 .app
- 双击运行能弹出窗口 + WKWebView 显示 "Hello, Eatit v3.4"
- 占位 entitlements + Info.plist(M1.4 完善)

**Acceptance.**
```bash
cd apps/macos
xcodebuild build -scheme Eatit -destination "platform=macOS" -derivedDataPath build/ 2>&1 | tail -20
# 退出码 0
test -d build/Build/Products/Debug/Eatit.app
# 启动测试(无头方式,只验证不崩)
open build/Build/Products/Debug/Eatit.app
sleep 3
osascript -e 'tell application "Eatit" to quit' 2>/dev/null || pkill -f Eatit
```

**Commit.** `feat(F-401): scaffold xcode macos app project`

---

## M1.2 — WKURLSchemeHandler + React build 加载

**Lead Agent**: developer
**Helper Agents**: Explore(读 vite build 产物结构 + WKURLSchemeHandler 文档)
**Parallel-safe**: no
**Deps**: M1.1.dev

**Goal.** 让 WKWebView 通过自定义 URL scheme `eatit://app/` 加载 bundle 内 `Resources/web/` 的 React build 产物,绕开 `file://` scheme 在某些 web API(LocalStorage / IndexedDB / WebSocket origin policy)上的限制。

**Files:**
- `apps/macos/Eatit/WebView/EatitURLSchemeHandler.swift`(new)
- `apps/macos/Eatit/WebViewController.swift`(modify)
- `apps/desktop/vite.config.ts`(modify — output base path 改 `eatit://app/`)
- `apps/macos/Eatit.xcodeproj/`(modify — Build Phase 加 React build sync 脚本)
- `apps/macos/scripts/sync-web-resources.sh`(new)

**Key Interfaces.**

```swift
// EatitURLSchemeHandler.swift
final class EatitURLSchemeHandler: NSObject, WKURLSchemeHandler {
    private let bundleResourcesURL: URL

    init(bundleResourcesURL: URL = Bundle.main.bundleURL.appendingPathComponent("Contents/Resources/web")) {
        self.bundleResourcesURL = bundleResourcesURL
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else { ... }
        // eatit://app/index.html  → bundleResourcesURL/index.html
        // eatit://app/assets/x.js  → bundleResourcesURL/assets/x.js
        let path = url.path == "/" ? "/index.html" : url.path
        let fileURL = bundleResourcesURL.appendingPathComponent(path)
        // 安全检查:fileURL 必须在 bundleResourcesURL 下,防 path traversal
        guard fileURL.path.hasPrefix(bundleResourcesURL.path) else {
            urlSchemeTask.didFailWithError(NSError(domain: "Eatit.SchemeHandler", code: 403, ...))
            return
        }
        do {
            let data = try Data(contentsOf: fileURL)
            let mime = mimeType(for: fileURL.pathExtension)
            let response = HTTPURLResponse(url: url, statusCode: 200,
                                            httpVersion: "HTTP/1.1",
                                            headerFields: ["Content-Type": mime])!
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } catch { urlSchemeTask.didFailWithError(error) }
    }

    func webView(_: WKWebView, stop _: WKURLSchemeTask) {}
}
```

```ts
// apps/desktop/vite.config.ts(关键改动)
export default defineConfig({
  base: process.env.EATIT_BUILD_TARGET === "macos" ? "eatit://app/" : "/",
  build: { outDir: "../../apps/macos/Eatit/Resources/web", emptyOutDir: true },
  // ...
});
```

```bash
# scripts/sync-web-resources.sh(Build Phase Run Script)
set -e
cd "${SRCROOT}/../desktop"
EATIT_BUILD_TARGET=macos corepack pnpm build
# 产物已经直接 emit 到 apps/macos/Eatit/Resources/web/(由 vite.config.ts 控制)
```

**Deliverables.**
- WKWebView 加载 `eatit://app/index.html` 渲染 React 应用骨架(目前是 Vite 默认 + 现有 React 路由,Login/Home 等)
- Build 时自动同步前端 build 产物到 macOS Resources/web/

**Acceptance.**
```bash
cd apps/desktop && corepack pnpm install && EATIT_BUILD_TARGET=macos corepack pnpm build
test -f ../macos/Eatit/Resources/web/index.html
cd ../macos && xcodebuild build -scheme Eatit -destination "platform=macOS" -derivedDataPath build/ 2>&1 | tail -10
# 退出码 0
test -f build/Build/Products/Debug/Eatit.app/Contents/Resources/web/index.html
```

**Commit.** `feat(F-401): wire wkwebview to bundle web resources`

---

## M1.3 — Apple Developer 证书 + TestFlight 第一份 build

**Lead Agent**: developer
**Helper Agents**: Explore(查 Apple 文档:provisioning profile + App Store Connect 上传流程)
**Parallel-safe**: no
**Deps**: M1.2

**Goal.** 配置 Team ID + Bundle Identifier(`com.eatit.desktop`)+ Apple Distribution 证书 + Provisioning Profile,跑通 `xcodebuild archive` + `xcrun altool --upload-app`,把第一份空壳 build 推到 App Store Connect TestFlight 通道。

**Files:**
- `apps/macos/Eatit.xcodeproj/`(Xcode GUI 配置 — 仅记录在节点 commit body,不直接编辑 pbxproj)
- `apps/macos/scripts/archive-and-upload.sh`(new)
- `apps/macos/ExportOptions-AppStore.plist`(new)
- `.gitignore`(modify — 排除 `*.xcarchive`、`build/`、`*.p12`、`*.cer`、`*.mobileprovision`)

**Key Interfaces.**

```bash
# scripts/archive-and-upload.sh
set -e
cd "${PROJECT_DIR:-$(dirname $0)/..}"
xcodebuild -scheme Eatit \
    -configuration Release \
    -destination "platform=macOS" \
    -archivePath build/Eatit.xcarchive \
    archive
xcodebuild -exportArchive \
    -archivePath build/Eatit.xcarchive \
    -exportOptionsPlist ExportOptions-AppStore.plist \
    -exportPath build/
# build/Eatit.pkg 产物
xcrun altool --upload-app \
    --type macos \
    --file build/Eatit.pkg \
    --username "$APPLE_ID" \
    --password "@keychain:AC_PASSWORD"  # app-specific password
```

```xml
<!-- ExportOptions-AppStore.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
    <key>method</key><string>app-store</string>
    <key>teamID</key><string>YOUR_TEAM_ID</string>
    <key>signingStyle</key><string>automatic</string>
    <key>uploadBitcode</key><false/>
    <key>uploadSymbols</key><true/>
</dict>
</plist>
```

**Deliverables.**
- 一份 `Eatit.xcarchive` + `Eatit.pkg`(可上传)
- App Store Connect 上能看到第一份 TestFlight build(状态 Processing → Ready to Test)
- 内测设备(开发者自己的 Mac)安装该 build,启动后能看到 Hello World 占位页

**Acceptance.**
```bash
cd apps/macos
./scripts/archive-and-upload.sh 2>&1 | tail -30
# 退出码 0;输出含 "Successfully uploaded" 或类似
test -f build/Eatit.pkg
ls -lh build/Eatit.pkg  # 文件大小 > 0
```

**Commit.** `chore(F-401): provision and upload first testflight build`

> **手工 follow-up**:开发者需要在 App Store Connect 网页端:
> 1. 创建 App ID(Bundle ID = com.eatit.desktop)
> 2. 创建 Eatit App 记录
> 3. 等 build 进入 TestFlight 后,自己安装确认
> 这些步骤无法 ralph 自动化,但 commit body 里要列出"待人工执行"清单。

---

## M1.4 — entitlements + Info.plist + PrivacyInfo 占位

**Lead Agent**: developer
**Helper Agents**: —
**Parallel-safe**: no
**Deps**: M1.1.dev

**Goal.** 落地 v3.4 红线 §A0.1 / §A0.2 / §A0.3 / §A0.4 要求的最小 entitlements + Info.plist + PrivacyInfo.xcprivacy 占位文件。M6.1 节点完善 PrivacyInfo 完整版。

**Files:**
- `apps/macos/Eatit/Eatit.entitlements`(modify)
- `apps/macos/Eatit/Info.plist`(modify)
- `apps/macos/Eatit/PrivacyInfo.xcprivacy`(new)
- `apps/macos/scripts/verify-entitlements.sh`(new — Build Phase 校验脚本)

**Key Interfaces.**

```xml
<!-- Eatit.entitlements -->
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key><true/>
    <key>com.apple.security.network.client</key><true/>
    <key>com.apple.security.files.user-selected.read-write</key><true/>
    <key>com.apple.security.device.audio-input</key><true/>
    <key>keychain-access-groups</key>
    <array>
        <string>$(AppIdentifierPrefix)com.eatit.desktop</string>
    </array>
</dict>
</plist>
```

```xml
<!-- Info.plist 关键 key -->
<key>NSMicrophoneUsageDescription</key>
<string>Eatit 需要使用麦克风以录制您的面试回答,音频会通过您配置的火山引擎 ASR 服务转写为文字。</string>
<key>LSMinimumSystemVersion</key>
<string>14.0</string>
<key>LSApplicationCategoryType</key>
<string>public.app-category.education</string>
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key><false/>
    <key>NSExceptionDomains</key>
    <dict>
        <key>volces.com</key>
        <dict>
            <key>NSIncludesSubdomains</key><true/>
            <key>NSExceptionRequiresForwardSecrecy</key><true/>
        </dict>
        <key>bytedance.com</key>
        <dict>
            <key>NSIncludesSubdomains</key><true/>
            <key>NSExceptionRequiresForwardSecrecy</key><true/>
        </dict>
    </dict>
</dict>
```

```xml
<!-- PrivacyInfo.xcprivacy(占位,M6.1 完善)-->
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key><false/>
    <key>NSPrivacyTrackingDomains</key><array/>
    <key>NSPrivacyCollectedDataTypes</key><array/>
    <key>NSPrivacyAccessedAPITypes</key><array/>
</dict>
</plist>
```

```bash
# scripts/verify-entitlements.sh(Build Phase Run Script)
set -e
APP_PATH="${BUILT_PRODUCTS_DIR}/${PRODUCT_NAME}.app"
codesign -d --entitlements - "$APP_PATH" 2>&1 | tee /tmp/eatit-entitlements.txt
# 必须含 app-sandbox = true
grep -q "<key>com.apple.security.app-sandbox</key>\s*<true/>" /tmp/eatit-entitlements.txt || exit 1
# 严禁 disable-library-validation
grep -q "disable-library-validation" /tmp/eatit-entitlements.txt && exit 1
# 严禁 network.server
grep -q "network.server" /tmp/eatit-entitlements.txt && exit 1
echo "✅ entitlements verified"
```

**Deliverables.**
- entitlements / Info.plist / PrivacyInfo.xcprivacy 三件套落地
- Build Phase 脚本自动校验 entitlements 完整 + 不含禁项

**Acceptance.**
```bash
cd apps/macos
xcodebuild build -scheme Eatit -destination "platform=macOS" -derivedDataPath build/ 2>&1 | tail -10
test -f build/Build/Products/Debug/Eatit.app/Contents/Resources/PrivacyInfo.xcprivacy
codesign -d --entitlements - build/Build/Products/Debug/Eatit.app | grep -q "com.apple.security.app-sandbox"
codesign -d --entitlements - build/Build/Products/Debug/Eatit.app | grep -v "disable-library-validation"  # 应为空
codesign -d --entitlements - build/Build/Products/Debug/Eatit.app | grep -v "network.server"  # 应为空
```

**Commit.** `feat(F-401,F-406): land sandbox entitlements and privacy manifest stub`

---

## M1.X — tester audit M1 全段

**Lead Agent**: tester
**Helper Agents**: —
**Parallel-safe**: no
**Deps**: M1.1~M1.4

**Goal.** 独立复审 M1 全部 5 子节点(M1.1.arch + M1.1.dev + M1.2 + M1.3 + M1.4),输出 audit report。重点验证:
- Sandbox 真开启(`spctl --assess` 测试)
- TestFlight 链路真打通
- entitlements 不含禁项
- WKWebView 能加载 React build
- Bundle ID + Team ID 配置正确

**Files (new):**
- `eatit/.ralph/logs/M1.X-audit.md`

**Deliverables.**
- audit report 必含 4 段:✅ 优势 / 🔴 严重缺口 / 🟡 minor 缺口 / 整体评分 N/10
- 严重缺口若有 → 自动产生 M1.X.audit-fix 节点

**Acceptance.**
```bash
test -f .ralph/logs/M1.X-audit.md
grep -c "^## " .ralph/logs/M1.X-audit.md  # ≥ 4 个 H2 段
# 任何 🔴 严重缺口必须在 fix_plan 加新节点
```

**Commit.** `test(v34): audit M1 xcode scaffold`

---

# M2 — Swift Native Services

## M2.1.arch — Bridge 协议设计

**Lead Agent**: architect
**Helper Agents**: Explore(读 PRD §4.4 + 现有 `apps/desktop/src/api/` 结构)
**Parallel-safe**: no
**Deps**: M1.X

**Goal.** 出 design doc 明确 JS↔Swift Bridge 的协议形态:消息 schema(`BridgeRequest` / `BridgeResponse` / `BridgeEvent`)、18 个 method 完整签名、错误码命名约定、流式 method 的 streamId 协议、双端契约校验机制(Codable + Zod)。

**Files (new):**
- `eatit/.ralph/docs/v34-design/M2.1-bridge-protocol.md`

**Key Interfaces.** design doc 必含:

1. 三类消息形态(Request / Response / Event)的 JSON schema
2. 18 个 method 的完整签名表(对照 PRD §4.4.3)
3. 错误码命名:`<service>.<error-kind>`(如 `keychain.not-found` / `db.constraint-violation` / `llm.rate-limited`)
4. 流式协议:Request 创建 streamId → 多个 Event 推送 → 最后 Response { streamCompleted: true }
5. Codable + Zod 双端契约的 generation 策略(手写还是 codegen,本版选手写)
6. WebView messageHandler 注册名:`eatit`(`window.webkit.messageHandlers.eatit`)

**Deliverables.**
- `eatit/.ralph/docs/v34-design/M2.1-bridge-protocol.md`(~200 行)

**Acceptance.**
```bash
test -f .ralph/docs/v34-design/M2.1-bridge-protocol.md
grep -c "^### " .ralph/docs/v34-design/M2.1-bridge-protocol.md  # ≥ 6 个 H3
```

**Commit.** `docs(v34): design webkit bridge protocol`

---

## M2.1.dev — BridgeRouter + Codable + Zod 双端契约

**Lead Agent**: developer
**Helper Agents**: —
**Parallel-safe**: no
**Deps**: M2.1.arch

**Goal.** 落地 BridgeRouter Swift 端 + nativeBridge.ts JS 端,Codable / Zod 双端 schema 一致;暴露 `eatit.bridge.call(method, params)` JS API + Swift `BridgeRouter.register(method, handler)` 接口。本节点先暴露 1 个 echo 测试方法(`bridge.echo`)端到端跑通,7 个具体 service(M2.2~M2.8)分别注册各自方法。

**Files:**
- `apps/macos/Eatit/Bridge/BridgeRouter.swift`(new)
- `apps/macos/Eatit/Bridge/BridgeMessage.swift`(new)
- `apps/macos/Eatit/Bridge/BridgeError.swift`(new)
- `apps/macos/Eatit/WebViewController.swift`(modify — 注册 messageHandler)
- `apps/desktop/src/services/nativeBridge.ts`(new)
- `apps/desktop/src/services/__tests__/nativeBridge.test.ts`(new)
- `apps/macos/EatitTests/BridgeRouterTests.swift`(new)

**Key Interfaces.** 见 PRD §4.4.2 + M2.1.arch design doc。要点:

```swift
// BridgeRouter.swift
final class BridgeRouter: NSObject, WKScriptMessageHandlerWithReply {
    private var handlers: [String: (Any) async throws -> Any?] = [:]
    private weak var webView: WKWebView?

    func register<P: Decodable, R: Encodable>(
        method: String,
        handler: @escaping (P) async throws -> R
    ) { /* ... */ }

    func userContentController(_ ucc: WKUserContentController,
                                didReceive message: WKScriptMessage,
                                replyHandler: @escaping (Any?, String?) -> Void) async {
        /* ... 解析 BridgeRequest,调对应 handler,encode BridgeResponse */
    }

    func dispatchEvent(type: String, streamId: String, payload: Encodable) {
        // webView.evaluateJavaScript("window.eatitBridge.dispatch(...)")
    }
}
```

```ts
// nativeBridge.ts
import { z } from "zod";

const BridgeResponseOk = z.object({
  id: z.string(), ok: z.literal(true), data: z.unknown(),
});
const BridgeResponseErr = z.object({
  id: z.string(), ok: z.literal(false),
  error: z.object({ code: z.string(), message: z.string() }),
});
const BridgeResponse = z.union([BridgeResponseOk, BridgeResponseErr]);

class NativeBridge {
  async call<R>(method: string, params: unknown): Promise<R> {
    const id = crypto.randomUUID();
    const reply = await window.webkit.messageHandlers.eatit.postMessage({ id, method, params });
    const parsed = BridgeResponse.parse(reply);
    if (!parsed.ok) throw new BridgeError(parsed.error);
    return parsed.data as R;
  }

  on(eventType: string, handler: (e: BridgeEvent) => void): () => void { /* ... */ }
}

export const bridge = new NativeBridge();
```

**Deliverables.**
- Swift 端 BridgeRouter 注册 1 个测试方法 `bridge.echo`(回显)
- JS 端 `bridge.call("bridge.echo", { msg: "hi" })` 能拿回 `{ msg: "hi" }`
- 双端测试覆盖 happy + error path

**Acceptance.**
```bash
cd apps/macos
xcodebuild test -scheme Eatit -destination "platform=macOS" -only-testing:EatitTests/BridgeRouterTests 2>&1 | tail -10
# All Tests Passed
cd ../desktop
corepack pnpm test src/services/__tests__/nativeBridge.test.ts
# vitest passed
```

**Commit.** `feat(F-404): land bridge router and dual-side schema`

---

## M2.2 — KeychainService

**Lead Agent**: developer
**Helper Agents**: —
**Parallel-safe**: yes(与 M2.3/M2.4/M2.5 可并行)
**Deps**: M2.1.dev

**Goal.** 落地 macOS Keychain CRUD,通过 Bridge 暴露 `keychain.save / get / delete / exists` 4 个方法。注意 `keychain.get` 返回值不能直接含 secret(constraints §C3),仅供 Swift 内部消费——Bridge 层只回 `{ exists: true/false }`。

**Files:**
- `apps/macos/Eatit/Services/KeychainService.swift`(new)
- `apps/macos/Eatit/AppDelegate.swift`(modify — 注册 bridge methods)
- `apps/desktop/src/services/keychain.ts`(new)
- `apps/desktop/src/services/__tests__/keychain.test.ts`(new)
- `apps/macos/EatitTests/KeychainServiceTests.swift`(new)

**Key Interfaces.**

```swift
// KeychainService.swift
final class KeychainService {
    static let serviceName = "com.eatit.desktop"

    func save(account: String, secret: Data) throws { /* SecItemAdd */ }
    func read(account: String) throws -> Data? { /* SecItemCopyMatching */ }
    func delete(account: String) throws { /* SecItemDelete */ }
    func exists(account: String) -> Bool { (try? read(account: account)) != nil }
}

// AppDelegate.swift 注册
bridgeRouter.register(method: "keychain.save") { (req: KeychainSaveRequest) in
    try keychainService.save(account: req.account, secret: req.secret.data(using: .utf8)!)
    return EmptyResponse()
}
bridgeRouter.register(method: "keychain.exists") { (req: KeychainAccountRequest) in
    return KeychainExistsResponse(exists: keychainService.exists(account: req.account))
}
// 注意:不暴露 keychain.read 给 JS;LLMGateway/ASRGateway 直接 KeychainService 内部调
```

```ts
// keychain.ts
export const keychain = {
  save: (account: string, secret: string) =>
    bridge.call<void>("keychain.save", { account, secret }),
  exists: (account: string) =>
    bridge.call<{ exists: boolean }>("keychain.exists", { account }),
  delete: (account: string) =>
    bridge.call<void>("keychain.delete", { account }),
  // 注:无 get 方法。secret 只在 Swift 层消费,JS 永远不接触明文。
};
```

**Deliverables.**
- Swift KeychainService + 3 个 Bridge 方法(save/exists/delete)
- JS 端 keychain wrapper(无 get!)
- Settings 页"已配置"显示能用 `keychain.exists` 驱动

**Acceptance.**
```bash
cd apps/macos
xcodebuild test -scheme Eatit -destination "platform=macOS" -only-testing:EatitTests/KeychainServiceTests 2>&1 | tail -10
# All Tests Passed,覆盖 save / read / delete / exists / 重启不丢
cd ../desktop
corepack pnpm test src/services/__tests__/keychain.test.ts
# 注:JS 测试用 mock bridge,不真调 Keychain
```

**Commit.** `feat(F-404): implement keychain service`

---

## M2.3 — DatabaseService(GRDB.swift)

**Lead Agent**: developer
**Helper Agents**: Explore(读 GRDB.swift 文档 + 现有 SQLAlchemy schema)
**Parallel-safe**: yes
**Deps**: M2.1.dev

**Goal.** 落地 SQLite 持久化(GRDB.swift),通过 Bridge 暴露 `db.exec / query / tx` 3 个方法。本节点先实现框架 + 空 schema,具体表结构 M3 期间各 Agent 节点 incrementally 添加。

**Files:**
- `apps/macos/Eatit/Services/DatabaseService.swift`(new)
- `apps/macos/Eatit/Services/Migrations.swift`(new — 迁移脚本数组)
- `apps/macos/Eatit.xcodeproj/`(modify — 加 GRDB.swift SPM 依赖)
- `apps/desktop/src/services/db.ts`(new)
- `apps/desktop/src/services/__tests__/db.test.ts`(new)
- `apps/macos/EatitTests/DatabaseServiceTests.swift`(new)

**Key Interfaces.**

```swift
// DatabaseService.swift
import GRDB

final class DatabaseService {
    private let dbQueue: DatabaseQueue

    init() throws {
        let containerURL = try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask,
            appropriateFor: nil, create: true
        ).appendingPathComponent("Eatit", isDirectory: true)
        try FileManager.default.createDirectory(at: containerURL, withIntermediateDirectories: true)
        let dbURL = containerURL.appendingPathComponent("eatit.db")
        var config = Configuration()
        config.prepareDatabase { db in try db.execute(sql: "PRAGMA journal_mode = WAL") }
        dbQueue = try DatabaseQueue(path: dbURL.path, configuration: config)
        try applyMigrations()
    }

    func applyMigrations() throws {
        try dbQueue.write { db in
            for (version, sql) in MIGRATIONS {
                let current = try Int.fetchOne(db, sql: "PRAGMA user_version") ?? 0
                if version > current {
                    try db.execute(sql: sql)
                    try db.execute(sql: "PRAGMA user_version = \(version)")
                }
            }
        }
    }

    func exec(sql: String, params: [DatabaseValueConvertible]) async throws -> ExecResult { /* ... */ }
    func query(sql: String, params: [DatabaseValueConvertible]) async throws -> [[String: Any]] { /* ... */ }
    func tx(statements: [Statement]) async throws { /* ... */ }
}
```

```swift
// Migrations.swift(M2.3 落空数组,M3 起加)
let MIGRATIONS: [(version: Int, sql: String)] = [
    // M3 起逐 Agent 添加:sessions / turns / parse_results / ...
]
```

**Deliverables.**
- DatabaseService 在 sandbox container 创建 SQLite WAL 库
- Bridge 暴露 db.exec / query / tx
- migrations 框架就绪(空数组),M3 各 Agent 节点 PR 时追加 migration

**Acceptance.**
```bash
cd apps/macos
xcodebuild test -scheme Eatit -destination "platform=macOS" -only-testing:EatitTests/DatabaseServiceTests 2>&1 | tail -10
# All Tests Passed,覆盖:DB 创建 / WAL 模式 / 迁移幂等(跑两次)
```

**Commit.** `feat(F-404): implement database service via grdb`

---

## M2.4 — FilePickerService

**Lead Agent**: developer
**Helper Agents**: —
**Parallel-safe**: yes
**Deps**: M2.1.dev

**Goal.** 落地 NSOpenPanel + WebView 内拖拽接收(WKWebView 默认行为 + Swift 拦截),通过 Bridge 暴露 `file.pick / file.dropEnable` 2 个方法。返回值含 `{name, size, base64}`,base64 后续给 PDFParser 消费。

**Files:**
- `apps/macos/Eatit/Services/FilePickerService.swift`(new)
- `apps/macos/Eatit/WebViewController.swift`(modify — 处理 drop)
- `apps/desktop/src/services/file.ts`(new)
- `apps/desktop/src/services/__tests__/file.test.ts`(new)
- `apps/macos/EatitTests/FilePickerServiceTests.swift`(new)

**Key Interfaces.**

```swift
// FilePickerService.swift
final class FilePickerService {
    func pick(accept: [String]?, multiple: Bool) async -> [PickedFile] {
        await MainActor.run {
            let panel = NSOpenPanel()
            panel.allowsMultipleSelection = multiple
            panel.allowedContentTypes = (accept ?? []).compactMap { UTType(filenameExtension: $0) }
            panel.canChooseFiles = true
            panel.canChooseDirectories = false
            guard panel.runModal() == .OK else { return [] }
            return panel.urls.compactMap(toPickedFile)
        }
    }
}

struct PickedFile: Encodable { let name: String; let size: Int; let base64: String }
```

**Deliverables.**
- 用户能在 Upload 页点击"选择文件"弹 NSOpenPanel
- 支持拖拽 .pdf / .docx / .txt 到 WebView 内,Swift 拦截后通过 BridgeEvent 推 JS

**Acceptance.**
```bash
cd apps/macos
xcodebuild test -scheme Eatit -destination "platform=macOS" -only-testing:EatitTests/FilePickerServiceTests 2>&1 | tail -10
# 注:NSOpenPanel UI 测试需要 GUI runtime,本节点先 mock 测试 base64 编码逻辑;手工验证 UI
```

**Commit.** `feat(F-404): implement file picker service`

---

## M2.5 — PDFParserService(PDFKit)

**Lead Agent**: developer
**Helper Agents**: —
**Parallel-safe**: yes
**Deps**: M2.1.dev

**Goal.** 落地 PDFKit 文本抽取,通过 Bridge 暴露 `pdf.extractText`。输入 base64,输出 `{text, pageCount}`。

**Files:**
- `apps/macos/Eatit/Services/PDFParserService.swift`(new)
- `apps/desktop/src/services/pdf.ts`(new)
- `apps/desktop/src/services/__tests__/pdf.test.ts`(new)
- `apps/macos/EatitTests/PDFParserServiceTests.swift`(new)
- `apps/macos/EatitTests/Resources/sample.pdf`(new — 测试用 PDF)

**Key Interfaces.**

```swift
// PDFParserService.swift
import PDFKit

final class PDFParserService {
    func extractText(base64: String) -> PDFExtractResult? {
        guard let data = Data(base64Encoded: base64),
              let pdf = PDFDocument(data: data) else { return nil }
        var text = ""
        for i in 0..<pdf.pageCount {
            text += pdf.page(at: i)?.string ?? ""
        }
        return PDFExtractResult(text: text, pageCount: pdf.pageCount)
    }
}
```

**Deliverables.**
- 1 份测试 sample.pdf + extractText 调用能正确抽出文本
- pageCount 与 PDF 页数一致

**Acceptance.**
```bash
cd apps/macos
xcodebuild test -scheme Eatit -destination "platform=macOS" -only-testing:EatitTests/PDFParserServiceTests 2>&1 | tail -10
```

**Commit.** `feat(F-404): implement pdf parser service`

---

## M2.6 — AudioCaptureService(AVAudioEngine)

**Lead Agent**: developer
**Helper Agents**: Explore(读 AVAudioEngine 文档 + 16kHz mono PCM 采样配置 + 火山 ASR 200ms 包大小要求)
**Parallel-safe**: no(与 M2.7/M2.8 ASR 通路强耦合,严格串行避免冲突)
**Deps**: M2.1.dev

**Goal.** 落地 AVAudioEngine 麦克风录音 → 16kHz mono PCM 16-bit LE → 200ms (6400 bytes) 一包,通过 internal callback 推送(M2.8 ASRGateway 注册 callback 直接消费,不经 JS),通过 Bridge 暴露 `audio.start / stop` 2 个方法控制开关。

**Files:**
- `apps/macos/Eatit/Services/AudioCaptureService.swift`(new)
- `apps/desktop/src/services/audio.ts`(new)
- `apps/desktop/src/services/__tests__/audio.test.ts`(new)
- `apps/macos/EatitTests/AudioCaptureServiceTests.swift`(new)

**Key Interfaces.**

```swift
// AudioCaptureService.swift
import AVFoundation

final class AudioCaptureService {
    private let engine = AVAudioEngine()
    private var converter: AVAudioConverter?
    private var pcmCallback: ((Data) -> Void)?

    func start(streamId: String, onPCMChunk: @escaping (Data) -> Void) async throws {
        // 麦克风权限请求
        let granted = await AVCaptureDevice.requestAccess(for: .audio)
        guard granted else { throw AudioError.permissionDenied }

        let input = engine.inputNode
        let inputFormat = input.outputFormat(forBus: 0)
        let outputFormat = AVAudioFormat(commonFormat: .pcmFormatInt16,
                                         sampleRate: 16000, channels: 1,
                                         interleaved: true)!
        converter = AVAudioConverter(from: inputFormat, to: outputFormat)
        pcmCallback = onPCMChunk

        let bufferSize: AVAudioFrameCount = 3200  // 200ms @ 16kHz
        input.installTap(onBus: 0, bufferSize: bufferSize, format: inputFormat) { [weak self] buffer, _ in
            guard let self, let converter = self.converter else { return }
            // 转换 + 切包到 200ms = 6400 bytes
            // ... 略
            if let chunk = self.tryEmitChunk() { self.pcmCallback?(chunk) }
        }
        try engine.start()
    }

    func stop() { engine.stop(); engine.inputNode.removeTap(onBus: 0); pcmCallback = nil }
}
```

**Deliverables.**
- AVAudioEngine 录音 → 16kHz mono PCM 16-bit LE
- 切包到 200ms / 6400 bytes(火山 ASR 标准)
- 麦克风权限弹窗(NSMicrophoneUsageDescription 文案见 M1.4)

**Acceptance.**
```bash
cd apps/macos
xcodebuild test -scheme Eatit -destination "platform=macOS" -only-testing:EatitTests/AudioCaptureServiceTests 2>&1 | tail -10
# 测试:format 转换正确性 + chunk 大小 = 6400 bytes
# 真录音测试需要 GUI,手工验证
```

**Commit.** `feat(F-403,F-404): implement audio capture service`

---

## M2.7.arch — LLMGateway SSE 设计

**Lead Agent**: architect
**Helper Agents**: Explore(读火山方舟 ARK Chat Completions 文档 + URLSession bytes(for:) SSE 处理)
**Parallel-safe**: no
**Deps**: M2.1.dev

**Goal.** 出 design doc 明确 LLMGateway 的接口形态:同步调用 / 流式 SSE / 错误重试 / Authorization header 注入(从 Keychain 读 ARK_API_KEY)/ Bridge stream event 协议 / Vercel AI SDK 在 JS 端如何接驳。

**Files (new):**
- `eatit/.ralph/docs/v34-design/M2.7-llm-gateway.md`

**Key Interfaces.** design doc 必含:

1. ARK Chat Completions endpoint + request/response schema
2. URLSession `bytes(for:)` SSE line-by-line 解析模式
3. 错误重试策略(429 / 500 / 503 → 指数退避 3 次)
4. Bridge method 签名:
   - `llm.chat({ messages, model, temperature, response_format, tools })` → `{ content, tool_calls, usage }`(同步,内部 stream=false)
   - `llm.chatStream({ messages, ... }, streamId)` → 通过 `stream-chunk` event 推送 delta,完成后 `stream-end` event
5. Vercel AI SDK 接驳点:`createDataStream` 自定义 Transformer 把 BridgeEvent 转成 AI SDK 期望的 stream 格式

**Deliverables.**
- `eatit/.ralph/docs/v34-design/M2.7-llm-gateway.md`(~150 行)

**Acceptance.**
```bash
test -f .ralph/docs/v34-design/M2.7-llm-gateway.md
grep -c "^### " .ralph/docs/v34-design/M2.7-llm-gateway.md  # ≥ 5
```

**Commit.** `docs(v34): design llm gateway sse streaming`

---

## M2.7.dev — LLMGateway 实施 + ARK 接通

**Lead Agent**: developer
**Helper Agents**: —
**Parallel-safe**: no
**Deps**: M2.7.arch

**Goal.** 落地 Swift LLMGateway,Bridge 暴露 `llm.chat / chatStream` 2 个方法,真调火山 ARK 一次成功(用测试 Key)。

**Files:**
- `apps/macos/Eatit/Services/LLMGateway.swift`(new)
- `apps/macos/Eatit/Bridge/Models/LLMMessages.swift`(new — Codable struct)
- `apps/desktop/src/services/llm.ts`(new — Bridge 包装)
- `apps/desktop/src/__tests__/llmGateway.contract.test.ts`(new)
- `apps/macos/EatitTests/LLMGatewayTests.swift`(new — mock URLProtocol)

**Key Interfaces.** 见 PRD §4.5.1 + M2.7.arch design doc。要点:

```swift
// LLMGateway.swift
final class LLMGateway {
    private let baseURL = URL(string: "https://ark.cn-beijing.volces.com/api/v3/chat/completions")!
    private let keychain: KeychainService
    private let session: URLSession

    func chat(_ req: ChatCompletionRequest) async throws -> ChatCompletionResponse {
        var urlReq = URLRequest(url: baseURL)
        urlReq.httpMethod = "POST"
        let key = try keychain.read(account: "ark-api-key")
            .flatMap { String(data: $0, encoding: .utf8) } ?? ""
        urlReq.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        urlReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlReq.httpBody = try JSONEncoder().encode(req)
        let (data, response) = try await session.data(for: urlReq)
        return try decodeOrRetry(data, response: response)
    }

    func chatStream(_ req: ChatCompletionRequest, streamId: String,
                    onDelta: @escaping (ChatChunk) -> Void) async throws {
        var urlReq = /* 同上 + req.stream = true */
        let (bytes, _) = try await session.bytes(for: urlReq)
        for try await line in bytes.lines {
            guard line.hasPrefix("data: ") else { continue }
            let payload = String(line.dropFirst(6))
            if payload == "[DONE]" { break }
            let chunk = try JSONDecoder().decode(ChatChunk.self, from: Data(payload.utf8))
            onDelta(chunk)
        }
    }
}
```

**Deliverables.**
- LLMGateway 调通 ARK Chat Completions 一次(`gpt`-style "你好" → 真返回)
- chatStream 流式 delta 通过 Bridge event 推送到 JS,JS 端 vitest 用 mock URLProtocol 验证 SSE 解析正确

**Acceptance.**
```bash
cd apps/macos
xcodebuild test -scheme Eatit -destination "platform=macOS" -only-testing:EatitTests/LLMGatewayTests 2>&1 | tail -10
cd ../desktop
corepack pnpm test src/__tests__/llmGateway.contract.test.ts
```

**Commit.** `feat(F-402,F-404): implement llm gateway with volcengine ark`

---

## M2.8.arch — ASRGateway WS 设计

**Lead Agent**: architect
**Helper Agents**: Explore(读火山 SAUC bigmodel 二进制帧协议详细文档)
**Parallel-safe**: no
**Deps**: M2.6

**Goal.** 出 design doc 明确 ASRGateway 的二进制 WebSocket 协议处理:首帧 full-client-request 配置 / 后续音频帧 4-byte custom header + gzip 标志 / 接收端 partial(`definite=false`)与 final(`definite=true`)两种 result 类型 / 通过 Bridge stream event 推送给 JS 的格式。

**Files (new):**
- `eatit/.ralph/docs/v34-design/M2.8-asr-gateway.md`

**Key Interfaces.** design doc 必含:

1. WebSocket upgrade 时的 4 个鉴权 header 注入(从 Keychain 读 `volc-asr-credentials` JSON)
2. 首帧 full-client-request 二进制布局:
   - 4-byte header: `[0x10, 0x10, 0x11, 0x00]`
   - JSON payload: `audio.format/rate/channels` + `request.model_name/enable_itn/enable_punc`
3. 音频帧二进制布局:`[0x11, 0x10, 0x11, 0x00] + PCM_chunk(6400 bytes)`
4. 接收解析:result.utterances[].definite 字段判断 partial vs final
5. 错误处理:WS 断连重连策略 + 火山限流 1011 close code 处理
6. Bridge event:`asr.partial { streamId, text, definite: false }` / `asr.final { streamId, text, definite: true }`

**Deliverables.**
- `eatit/.ralph/docs/v34-design/M2.8-asr-gateway.md`(~200 行)

**Acceptance.**
```bash
test -f .ralph/docs/v34-design/M2.8-asr-gateway.md
grep -c "^### " .ralph/docs/v34-design/M2.8-asr-gateway.md  # ≥ 6
```

**Commit.** `docs(v34): design asr gateway websocket framing`

---

## M2.8.dev — ASRGateway 实施 + 火山 SAUC 接通

**Lead Agent**: developer
**Helper Agents**: —
**Parallel-safe**: no
**Deps**: M2.8.arch

**Goal.** 落地 Swift ASRGateway + WebSocket 直连火山 SAUC bigmodel,从 AudioCaptureService 拿 PCM chunk 推流,partial / final 结果通过 Bridge event 推 JS。本节点用 mock WebSocket server 单测 + 真实 SAUC 一次冒烟。

**Files:**
- `apps/macos/Eatit/Services/ASRGateway.swift`(new)
- `apps/macos/Eatit/Bridge/Models/ASRMessages.swift`(new — Codable struct + 二进制帧打包/解包)
- `apps/desktop/src/services/asr.ts`(new — Bridge 包装,提供 AsyncIterator)
- `apps/desktop/src/__tests__/asrGateway.contract.test.ts`(new)
- `apps/macos/EatitTests/ASRGatewayTests.swift`(new — mock URLSessionWebSocketTask)

**Key Interfaces.** 见 PRD §4.5.2 + M2.8.arch design doc。要点:

```swift
// ASRGateway.swift
final class ASRGateway {
    private let endpoint = URL(string: "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel")!
    private var task: URLSessionWebSocketTask?
    private let keychain: KeychainService

    func start(streamId: String) async throws {
        guard let credsData = try keychain.read(account: "volc-asr-credentials"),
              let creds = try? JSONDecoder().decode(VolcAsrCreds.self, from: credsData) else {
            throw ASRError.credentialsMissing
        }

        var req = URLRequest(url: endpoint)
        req.setValue(creds.appId, forHTTPHeaderField: "X-Api-App-Key")
        req.setValue(creds.accessToken, forHTTPHeaderField: "X-Api-Access-Key")
        req.setValue("volc.bigasr.sauc.duration", forHTTPHeaderField: "X-Api-Resource-Id")
        req.setValue(UUID().uuidString, forHTTPHeaderField: "X-Api-Connect-Id")

        let task = URLSession.shared.webSocketTask(with: req)
        task.resume()
        self.task = task

        // 首帧 full-client-request
        let configFrame = makeFullClientRequest()
        try await task.send(.data(configFrame))

        // 接收循环
        Task { try await self.receiveLoop(streamId: streamId) }
    }

    func feedPCM(_ pcm: Data) async throws {
        guard let task else { return }
        let frame = Data([0x11, 0x10, 0x11, 0x00]) + pcm
        try await task.send(.data(frame))
    }

    func stop() { task?.cancel(with: .normalClosure, reason: nil); task = nil }

    private func receiveLoop(streamId: String) async throws {
        guard let task else { return }
        while true {
            let msg = try await task.receive()
            // 解析二进制帧 → ASRResult
            if let result = parseResult(msg) {
                let event = result.utterances.last?.definite == true
                    ? "asr.final" : "asr.partial"
                bridgeRouter.dispatchEvent(type: event, streamId: streamId,
                                            payload: ASRPartialPayload(text: result.text))
            }
        }
    }
}
```

```ts
// asr.ts
export async function* startStreamingAsr(): AsyncIterableIterator<ASRPartial> {
  const streamId = crypto.randomUUID();
  await bridge.call("asr.start", { streamId });
  const queue: ASRPartial[] = [];
  let resolve: ((v: void) => void) | null = null;
  const off = bridge.on("asr.partial", e => { if (e.streamId === streamId) { queue.push(e.payload); resolve?.(); } });
  // ... 略
  yield* /* 异步生成 */;
  off();
  await bridge.call("asr.stop", { streamId });
}
```

**Deliverables.**
- ASRGateway 能与火山 SAUC 建立 WS 连接(测试 AppID/Token 由开发者本地配)
- 推 PCM 200ms 包能收到 partial 文本
- JS 端 `for await (const partial of startStreamingAsr())` 能拿到流式中间稿

**Acceptance.**
```bash
cd apps/macos
xcodebuild test -scheme Eatit -destination "platform=macOS" -only-testing:EatitTests/ASRGatewayTests 2>&1 | tail -10
# Mock WS 协议测试通过
cd ../desktop
corepack pnpm test src/__tests__/asrGateway.contract.test.ts
# Mock bridge event 测试通过

# 手工冒烟:配测试 AppID/Token 后,跑 macOS app,在 dev 模式 console 调
# bridge.call("asr.start", { streamId: "test" }) → 推 PCM → 看 partial 输出
```

**Commit.** `feat(F-403,F-404): implement asr gateway with volcengine sauc`

---

## M2.X — tester audit M2 全段

**Lead Agent**: tester
**Helper Agents**: —
**Parallel-safe**: no
**Deps**: M2.1~M2.8 全部

**Goal.** 独立复审 M2 全部 12 子节点,重点:
- 7 个 Swift Service 行覆盖率 ≥ 80%
- Bridge 协议双端契约一致性(每个 method JS 端 Zod schema 与 Swift Codable 字段精确对齐)
- API Key 不泄漏(grep `Authorization: Bearer` 仅在 LLMGateway.swift / ASRGateway.swift 内出现)
- entitlements 仍只含 4 项(没有人在 M2 期间偷加 disable-library-validation)
- 火山 ARK + SAUC 真实接通各一次(M2.7.dev / M2.8.dev 末尾应当各跑过)

**Files (new):**
- `eatit/.ralph/logs/M2.X-audit.md`

**Deliverables.**
- audit report 4 段(优势 / 🔴 / 🟡 / 评分 N/10)
- 严重缺口产 M2.X.audit-fix 节点

**Acceptance.**
```bash
test -f .ralph/logs/M2.X-audit.md
# 评分 ≥ 7/10 才能进 M3
grep -E "整体评分.*[7-9]/10|10/10" .ralph/logs/M2.X-audit.md
```

**Commit.** `test(v34): audit M2 swift services`

---

# M3 — 后端逻辑迁 TS

> M3 是 v3.4 重构的最大节点,3-4 周。子节点拆分原则:
> - **M3.1** 基础设施(Zod + Vercel AI SDK + LangGraph.js Hello World)
> - **M3.2** 4 个简单 Agent(Parse / Reference / Compression / Observer,Parallel-safe)
> - **M3.3** 核心 Agent + LangGraph.js 三图(节点名锁 L0,**tester 必须 re-audit**)
> - **M3.4** 流式 ASR 接入 InterviewPage(端到端关键路径,**tester 必须 re-audit**)

## M3.1.1 — Zod schemas × 11

**Lead Agent**: developer
**Helper Agents**: Explore(对照 `apps/api/app/schemas/*.py` 11 个 Pydantic schema)
**Parallel-safe**: no
**Deps**: M2.X

**Goal.** 把 Python 的 11 个 Pydantic schema 一一对应翻译为 Zod。覆盖:assets / common / frameworks / meta_reports / parse / reports / sessions / turns + 三个 Agent 子 schema(coach / reflection / research)。每个 schema 必加 `.strict()`(对应 `extra="forbid"`)。

**Files:**
- `apps/desktop/src/core/schemas/assets.ts`(new)
- `apps/desktop/src/core/schemas/common.ts`(new)
- `apps/desktop/src/core/schemas/frameworks.ts`(new)
- `apps/desktop/src/core/schemas/meta_reports.ts`(new)
- `apps/desktop/src/core/schemas/parse.ts`(new)
- `apps/desktop/src/core/schemas/reports.ts`(new)
- `apps/desktop/src/core/schemas/sessions.ts`(new)
- `apps/desktop/src/core/schemas/turns.ts`(new)
- `apps/desktop/src/core/schemas/coach.ts`(new)
- `apps/desktop/src/core/schemas/reflection.ts`(new)
- `apps/desktop/src/core/schemas/research.ts`(new)
- `apps/desktop/src/core/schemas/index.ts`(new — barrel)
- `apps/desktop/src/core/schemas/__tests__/contracts.test.ts`(new — 各 schema 锁断言:5 维度 / 4 人格 / 7 填充词 / 3 档 pass_likelihood / 12 禁止词 fuzz)

**Key Interfaces.** 关键锁:

```ts
// reports.ts
export const DimensionNameSchema = z.union([
  z.literal("专业深度"), z.literal("结构化表达"), z.literal("批判性思考"),
  z.literal("业务直觉"), z.literal("沟通节奏"),
]);

export const InterviewReportSchema = z.object({
  dimensions: z.array(DimensionScoreSchema).length(5),  // 严格 = 5
  pass_likelihood: z.union([z.literal("中上"), z.literal("中"), z.literal("中下")]).nullable(),
  // ... 其他字段
}).strict();
```

```ts
// research.ts(隐私护栏)
export const ResearchInputSchema = z.object({
  company_name: z.string(),
  role_title: z.string(),
  industry_hints: z.array(z.string()).max(5),
}).strict();  // L0 红线 11:严禁额外字段
```

**Deliverables.**
- 11 个 Zod schema 文件
- Vitest 全过(锁断言)

**Acceptance.**
```bash
cd apps/desktop
corepack pnpm exec tsc --noEmit
corepack pnpm test src/core/schemas/__tests__/contracts.test.ts
# Tests: 12 passed (5 维度 + 4 人格 + 7 填充词 + 3 档 + 12 禁止词 fuzz)
```

**Commit.** `feat(F-405): port pydantic schemas to zod`

---

## M3.1.2 — LLM provider 抽象 + ARK provider TS

**Lead Agent**: developer
**Helper Agents**: —
**Parallel-safe**: no
**Deps**: M3.1.1, M2.7.dev

**Goal.** 落地 LLM provider 抽象 + ARK provider 实现,通过 Bridge 调 Swift LLMGateway。包装 Vercel AI SDK 的 `generateObject`(Instructor 等价)用于 structured output。

**Files:**
- `apps/desktop/src/core/llm/types.ts`(new — `LLMProvider` interface)
- `apps/desktop/src/core/llm/arkProvider.ts`(new — 实现)
- `apps/desktop/src/core/llm/instructor.ts`(new — `generateObject` 包装)
- `apps/desktop/src/core/llm/index.ts`(new — barrel)
- `apps/desktop/src/core/llm/__tests__/arkProvider.test.ts`(new — mock bridge)

**Key Interfaces.**

```ts
// types.ts
export interface LLMProvider {
  chat(req: ChatRequest): Promise<ChatResponse>;
  chatStream(req: ChatRequest): AsyncIterableIterator<ChatChunk>;
  generateObject<T>(req: { schema: z.ZodSchema<T>; messages: Message[]; model?: string }): Promise<T>;
}

// arkProvider.ts
export class ArkProvider implements LLMProvider {
  async chat(req) { return bridge.call("llm.chat", req); }
  async *chatStream(req) { /* 通过 BridgeEvent stream-chunk yield */ }
  async generateObject<T>({ schema, messages, model }) {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await this.chat({ messages, model, response_format: { type: "json_object" } });
      const parsed = schema.safeParse(JSON.parse(res.content));
      if (parsed.success) return parsed.data;
      lastError = parsed.error;
      messages = [...messages, { role: "user", content: `Validation error: ${parsed.error.message}. Please correct and re-emit JSON only.` }];
    }
    throw lastError ?? new Error("generateObject failed");
  }
}
```

**Deliverables.**
- ARK provider 调通,JS 端 `await provider.generateObject({ schema: ParseOutputSchema, messages: [...] })` 拿到 typed object
- generateObject 自动 retry-on-validation-fail(Instructor 等价)

**Acceptance.**
```bash
cd apps/desktop
corepack pnpm test src/core/llm/__tests__/arkProvider.test.ts
# happy path + 1 次 validation 失败重试成功的 case
```

**Commit.** `feat(F-402,F-405): land ark llm provider via swift bridge`

---

## M3.1.3 — LangGraph.js 接入 + Hello World graph

**Lead Agent**: developer
**Helper Agents**: Explore(读 `@langchain/langgraph` v0.2 文档 + StateGraph API)
**Parallel-safe**: no
**Deps**: M3.1.2

**Goal.** 安装 `@langchain/langgraph` + 写一个最小 Hello World StateGraph(2 节点 a → b)验证 LangGraph.js 在 vitest / WKWebView 内都能跑通。

**Files:**
- `apps/desktop/package.json`(modify — add `@langchain/langgraph`)
- `apps/desktop/src/core/graphs/_smoke.ts`(new — Hello World)
- `apps/desktop/src/core/graphs/__tests__/smoke.test.ts`(new)

**Key Interfaces.**

```ts
import { StateGraph, START, END } from "@langchain/langgraph";

interface SmokeState { greeting: string }

const graph = new StateGraph<SmokeState>({
  channels: { greeting: { value: (l, r) => r ?? l } },
})
  .addNode("a", async () => ({ greeting: "Hello" }))
  .addNode("b", async (s) => ({ greeting: `${s.greeting}, Eatit!` }))
  .addEdge(START, "a")
  .addEdge("a", "b")
  .addEdge("b", END)
  .compile();

export { graph as smokeGraph };
```

**Deliverables.**
- LangGraph.js 装好,Hello World 跑通
- 验证 `graph.invoke({ greeting: "" })` 输出 `{ greeting: "Hello, Eatit!" }`

**Acceptance.**
```bash
cd apps/desktop
corepack pnpm test src/core/graphs/__tests__/smoke.test.ts
```

**Commit.** `feat(F-405): bootstrap langgraph.js`

---

## M3.2.1 ~ M3.2.4 — 4 个简单 Agent (TS)

> 这 4 个节点 **Parallel-safe**,可由用户启 4 个 Ralph 实例并行跑。

### M3.2.1 — Parse Agent (TS)

**Lead Agent**: developer
**Helper Agents**: Explore(读 `apps/api/app/agents/parse/`)
**Parallel-safe**: yes
**Deps**: M3.1.*

**Goal.** 把 Python `app/agents/parse/service.py` 翻译为 TS,接 Zod schema + ARK provider + `generateObject` retry。包含 v3.3 隐私护栏:Research 输入只含 jd_company_name / jd_role_title / jd_industry_hints,不能含 resume_text。

**Files:**
- `apps/desktop/src/core/agents/parse/index.ts`(new)
- `apps/desktop/src/core/agents/parse/prompts.ts`(new — 系统/用户 prompt 从 `apps/api/app/prompts/parse/` 翻译)
- `apps/desktop/src/core/agents/parse/__tests__/parseAgent.test.ts`(new)

**Key Interfaces.**

```ts
import { ParseInputSchema, ParseOutputSchema, type ParseInput, type ParseOutput } from "@/core/schemas/parse";
import { systemPrompt, userPrompt } from "./prompts";

export interface ParseAgentDeps {
  llm: LLMProvider;
  logger?: Logger;
}

export async function runParseAgent(input: ParseInput, deps: ParseAgentDeps): Promise<ParseOutput> {
  const validated = ParseInputSchema.parse(input);
  const messages = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: userPrompt(validated) },
  ];
  return deps.llm.generateObject({ schema: ParseOutputSchema, messages, model: "doubao-seed-1-6-250615" });
}
```

**Deliverables.**
- runParseAgent 能产出符合 ParseOutputSchema 的对象
- 测试覆盖:happy / Zod 校验失败重试 / 12 禁止词扫描

**Acceptance.**
```bash
cd apps/desktop
corepack pnpm test src/core/agents/parse/__tests__/parseAgent.test.ts
```

**Commit.** `feat(F-405): port parse agent to typescript`

---

### M3.2.2 / M3.2.3 / M3.2.4 — Reference / Compression / Observer Agent

> 三个节点 spec 与 M3.2.1 完全同构(Lead Agent / Files / Acceptance / Commit 模式一致),只是被翻译的 Agent 不同。Parallel-safe = yes。

按 M3.2.1 模板,分别落:

- **M3.2.2 Reference Agent** — `core/agents/reference/`(对应 `app/agents/reference/`)
- **M3.2.3 Compression Agent** — `core/agents/compression/`(注意:asyncio.wait_for 3s 翻译为 `Promise.race` + AbortController)
- **M3.2.4 Observer Agent** — `core/agents/observer/`(注意:fillerWords 7 词锁继续生效,见 constraints §F)

每个节点 commit:`feat(F-405): port <agent> agent to typescript`

---

## M3.3.1.arch — turn_graph 设计

**Lead Agent**: architect
**Helper Agents**: Explore(读 `apps/api/app/orchestrator/turn_graph.py` + LangGraph.js StateGraph 文档)
**Parallel-safe**: no
**Deps**: M3.2.*

**Goal.** 出 design doc:turn_graph 三节点(turn_assessment / compression / next_question)在 LangGraph.js 中的 StateGraph 实现策略 — Channel 类型 / 并行边 / Interviewer Agent 集成。**节点名严格锁**:`{turn_assessment, compression, next_question}`,任何重命名 = 立即报告(L0 红线 13)。

**Files (new):**
- `eatit/.ralph/docs/v34-design/M3.3.1-turn-graph.md`

**Key Interfaces.** design doc 必含:

1. TurnState TS 接口(对应 Python 版 TurnState dataclass)
2. Channel reducers(每个字段如何 merge)
3. 三节点 Function 签名
4. 并行边(START → turn_assessment & compression,二者独立完成后 → next_question → END)
5. Interviewer Agent 在 next_question 节点内的调用方式
6. 节点名锁断言测试 spec

**Deliverables.**
- `eatit/.ralph/docs/v34-design/M3.3.1-turn-graph.md`(~150 行)

**Acceptance.**
```bash
test -f .ralph/docs/v34-design/M3.3.1-turn-graph.md
```

**Commit.** `docs(v34): design turn_graph in langgraph.js`

---

## M3.3.1.dev — turn_graph + Interviewer Agent

**Lead Agent**: developer
**Helper Agents**: —
**Parallel-safe**: no
**Deps**: M3.3.1.arch

**Goal.** 落地 turn_graph + Interviewer Agent,通过节点名锁 contract test。

**Files:**
- `apps/desktop/src/core/graphs/turnGraph.ts`(new)
- `apps/desktop/src/core/agents/interviewer/index.ts`(new)
- `apps/desktop/src/core/agents/interviewer/prompts.ts`(new)
- `apps/desktop/src/core/agents/interviewer/personas.ts`(new — 4 人格名锁)
- `apps/desktop/src/__tests__/turnGraph.contract.test.ts`(new — 节点名锁)
- `apps/desktop/src/__tests__/interviewerAgent.test.ts`(new)

**Key Interfaces.**

```ts
// turnGraph.ts
export const TURN_GRAPH_NODES = Object.freeze(
  new Set(["turn_assessment", "compression", "next_question"])
);

export function buildTurnGraph(deps: TurnGraphDeps) {
  const graph = new StateGraph<TurnState>({ channels: TurnStateChannels })
    .addNode("turn_assessment", async (s) => assessTurn(s, deps))
    .addNode("compression", async (s) => compressTurn(s, deps))
    .addNode("next_question", async (s) => generateNextQuestion(s, deps))
    .addEdge(START, "turn_assessment")
    .addEdge(START, "compression")
    .addEdge("turn_assessment", "next_question")
    .addEdge("compression", "next_question")
    .addEdge("next_question", END);
  return graph.compile();
}
```

```ts
// personas.ts
export const PERSONA_MAP = Object.freeze({
  structured: "Sarah",
  pressure: "Marcus",
  friendly: "Lin",
  expert: "Daniel",
} as const);
```

**Deliverables.**
- turn_graph 三节点跑通(mock LLM)
- Interviewer Agent 输出 `live_observation` ≤ 30 字 + `followup_hints` 2-3 个 ≤ 8 字
- 节点名锁 + Persona 4 名锁测试通过

**Acceptance.**
```bash
cd apps/desktop
corepack pnpm test src/__tests__/turnGraph.contract.test.ts
corepack pnpm test src/__tests__/interviewerAgent.test.ts
```

**Commit.** `feat(F-405): land turn_graph with locked node names`

---

## M3.3.2.arch / M3.3.2.dev — intake_graph + Framework + Research

**Lead Agent (.arch)**: architect | **(.dev)**: developer
**Helper Agents**: Explore
**Parallel-safe**: no
**Deps**: M3.3.1.dev

**Goal.** intake_graph 三节点(`parse_node` → `research_node` → `predict_questions_node`,sequential)落地。Research Agent 仅在 `app_settings.research_opt_in = true` 时运行,且输入严格 strict()(隐私护栏 L0 红线 11)。

**Files (.arch):**
- `eatit/.ralph/docs/v34-design/M3.3.2-intake-graph.md`(new)

**Files (.dev):**
- `apps/desktop/src/core/graphs/intakeGraph.ts`(new)
- `apps/desktop/src/core/agents/framework/index.ts`(new)
- `apps/desktop/src/core/agents/framework/prompts.ts`(new)
- `apps/desktop/src/core/agents/research/index.ts`(new — 注意 strict 隐私护栏)
- `apps/desktop/src/core/agents/research/prompts.ts`(new)
- `apps/desktop/src/__tests__/intakeGraph.contract.test.ts`(new — 节点名锁)
- `apps/desktop/src/__tests__/researchAgent.privacy.test.ts`(new — fuzz 输入,验证 .strict() 拒绝任何 PII 字段)

**Acceptance:**
```bash
cd apps/desktop
corepack pnpm test src/__tests__/intakeGraph.contract.test.ts
corepack pnpm test src/__tests__/researchAgent.privacy.test.ts
```

**Commit (.arch):** `docs(v34): design intake_graph in langgraph.js`
**Commit (.dev):** `feat(F-405): land intake_graph with research opt-in`

---

## M3.3.3.arch / M3.3.3.dev — post_report_graph + Coach + Reflection + Report

**Lead Agent (.arch)**: architect | **(.dev)**: developer
**Helper Agents**: Explore
**Parallel-safe**: no
**Deps**: M3.3.2.dev

**Goal.** post_report_graph 二节点(`coach_node` ‖ `reflection_node`,parallel)+ Coach Agent + Reflection Agent + Report Agent 全部落地。Coach 跨 session 异步 + Reflection 单场教学复盘 + Report 主报告 — Coach/Reflection 的 fire-and-forget 用 `Promise(...).catch(noop)` 实现,不阻塞主流程。

**Files (.arch):**
- `eatit/.ralph/docs/v34-design/M3.3.3-post-report-graph.md`(new)

**Files (.dev):**
- `apps/desktop/src/core/graphs/postReportGraph.ts`(new)
- `apps/desktop/src/core/agents/coach/index.ts`(new — 教学护栏)
- `apps/desktop/src/core/agents/reflection/index.ts`(new — 教学护栏)
- `apps/desktop/src/core/agents/report/index.ts`(new — 5 维度锁 + 3 档 pass_likelihood + 12 禁止词 sanitize)
- `apps/desktop/src/__tests__/postReportGraph.contract.test.ts`(new)
- `apps/desktop/src/__tests__/reportAgent.ethics.test.ts`(new — 12 禁止词 fuzz)

**Acceptance:**
```bash
cd apps/desktop
corepack pnpm test src/__tests__/postReportGraph.contract.test.ts
corepack pnpm test src/__tests__/reportAgent.ethics.test.ts
# pass_likelihood 任意输入 ∈ {中上, 中, 中下}
```

**Commit (.arch):** `docs(v34): design post_report_graph in langgraph.js`
**Commit (.dev):** `feat(F-405): land post_report_graph with parallel coach||reflection`

> ⚠️ **2026-05-04 拆分**:.dev 部分过重(2 节点 graph + 3 个 Agent + 5 维度 + 12 禁止词 + 教学护栏一锅),已拆为 .dev.a~d 4 子节点。Ralph 不再读 .dev 整段,fix_plan 已切换。

### M3.3.3.dev.a — Report Agent(主报告,5 维度 + 3 档 + 12 禁止词)
**Lead Agent**: developer | **Deps**: M3.3.3.arch
**Goal.** Report Agent 主报告。L0 锁:dimensions[5] + pass_likelihood 3 档 + 12 禁止词 sanitize + ai_verdict 后置 regex。本节点不动 graph。
**Files (new):**
- `apps/desktop/src/core/agents/report/index.ts` + `prompts.ts` + `sanitizers.ts`
- `apps/desktop/src/__tests__/reportAgent.test.ts`(happy + 12 禁止词 fuzz N=100)
**Acceptance.** `corepack pnpm test src/__tests__/reportAgent.test.ts`
**Commit.** `feat(F-405): report agent with 5-dim + 3-tier + 12-banned`

### M3.3.3.dev.b — Coach Agent(跨 session 异步 + 教学护栏)
**Lead Agent**: developer | **Parallel-safe with .c** | **Deps**: M3.3.3.arch
**Goal.** Coach Agent 跨 session 分析 + UserInsightCache 输出。教学护栏(general_growth_advice 必须建设性)。
**Files (new):**
- `apps/desktop/src/core/agents/coach/index.ts` + `prompts.ts`
- `apps/desktop/src/__tests__/coachAgent.teaching.test.ts`
**Acceptance.** `corepack pnpm test src/__tests__/coachAgent.teaching.test.ts`
**Commit.** `feat(F-405): coach agent with teaching guardrail`

### M3.3.3.dev.c — Reflection Agent(单场教学复盘 + 教学护栏)
**Lead Agent**: developer | **Parallel-safe with .b** | **Deps**: M3.3.3.arch
**Goal.** Reflection Agent 单场深度复盘。L0 红线 12:diagnosis 不评判 / mistakes_to_avoid 用"建议下次"句式。
**Files (new):**
- `apps/desktop/src/core/agents/reflection/index.ts` + `prompts.ts`
- `apps/desktop/src/__tests__/reflectionAgent.teaching.test.ts`(句式 + 禁止词 fuzz)
**Acceptance.** `corepack pnpm test src/__tests__/reflectionAgent.teaching.test.ts`
**Commit.** `feat(F-405): reflection agent with non-judgmental phrasing`

### M3.3.3.dev.d — post_report_graph 接通(coach ‖ reflection,节点名锁)
**Lead Agent**: developer | **Deps**: M3.3.3.dev.a + .b + .c
**Goal.** LangGraph.js 二节点 graph 接通 Coach + Reflection,验证并行 + 错误隔离。节点名锁 contract test。
**Files (new):**
- `apps/desktop/src/core/graphs/postReportGraph.ts`
- `apps/desktop/src/__tests__/postReportGraph.contract.test.ts`
- `apps/desktop/src/__tests__/postReportGraph.parallel.test.ts`
**Acceptance.** `corepack pnpm test src/__tests__/postReportGraph.{contract,parallel}.test.ts`
**Commit.** `feat(F-405): post_report_graph parallel coach||reflection`

---

## M3.3.X — tester re-audit 三图(必须)

**Lead Agent**: tester
**Helper Agents**: —
**Parallel-safe**: no
**Deps**: M3.3.1.dev / M3.3.2.dev / M3.3.3.dev

**Goal.** 独立复审 3 个 LangGraph.js 图 + 6 个 Agent(Interviewer / Framework / Research / Coach / Reflection / Report)。重点:
- 三个节点名锁 contract test 全过(L0)
- 5 维度 / 4 人格 / 7 填充词 / 3 档 pass_likelihood / 12 禁止词锁全过(L0)
- Research Agent .strict() 隐私护栏 fuzz 通过(L0)
- Coach/Reflection fire-and-forget 真异步(不阻塞 Report)
- 数据契约只增不改(老 `pass_probability` / `Verdict` 等字段在 Zod schema 仍存在作 fallback)

**Files (new):**
- `eatit/.ralph/logs/M3.3.X-audit.md`

**Acceptance.**
```bash
test -f .ralph/logs/M3.3.X-audit.md
grep -E "整体评分.*[7-9]/10|10/10" .ralph/logs/M3.3.X-audit.md
```

**Commit.** `test(v34): re-audit langgraph.js node-name locks`

---

## M3.4.1.arch — 流式 ASR Bridge → AsyncIterator 设计

**Lead Agent**: architect
**Helper Agents**: Explore(读 M2.8.dev 的 ASRGateway + InterviewPage 现有 turn 流逻辑)
**Parallel-safe**: no
**Deps**: M2.8.dev

**Goal.** 出 design doc:流式 ASR 从 Swift Bridge event 到 JS AsyncIterator 的转换层 + InterviewPage 字幕状态机 — partial 文本如何驱动 UI 实时更新 / final 文本如何 commit + 进 turn_graph。

**Files (new):**
- `eatit/.ralph/docs/v34-design/M3.4.1-streaming-asr-async-iterator.md`

**Deliverables.** ~120 行 design doc

**Commit.** `docs(v34): design volc streaming asr async iterator`

---

## M3.4.1.dev — volcStreamAsr + InterviewPage 接入

**Lead Agent**: developer
**Helper Agents**: —
**Parallel-safe**: no
**Deps**: M3.4.1.arch

**Goal.** 落地 `core/asr/volcStreamAsr.ts` AsyncIterator + InterviewPage 字幕实时刷新 + 松手时 final 文本进 turn_graph。验收:按住空格 → 字幕 partial 实时出 → 松手 → 最终 final → Compression Agent + Interviewer Agent 拿到完整 turn。

**Files:**
- `apps/desktop/src/core/asr/volcStreamAsr.ts`(new)
- `apps/desktop/src/pages/interview/LiveCaption.tsx`(new — partial 实时渲染组件)
- `apps/desktop/src/pages/InterviewPage.tsx`(modify — 接入)
- `apps/desktop/src/__tests__/volcStreamAsr.test.ts`(new)
- `apps/desktop/src/__tests__/liveCaptionFlow.test.tsx`(new — RTL 测 5 partial + 1 final 渲染)

**Acceptance.**
```bash
cd apps/desktop
corepack pnpm test src/__tests__/volcStreamAsr.test.ts
corepack pnpm test src/__tests__/liveCaptionFlow.test.tsx
```

**Commit.** `feat(F-403,F-405): wire streaming asr partial to live caption`

---

## M3.4.X — tester re-audit 流式 ASR(必须)

**Lead Agent**: tester
**Parallel-safe**: no
**Deps**: M3.4.1.dev

**Goal.** 端到端验证流式 ASR — 真录音 + 真火山 SAUC + 真字幕实时刷新。重点:
- partial 字幕在 < 800ms 内首字出现
- 松手到 final 文本 < 1.5s
- final 文本进 turn_graph,Compression + Interviewer 都拿到完整内容
- 关闭 ASR connection 不泄漏(Swift task.cancel + JS off listener)

**Files (new):**
- `eatit/.ralph/logs/M3.4.X-audit.md`

**Commit.** `test(v34): re-audit streaming asr end-to-end`

---

# M4 — UI 改造(1 周)

## M4.1 — Tauri invoke → nativeBridge 全替换

**Lead Agent**: developer
**Helper Agents**: Explore(grep `invoke(` 在 `apps/desktop/src/` 全部出现位置)
**Parallel-safe**: no
**Deps**: M3.X

**Goal.** 把所有 `import { invoke } from "@tauri-apps/api/core"` 调用替换为 `bridge.call(...)`。预估 ~30 处。

**Files (modify):**
- `apps/desktop/src/api/*.ts`(全部)
- `apps/desktop/src/components/`(若有用 invoke 的组件)
- `apps/desktop/package.json`(remove `@tauri-apps/api`)

**Acceptance.**
```bash
cd apps/desktop
grep -rE "from ['\"]@tauri-apps" src/ | wc -l  # 应为 0
grep -rE "invoke\(" src/ | grep -v "node_modules" | wc -l  # 应为 0
corepack pnpm exec tsc --noEmit
corepack pnpm test
```

**Commit.** `refactor(v34): replace tauri invoke with native bridge`

---

## M4.2 — WebSocket interview stream → AsyncIterator

**Lead Agent**: developer
**Parallel-safe**: no
**Deps**: M4.1

**Goal.** 把现有 `useInterviewWebSocket` hook 改成本地 AsyncIterator(直接调 turn_graph),不再走 127.0.0.1 WS。turn 状态流改为 `for await (const ev of runTurn(...))` yield 各阶段事件。

**Files:**
- `apps/desktop/src/api/ws.ts`(delete)
- `apps/desktop/src/api/index.ts`(modify)
- `apps/desktop/src/statecharts/interview-machine.ts`(modify — 接 AsyncIterator)
- `apps/desktop/src/pages/interview/useInterviewSession.ts`(modify)

**Acceptance.**
```bash
cd apps/desktop
test ! -f src/api/ws.ts
corepack pnpm exec tsc --noEmit
corepack pnpm test src/statecharts/__tests__/
```

**Commit.** `refactor(v34): replace ws stream with async iterator`

---

## M4.3 — 21 F-ID UI 走查 + 修

**Lead Agent**: developer
**Helper Agents**: Explore(对照 design-reference 7 个页面)
**Parallel-safe**: no
**Deps**: M4.2

**Goal.** 对照 [`docs/design-reference/`](../../docs/design-reference/) 的 7 个页面 jsx 原型,逐一过一遍 21 个 F-ID 的 UI 在 WKWebView 内是否还原。修复因从 Tauri 切换到 macOS 出现的视觉差异(字体渲染 / WebKit 默认 css / drag-drop 行为)。

**Files (modify):**
- `apps/desktop/src/pages/*` 中需要修的部分

**Acceptance.**
```bash
cd apps/desktop
corepack pnpm test  # 全部 vitest 通过
corepack pnpm lint:design-tokens
```

**Commit.** `fix(v34): align 21 f-ids with design-reference under wkwebview`

---

## M4.X — tester E2E smoke (Onboarding → Report 全流程)

**Lead Agent**: tester
**Parallel-safe**: no
**Deps**: M4.3

**Goal.** Playwright(适配 Eatit.app 启动版,见 M5.3)端到端跑通:Onboarding → Settings 配 Key → Upload 简历+JD → Parse → Config → Live(录音 + 字幕)→ Report(五维度 + pass_likelihood)→ History → Reflection 异步生成。

**Files (new):**
- `eatit/.ralph/logs/M4.X-audit.md`(audit report)
- `apps/desktop/tests/e2e/full-happy-path.spec.ts`(new — Playwright)

**Commit.** `test(v34): e2e smoke for full happy path`

---

# M5 — 测试迁移 + 后端删除(1-2 周)

## M5.1 — 后端 471 pytest 分类(保留/删除)

**Lead Agent**: tester
**Helper Agents**: Explore(列 `apps/api/tests/` 全部测试文件)
**Parallel-safe**: no
**Deps**: M4.X

**Goal.** 决定每个 pytest 是 port 到 Vitest(Agent 单测 / LangGraph 契约测)还是删除(API 集成测 / DB 持久化测,因为 DB 改成 Swift)。输出迁移清单。

**Files (new):**
- `eatit/.ralph/docs/v34-design/M5.1-pytest-migration-triage.md`

**Deliverables.** 表格清单,每行 `<test_file>: KEEP / DELETE / REWRITE,理由`,目标 KEEP ~300 / REWRITE ~50 / DELETE ~120。

**Commit.** `docs(v34): triage backend pytest for migration`

---

## M5.2 — Vitest 扩充至 ≥ 400

**Lead Agent**: developer
**Parallel-safe**: no
**Deps**: M5.1

**Goal.** 按 M5.1 triage,把 KEEP/REWRITE 的 ~350 个 pytest 翻译为 Vitest。前端从 ~169 + M3 期间新增的扩到 ≥ 400。

**Files (new):** `apps/desktop/src/__tests__/<ported>/...`(批量,可能拆 2-3 个子节点)

**Acceptance.**
```bash
cd apps/desktop
corepack pnpm test 2>&1 | grep -E "Tests: +[0-9]+ passed"  # ≥ 400
```

**Commit.** `test(v34): port pytest to vitest reaching 400+`

> ⚠️ **2026-05-04 拆分**:本节点过重(~350 pytest 一次 port),已拆为 M5.2.a~d。Ralph 不再读取本段,fix_plan 已切换。

### M5.2.a — Vitest port: agents/* 单测(≥ 100 tests)
**Lead Agent**: developer | **Deps**: M5.1
**Goal.** 把 `apps/api/tests/agents/` 下 KEEP 标记的 pytest 翻译为 Vitest。
**Files (new):** `apps/desktop/src/__tests__/agents/`(批量)
**Acceptance.** `corepack pnpm test src/__tests__/agents/` ≥ 100
**Commit.** `test(v34): port agents pytest to vitest (~100)`

### M5.2.b — Vitest port: orchestrator graphs contract(≥ 30)
**Lead Agent**: developer | **Deps**: M5.2.a
**Goal.** turn / intake / post_report 三类 contract 测试 port + 节点名锁继续生效。
**Files (new):** `apps/desktop/src/__tests__/graphs/*-contract.test.ts`
**Acceptance.** `corepack pnpm test src/__tests__/graphs/` ≥ 30
**Commit.** `test(v34): port langgraph contract tests (~30)`

### M5.2.c — Vitest port: domain / repositories / infra(≥ 100)
**Lead Agent**: developer | **Deps**: M5.2.b
**Goal.** 后端 domain / repositories / infra 三类 KEEP 测试。DB 用 GRDB Bridge mock,LLM 用 ARK provider mock。
**Files (new):** `apps/desktop/src/__tests__/{domain,repositories,infra}/`
**Acceptance.** `corepack pnpm test src/__tests__/{domain,repositories,infra}/` ≥ 100
**Commit.** `test(v34): port domain/repositories/infra (~100)`

### M5.2.d — schemas + ethics fuzzers 收尾(总数 ≥ 400 + tsc 干净)
**Lead Agent**: developer | **Deps**: M5.2.c
**Goal.** 收口 schema 锁 + 12 禁止词 fuzz + 5 维度锁 + 隐私 fuzz。`pnpm test` 总数 ≥ 400。
**Files (new):** `apps/desktop/src/__tests__/{contracts,fuzzers}/` 补缺
**Acceptance.** `corepack pnpm exec tsc --noEmit && corepack pnpm test 2>&1 | grep -E "Tests: +[0-9]+ passed"` ≥ 400
**Commit.** `test(v34): vitest reaches 400+`

---

## M5.3 — Playwright E2E 改造为启 Eatit.app

**Lead Agent**: developer
**Helper Agents**: Explore(Playwright Electron / WebView 启动文档)
**Parallel-safe**: no
**Deps**: M5.2

**Goal.** Playwright 通过 Tauri stub 模式跑 E2E 已经不可行。改成:`xcodebuild build` 出 .app + 用 Playwright 的 `_electron` 替代品(或 WebDriverAgent 模式,或更简单地用 `osascript` + 截图断言)启 Eatit.app + 通过 WKWebView 注入测试 hook。

**Files:**
- `apps/desktop/tests/e2e/launchEatitApp.ts`(new — 启动器)
- `apps/desktop/playwright.config.ts`(modify)
- `apps/desktop/scripts/build-and-test-e2e.sh`(new)

**Acceptance.**
```bash
cd apps/desktop
./scripts/build-and-test-e2e.sh  # build .app + Playwright 跑 5 个金标 E2E
```

**Commit.** `test(v34): rewire playwright to launch eatit.app`

---

## M5.4.arch — apps/api 删除决策

**Lead Agent**: architect
**Parallel-safe**: no
**Deps**: M5.3

**Goal.** 写 design doc 评估是否所有 Python 后端能力都已在 TS 端 + Swift 端 完整覆盖,确认无残余依赖才能进 .dev 删除步。重点检查:
- alembic migrations → DatabaseService.swift Migrations.swift 是否完整迁移
- LLM key X-LLM-Config middleware → KeychainService 是否完整覆盖
- WebSocket 实时 turn → AsyncIterator + bridge event 是否完整覆盖

**Files (new):**
- `eatit/.ralph/docs/v34-design/M5.4-python-retirement-decision.md`

**Commit.** `docs(v34): plan python backend retirement`

---

## M5.4.dev — 删除 apps/api + 残余清理

**Lead Agent**: developer
**Parallel-safe**: no
**Deps**: M5.4.arch

**Goal.** 永久删除 Python 后端整个目录树。

**Files (delete):**
- `apps/api/`(整个目录)
- `pyproject.toml`(根)
- `uv.lock`
- `apps/api/alembic*`(已含)
- `apps/api/.env*`(已含)
- `apps/api/eatit-backend.spec`(PyInstaller)
- `docker-compose.yml`(若仅为后端服务)

**Acceptance.**
```bash
test ! -d apps/api
test ! -f pyproject.toml
test ! -f uv.lock
grep -rE "(uvicorn|fastapi|alembic|sqlalchemy|pydantic|instructor|litellm|^langgraph)" \
    --include="*.py" --include="*.toml" --include="*.json" --include="*.yaml" \
    apps/ packages/ docs/ 2>&1 | grep -v node_modules | grep -v _archived | wc -l
# 应为 0
```

**Commit.** `chore(v34): retire python backend permanently`

---

## M5.5 — README + AGENTS.md + workspace 同步

**Lead Agent**: developer
**Parallel-safe**: no
**Deps**: M5.4.dev

**Goal.** 把所有 README / AGENTS.md / pnpm-workspace / .gitignore 等顶层文档/配置同步到"TS + Swift 双语,无 Python"的事实状态。

**Files:**
- `README.md`(modify — 主 README)
- `eatit/README.md`(modify)
- `AGENTS.md`(modify — 仓库根)
- `eatit/AGENTS.md`(modify — 若存在)
- `pnpm-workspace.yaml`(modify — 移除 api workspace)
- `.gitignore`(modify)

**Commit.** `docs(v34): sync top-level docs to ts-only architecture`

---

# M6 — Privacy Manifest + App Store 准备(3-5 天)

## M6.1 — PrivacyInfo.xcprivacy 完整版

**Lead Agent**: developer
**Helper Agents**: Explore(Apple Privacy Manifest 规范)
**Parallel-safe**: no
**Deps**: M5.5

**Goal.** 把 M1.4 的占位 PrivacyInfo.xcprivacy 完善为最终版,声明所有用到的 Apple "Required Reasons API" 类别。

**Files (modify):**
- `apps/macos/Eatit/PrivacyInfo.xcprivacy`

**Key Interfaces.**

```xml
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key><false/>
    <key>NSPrivacyTrackingDomains</key><array/>
    <key>NSPrivacyCollectedDataTypes</key><array/>
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array><string>C617.1</string></array>
        </dict>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array><string>CA92.1</string></array>
        </dict>
    </array>
</dict>
</plist>
```

**Commit.** `feat(F-406): finalize privacy manifest`

---

## M6.2 — 5 张截图 + 文案

**Lead Agent**: product-manager
**Helper Agents**: developer(运行 app 截图)
**Parallel-safe**: yes(与 M6.3 / M6.4 可并行)
**Deps**: M5.5

**Goal.** 5 张 macOS 14 截图(1280×800)+ 中英双语标题,卖点对应 PRD §13.3 截图脚本表。

**Files (new):**
- `apps/macos/AppStore/screenshots/01-onboarding.png`
- `apps/macos/AppStore/screenshots/02-upload-parse.png`
- `apps/macos/AppStore/screenshots/03-live-caption.png`
- `apps/macos/AppStore/screenshots/04-report.png`
- `apps/macos/AppStore/screenshots/05-dashboard.png`
- `apps/macos/AppStore/captions.zh.md`
- `apps/macos/AppStore/captions.en.md`

**Commit.** `chore(v34): produce app store screenshots and captions`

---

## M6.3 — 隐私政策网页

**Lead Agent**: product-manager
**Parallel-safe**: yes
**Deps**: M5.5

**Goal.** 写一份独立的隐私政策网页(Markdown → HTML)+ 部署到公开 URL(用户自提供 hosting,如 GitHub Pages)。

**Files (new):**
- `apps/macos/AppStore/privacy-policy.zh.md`
- `apps/macos/AppStore/privacy-policy.en.md`

**Commit.** `chore(v34): publish privacy policy webpage`

---

## M6.4 — App Store Connect 元数据

**Lead Agent**: product-manager
**Parallel-safe**: yes
**Deps**: M5.5

**Goal.** App Store Connect 的中英双语元数据(描述 / 关键词 / What's New / 分类 / 年龄分级 / 联系信息 / Review Notes 模板见 PRD §13.1)。

**Files (new):**
- `apps/macos/AppStore/metadata.zh.md`
- `apps/macos/AppStore/metadata.en.md`
- `apps/macos/AppStore/review-notes.md`

**Commit.** `chore(v34): fill app store connect metadata`

---

## M6.X — tester + product-manager 双审

**Lead Agents**: tester + product-manager(单 loop 内并行调两个 subagent)
**Parallel-safe**: no
**Deps**: M6.1~M6.4

**Goal.** 提交 Review 前最后一关:
- tester 跑全量回归(471 pytest 已删,改为 ~400 vitest + 5 Playwright + 14 contract test)+ entitlements 校验 + 出站白名单校验 + Privacy Manifest 必备字段
- product-manager 审 metadata / privacy policy / Review Notes / 截图文案,确保对外承诺与产品行为一致

**Files (new):**
- `eatit/.ralph/logs/M6.X-dual-audit.md`

**Commit.** `test(v34): dual audit before first review submission`

---

## M6.5 — 第一次 Archive + 上传 App Store Connect

**Lead Agent**: developer
**Parallel-safe**: no
**Deps**: M6.X

**Goal.** 跑 `scripts/archive-and-upload.sh`(M1.3 已写),把第一份完整 build 推到 App Store Connect,提交 Review。

**Files:** —

**Acceptance.**
```bash
cd apps/macos
./scripts/archive-and-upload.sh 2>&1 | tail -10
# 看到 "Successfully uploaded"
# 在 App Store Connect 网页端点击 Submit for Review(人工)
```

**Commit.** `chore(v34): submit first review`

---

# M7 — Review 处理 + 上架(反应式)

## M7.1+ — Review reject 处理(按 reject 内容现场拆节点)

**Lead Agent**: 视 reject 类型(architect 处理架构问题 / developer 处理实施 / tester 处理质量 / product-manager 处理文案与隐私政策)
**Parallel-safe**: no
**Deps**: M6.5

**Goal.** App Store Review 第 1 次大概率 reject,常见原因:
- 4.0 Demo Key 没有提供 → developer 写 Settings 页"用测试 Key 登录"快捷入口 + Review Notes 加 demo key
- 5.1.1 Privacy Policy 不完整 → product-manager 补充
- 2.1 应用不完整(Onboarding 没填 Key 走不下去)→ developer 加引导文案
- 4.7 第三方代码下载(本项目不会触发)

每次 reject 后:
1. 读 reject 邮件全文
2. 在 fix_plan.md 加 `M7.<reject序号>.<问题缩写>` 节点
3. 派对应 Lead Agent 实施
4. 重新 archive + 上传 + 提交 Review

**Files**(每次按 reject 内容)

**触发回滚阈值**:第 3 次 reject 触发 constraints §K(架构 review meeting),不得"放弃 App Store"。

**Commit.** `fix(v34): address app review reject N`

---

# 文档变更历史

| 版本 | 日期 | 变更 |
|---|---|---|
| v3.4 sections 初版 | 2026-05-04 | M1~M7 节点 spec 落地;52 个节点 / Lead Agent 分工 / Parallel-safe matrix / 多 Agent 协作约定 |
