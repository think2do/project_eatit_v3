# Eatit v3.4 — Build / Test / Run Instructions

> v3.4 起,Python 后端永久退役(M5.4 节点删除 `apps/api/`)。本文档替换为 macOS Xcode + TS 前端双语环境。Python 命令保留至 M5.4 完成前作历史 reference,M5.5 节点会删掉这些段。

## Project layout (post-v3.4)

```
eatit/
├── apps/
│   ├── macos/                # Xcode 工程(SwiftUI + AppKit + WKWebView,M1+ 落地)
│   │   ├── Eatit.xcodeproj/
│   │   ├── Eatit/
│   │   │   ├── EatitApp.swift / AppDelegate.swift
│   │   │   ├── WebViewController.swift
│   │   │   ├── Bridge/         # BridgeRouter / BridgeMessage / Codable types
│   │   │   ├── Services/       # KeychainService / DatabaseService / FilePicker / PDFParser / AudioCapture / LLMGateway / ASRGateway
│   │   │   ├── Resources/web/  # Vite build 产物(Build Phase 自动同步)
│   │   │   ├── Eatit.entitlements
│   │   │   ├── PrivacyInfo.xcprivacy
│   │   │   └── Info.plist
│   │   ├── EatitTests/         # Swift 单测
│   │   └── scripts/            # archive-and-upload.sh / sync-web-resources.sh / verify-entitlements.sh
│   │
│   ├── desktop/                # 前端 React 18 + Vite + TS(保留并改造)
│   │   ├── src/
│   │   │   ├── core/           # 新增,从 Python 迁的 Agent / Graph / Schema / LLM / ASR
│   │   │   ├── services/       # nativeBridge.ts + 各 Service wrapper
│   │   │   ├── pages/ components/ statecharts/ stores/
│   │   │   └── __tests__/      # Vitest
│   │   ├── tests/e2e/          # Playwright(M5.3 改造为启 Eatit.app)
│   │   └── playwright.config.ts
│   │
│   └── api/                    # ★ M5.4 节点彻底删除
│
├── packages/shared-types/      # 跨前后端类型(v3.4 后:跨 Swift Bridge / TS / 文档)
├── docs/                       # PRD / FEATURES / ROADMAP / design-reference
└── .ralph/                     # Ralph 工作区(protected)
```

## Context refresh (run before first iteration on a section)

```bash
# Where we are
pwd && git branch --show-current && git log --oneline -5

# Xcode 工程现状
ls apps/macos/ 2>/dev/null
xcodebuild -version
xcrun --show-sdk-version

# 前端现状
ls apps/desktop/src/core/ apps/desktop/src/services/ 2>/dev/null
node --version && pnpm --version

# Python 残余检查(M5.4 后必须为空)
test -d apps/api && echo "⚠️ Python backend still exists" || echo "✅ Python retired"
```

## macOS / Xcode (apps/macos/)

```bash
cd apps/macos

# Build
xcodebuild build -scheme Eatit -destination "platform=macOS" -derivedDataPath build/

# Run(双击或命令行)
open build/Build/Products/Debug/Eatit.app

# Tests
xcodebuild test -scheme Eatit -destination "platform=macOS"
xcodebuild test -scheme Eatit -destination "platform=macOS" \
    -only-testing:EatitTests/KeychainServiceTests

# Sandbox / Entitlements 校验
codesign -d --entitlements - build/Build/Products/Debug/Eatit.app
codesign -d --entitlements - build/Build/Products/Debug/Eatit.app | grep -q app-sandbox  # 必须 OK
codesign -d --entitlements - build/Build/Products/Debug/Eatit.app | grep -v "disable-library-validation"  # 必须为空

# Archive + Upload to App Store Connect (M1.3+)
./scripts/archive-and-upload.sh

# Privacy Manifest 检查(M6.1+)
plutil -lint Eatit/PrivacyInfo.xcprivacy
```

### Swift Package Manager

依赖在 Xcode GUI 添加(File → Add Package Dependencies),不要手编辑 pbxproj。

主要依赖(M2 期间陆续加):
- `GRDB.swift` ≥ 6.x(SQLite 包装)

## Frontend (apps/desktop/)

```bash
cd apps/desktop

# deps
corepack pnpm install
corepack pnpm add <pkg>          # runtime
corepack pnpm add -D <pkg>       # dev

# v3.4 期间会陆续加的运行时依赖
corepack pnpm add zod @langchain/langgraph ai

# verify
corepack pnpm exec tsc --noEmit
corepack pnpm lint
corepack pnpm lint:design-tokens

# build(macOS target,直接 emit 到 apps/macos/Eatit/Resources/web/)
EATIT_BUILD_TARGET=macos corepack pnpm build

# dev(浏览器内开发,绕开 macOS 壳)
corepack pnpm dev                # :1420

# tests
corepack pnpm test               # vitest
corepack pnpm test src/core/agents/parse/__tests__/parseAgent.test.ts  # 单文件
corepack pnpm exec playwright test  # E2E(M5.3 之前是 Tauri stub 模式,之后启 Eatit.app)
```

## Volcengine credentials(开发期本地配,严禁进 git)

火山方舟 ARK Key 与 SAUC AppID/Token 用于本地开发测试。生产环境用户在 Settings 页填,存 Keychain。

```bash
# 本地开发临时存(M2.7.dev / M2.8.dev 节点冒烟用)
# 一次性写到 Keychain:
security add-generic-password -s "com.eatit.desktop" -a "ark-api-key" -w "<YOUR_ARK_KEY>"
security add-generic-password -s "com.eatit.desktop" -a "volc-asr-credentials" \
    -w '{"appId":"<APP_ID>","accessToken":"<TOKEN>"}'

# 验证
security find-generic-password -s "com.eatit.desktop" -a "ark-api-key" -w
```

⚠️ 任何节点的代码 / 测试 / 文档 / commit message 不得出现真实 Key 字面量(constraints §A0.4)。

## Shared conventions

- **No `/Users/shixuan/...` absolute paths** in source / tests / docs / Xcode 工程。Xcode 用 `$(SRCROOT)` / `$(PROJECT_DIR)`;Swift 用 `Bundle.main` / `FileManager.default.url(for:)`;TS 用 relative imports。
- **Commits**: Conventional Commits。一节点 = 一 commit。Do NOT push(Ralph 留本地)。
- **Line width**: TypeScript 100(Prettier 配置);Swift 120(SwiftLint 默认)。
- **Async**: TS 全用 `async / await` + Promise;Swift 用 `async` + `await` + `Task` + `URLSession.bytes(for:)` for SSE。
- **Paths in tests**:Swift 用 `FileManager.default.temporaryDirectory`;TS 用 `tmp_path` 等价物 / in-memory mock。

## Bridge protocol(Swift ↔ JS)

详细协议见 [`.ralph/specs/v34-macos-port-sections.md` M2.1.arch](specs/v34-macos-port-sections.md) + [PRD §4.4](../docs/PRD/Eatit_PRD_v3_4_macos_appstore.md)。

要点:
- JS → Swift: `window.webkit.messageHandlers.eatit.postMessage(BridgeRequest)`
- Swift → JS: `webView.evaluateJavaScript("window.eatitBridge.dispatch(BridgeEvent)")`
- 所有 method 必须 Codable + Zod 双端 schema 一致(constraints §B9)
- API Key 不得跨 Bridge 边界(`keychain.exists` 只回 `{ exists: bool }`,不回 secret 本身)

## Key state to remember

- **macOS 14.0+ 锁**(constraints §B7,Info.plist `LSMinimumSystemVersion = 14.0`)
- **Bundle Identifier**:`com.eatit.desktop`
- **Keychain Service**:`com.eatit.desktop`
- **Keychain Accounts**:`ark-api-key` / `volc-asr-credentials`(JSON)/ `app-encryption-key`(M2.3 决定)
- **Sandbox container 路径**:`~/Library/Containers/com.eatit.desktop/Data/Library/Application Support/Eatit/eatit.db`(GRDB 自动 redirect)
- **WebView URL scheme**:`eatit://app/index.html` 加载 bundle 内静态 React build
- **出站白名单**:`https://ark.cn-beijing.volces.com` + `wss://openspeech.bytedance.com`,其他 host 禁止
- **不得引入 entitlements**:`network.server` / `disable-library-validation` / `allow-jit` 等(constraints §A0.2)

## Multi-agent dispatch reference

详 [`PROMPT.md`](PROMPT.md) §5。简表:

| Lead Agent type | 用途 | 产物 |
|---|---|---|
| `architect` | 节点 ID 后缀 `.arch`,出 design doc | `.ralph/docs/v34-design/<NODE_ID>-design.md` |
| `developer` | 节点 ID 后缀 `.dev` 或裸数字,实施 + acceptance + commit | 代码 + commit |
| `tester` | 节点 ID 后缀 `.X` 或 `.audit-fix`,独立复审 | `.ralph/logs/<NODE_ID>-audit.md` |
| `product-manager` | M6 系列文案 / 截图 / 隐私政策 | `apps/macos/AppStore/*.md` + 截图 |
| `Explore` | 任意节点开始前 30 秒只读调研 | 嵌入主 Lead Agent prompt 的精炼信息 |

## App Store Submission Checklist(M6 节点用)

- [ ] PrivacyInfo.xcprivacy 声明 FileTimestamp + UserDefaults
- [ ] Info.plist 含 NSMicrophoneUsageDescription
- [ ] 5 张截图(1280×800)+ 中英双语 caption
- [ ] 隐私政策 URL 公开可访问
- [ ] Review Notes 含测试 ARK Key + ASR AppID/Token + demo 步骤
- [ ] entitlements 仅含 4 项(无 disable-library-validation / network.server)
- [ ] 所有内嵌 .dylib / .framework 同 Team ID 签名
- [ ] `xcrun altool --upload-app` 通过

详见 [PRD §13](../docs/PRD/Eatit_PRD_v3_4_macos_appstore.md)。
