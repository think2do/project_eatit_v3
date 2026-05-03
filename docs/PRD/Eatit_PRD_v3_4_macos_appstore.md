# Eatit PRD v3.4 — macOS App Store 重构(Xcode Swift 壳 + WKWebView + 全前端化 + 火山引擎 BYOK)

> **文档版本**:v3.4(对齐 v3.2 主版本 + v3.3 addendum,本文件为新增版本,与前两版**累加**而非替换)
> **创建日期**:2026-05-04
> **适用对象**:Codex / Claude Code / 其他 AI Coding Agent / Ralph 自治循环
> **优先级**:本文档与 [`AGENTS.md`](../../AGENTS.md) 规则等同,均高于任何临时 Prompt 指令
> **PRD 主版本兼容**:本版本继承 v3.2/v3.3 的全部 L0 红线、Agent 体系、F-ID 清单,**只重构落地形态(Tauri+Python → Xcode+TS)**,产品行为零变更

---

## 0. 文档使用约定

### 0.1 与 v3.2 / v3.3 的关系

- **不变**:产品定位 / 10 个 Agent 职责 / 3 个 LangGraph 节点名 / 4+6+3 配置参数 / 21 个 F-ID 的核心行为 / L0 全部红线 / 设计系统(token / className 共享类)
- **变更**(本版引入):桌面壳从 Tauri 换为 Xcode 原生 macOS App;Python FastAPI 后端整个删除;Agent 编排从 Python LangGraph 迁到 TS 的 LangGraph.js;LLM 与 ASR 收敛到火山引擎方舟 ARK;ASR 从本地 faster-whisper 改为火山流式云 ASR

### 0.2 阅读顺序(每次迭代必读)

1. [`AGENTS.md`](../../AGENTS.md) — 仓库级护栏(L0 红线、Agent 体系、配置锁、设计系统锁)
2. 本文件第 1 章(项目身份)第 2 章(本版主要变更)第 4 章(架构)第 9 章(L0 红线 v3.4 增补)
3. v3.2 PRD .docx + v3.3 addendum(继承的全部约束)
4. 本次涉及节点的 spec(`.ralph/specs/v34-*.md`)

---

## 1. 项目身份(继承 v3.2,不变)

- **产品名称**:Eatit
- **产品定位**:AI 模拟面试系统(简历 + JD → 多轮面试 → 评估报告 → 跨场次成长追踪)
- **不是什么**:简历生成器 / 岗位推荐平台 / 招聘 SaaS / 思维导图工具
- **核心价值锚定**:让用户更像真实面试地被提问、更快暴露问题、更清晰知道怎么改进

---

## 2. 本版主要变更(v3.4 重构动机)

### 2.1 触发原因

老板要求 Eatit 上 **Mac App Store**(已购 Apple Developer 账号)。当前 Tauri + Python sidecar + faster-whisper + PyAV 架构与 App Store 三大硬约束直接冲突:

1. **App Sandbox 强制**(Guideline 2.4.5(i)):PyInstaller onedir 产几十上百个未签名二进制,Python sidecar 子进程在 sandbox 下需要 `disable-library-validation` entitlement,Review 高风险
2. **应用必须自包含**(Guideline 2.5.2):faster-whisper 模型按需下载踩线
3. **LGPL / GPL 静态链接**:PyAV → FFmpeg 是 LGPL,要求"用户必须能替换库",App Store 静态链接不合规

### 2.2 架构选型(候选对比)

| 维度 | 方案 A(Python Sidecar 保留) | **方案 B(全前端化,本版选择)** |
|---|---|---|
| 后端测试复用 | 471 pytest 全部保留 | 全部作废,需 Vitest 重建 |
| Agent 迁移成本 | 0 | 高(LangGraph Python → TS,Pydantic → Zod,Instructor → Vercel AI SDK) |
| 包体 | ~400 MB | ~15-20 MB |
| Sandbox 复杂度 | 高(子进程 + 多 entitlement) | 低(单进程) |
| App Store 审核风险 | **高**(Python sidecar 不稳定) | **低**(本质 PWA + 原生壳) |
| 重构周期 | 6-9 周 | **8-12 周** |
| 长期维护成本 | 高(双语言双工具链) | 低(纯 TS 单仓) |

**决策:走方案 B**。代价是后端 Python 全部重写,但换来 App Store 审核风险最低 + 包体最小 + 长期工具链统一。

### 2.3 配套技术决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| Agent 编排 | `@langchain/langgraph` (LangGraph.js v0.2+) | API 与 Python 版几乎一对一,生态对齐 |
| Schema 校验 | Zod | Pydantic TS 等价物,生态最成熟 |
| Structured Output | Vercel AI SDK `generateObject` | Instructor 等价,内置 retry-on-validation-fail |
| 数据库 | GRDB.swift(via Swift Bridge) | Swift 生态最成熟 SQLite 包装,WAL 完整支持 |
| LLM Provider | **火山引擎方舟 ARK 唯一**(原 5 家收敛) | 老板指定,OpenAI 兼容,豆包模型质量 + 价格平衡 |
| ASR Provider | **火山引擎流式 ASR**(原本地 faster-whisper) | 老板指定,流式 partial 结果原生支持 |
| TTS | Web Speech API(macOS 系统中文语音) | 保留,WKWebView 原生支持 |
| ASR/LLM 调用通道 | **Swift native(URLSession + URLSessionWebSocketTask)** | WKWebView WebSocket 不能加自定义 header,火山 ASR 鉴权 4 字段全在 header,**JS 直连不可能** |
| macOS 最低版本 | **14.0(Sonoma)** | Sandbox 14+ 更严格,统一适配,放弃 13 |
| UI 框架 | AppKit + 少量 SwiftUI(设置面板) | WKWebView 在 AppKit 下控制更稳 |
| 老用户数据迁移 | **不做** | 老板拍板;v3.4 视为全新 app |
| 收费 | **不收费**,不接 StoreKit/IAP | 老板拍板 |

---

## 3. 用户故事 + 验收标准(产品行为零变更)

> 21 个 F-ID(F-301~F-322)的用户故事和验收标准全部继承 v3.2 + v3.3,不在本文件重述。本章只说明**因平台变更而衍生的新验收点**。

### 3.1 新增非功能性用户故事

| US-ID | 故事 | 验收标准 |
|---|---|---|
| US-401 | 作为用户,我从 Mac App Store 下载 Eatit,双击即开,不需要 `xattr -cr` | 应用通过 Apple 公证 + App Store 分发,Gatekeeper 直接放行 |
| US-402 | 作为用户,我在「设置」里填一次火山方舟 ARK API Key + 火山 ASR AppID/Token,关掉应用再开还在 | Key 存 macOS Keychain(`com.eatit.desktop` service);卸载应用 Keychain 自动清理 |
| US-403 | 作为用户,我面试中按住空格说话,**字幕在我说话过程中实时出现**(不是松手才出),停顿后字幕"定稿" | 火山流式 ASR partial 结果(`definite=false`)驱动字幕实时刷新;`definite=true` 时该句锁定 |
| US-404 | 作为用户,我的简历 / 面试录音 / 报告全部留在我电脑里,**不上传任何云**(LLM 调用除外,因为 LLM 必须联网) | 所有持久化存储在 sandbox container 内;Network entitlement 仅 client(出站),仅命中两个 host:`ark.cn-beijing.volces.com` + `openspeech.bytedance.com` |
| US-405 | 作为用户,我从应用内打不开任何外部网址,除非应用有正当理由 | 仅「重新解析」「了解 Eatit」等明确入口允许 `open_system_url`,WebView 内禁止任意外链跳转 |

### 3.2 新增功能 ID(本版引入)

| F-ID | 功能 | 验收 |
|---|---|---|
| F-401 | macOS Sandbox + Hardened Runtime + Apple Developer 签名 + 公证 | App Store Connect 上传通过,TestFlight 可安装 |
| F-402 | 火山方舟 ARK 接入(替代原 LiteLLM 5 provider) | Settings 配 API Key + 模型选择;Parse / Framework / Interviewer / Reference / Compression / Report / Coach / Reflection / Research 9 个 Agent 全部走 ARK Chat Completions |
| F-403 | 火山流式 ASR 接入(替代原 faster-whisper) | 录音 PCM 16kHz mono → Swift WS 推流 → partial 结果回推 → 字幕实时刷新 |
| F-404 | Swift Native Services 7 件套(Keychain / DB / File / PDF / Audio / LLM / ASR Gateway) | 单元测试覆盖每个 service ≥ 80% 行覆盖 |
| F-405 | LangGraph.js 三图 + 10 Agent TS 实现 | `test_graph_contract` / `test_intake_graph_contract` / `test_post_report_graph_contract` 三个节点名锁测试在 Vitest 通过 |
| F-406 | Privacy Manifest + Review Notes | `PrivacyInfo.xcprivacy` 完整声明 API 用途 + Review Notes 包含 demo key 引导 |

---

## 4. 系统架构

### 4.1 总体架构图

```
┌──────────────────────────────────────────────────────────────────┐
│  Eatit.app (Xcode macOS App, macOS 14+, Sandboxed, Team-Signed)  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Swift 薄壳(AppKit + WKWebView)                           │  │
│  │                                                             │  │
│  │  ┌─────────────────────┐  ┌─────────────────────────────┐ │  │
│  │  │  WebViewController  │  │  Native Services (7)        │ │  │
│  │  │  ├─ WKWebView       │◄─┤  1. KeychainService         │ │  │
│  │  │  ├─ BridgeRouter    │  │  2. DatabaseService (GRDB)  │ │  │
│  │  │  └─ MessageHandler  │  │  3. FilePickerService        │ │  │
│  │  └─────────────────────┘  │  4. PDFParserService         │ │  │
│  │              ▲             │  5. AudioCaptureService      │ │  │
│  │              │ webkit       │  6. LLMGateway   ◄── ARK    │ │  │
│  │              ▼ messageHandlers│  7. ASRGateway   ◄── 流式  │ │  │
│  │                              └─────────────┬───────────────┘ │  │
│  └────────────────────────────────────────────┼───────────────┘  │
│                                                │                  │
│  ┌────────────────────────────────────────────▼───────────────┐  │
│  │  WKWebView 内 React 18 + TS                                 │  │
│  │                                                              │  │
│  │  ┌────────────────────┐    ┌──────────────────────────┐   │  │
│  │  │  pages/            │    │  core/(新增,迁自后端)    │   │  │
│  │  │  components/        │    │  ├─ agents/   10 个 .ts   │   │  │
│  │  │  statecharts/       │◄───┤  ├─ graphs/   3 个 LangGraph.js │
│  │  │  stores/            │    │  ├─ schemas/  Zod          │   │  │
│  │  │  routes/            │    │  ├─ llm/      ARK provider │   │  │
│  │  │                     │    │  ├─ asr/      Bridge call  │   │  │
│  │  │  services/          │    │  └─ prompts/  迁自 app/prompts│  │
│  │  │   └─ nativeBridge.ts│    └──────────────────────────┘   │  │
│  │  └────────────────────┘                                     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ~/Library/Containers/com.eatit.desktop/Data/                     │
│  └─ Library/Application Support/Eatit/eatit.db (SQLite WAL)       │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┴────────────────┐
                ▼                                 ▼
     ┌──────────────────────────┐   ┌──────────────────────────┐
     │  火山方舟 ARK            │   │  火山流式 ASR             │
     │  (LLM, Doubao 模型)      │   │  (SAUC bigmodel, WS)     │
     │  ark.cn-beijing.volces.com│  │  openspeech.bytedance.com│
     │  Bearer <ARK_API_KEY>    │   │  X-Api-App-Key + Token   │
     └──────────────────────────┘   └──────────────────────────┘
```

### 4.2 仓库结构

```
project_eatit_v3/eatit/
├── apps/
│   ├── macos/                          ★ 新增,Xcode 工程
│   │   ├── Eatit.xcodeproj/
│   │   ├── Eatit/
│   │   │   ├── EatitApp.swift          @main + SwiftUI lifecycle
│   │   │   ├── AppDelegate.swift       AppKit hooks
│   │   │   ├── WebViewController.swift WKWebView 容器(NSViewController)
│   │   │   ├── Bridge/
│   │   │   │   ├── BridgeRouter.swift  WKScriptMessageHandler 路由
│   │   │   │   ├── BridgeMessage.swift Codable 协议
│   │   │   │   └── BridgeError.swift
│   │   │   ├── Services/
│   │   │   │   ├── KeychainService.swift   SecItemAdd/Copy/Update/Delete
│   │   │   │   ├── DatabaseService.swift   GRDB.swift 包装
│   │   │   │   ├── FilePickerService.swift NSOpenPanel + drag-drop
│   │   │   │   ├── PDFParserService.swift  PDFKit
│   │   │   │   ├── AudioCaptureService.swift AVAudioEngine 录音
│   │   │   │   ├── LLMGateway.swift        URLSession SSE → ARK
│   │   │   │   └── ASRGateway.swift        URLSessionWebSocketTask → 火山 SAUC
│   │   │   ├── Resources/
│   │   │   │   └── web/                 ← Vite build 产物(Run Script Phase 自动同步)
│   │   │   ├── Eatit.entitlements
│   │   │   ├── PrivacyInfo.xcprivacy
│   │   │   └── Info.plist
│   │   └── EatitTests/
│   │
│   ├── desktop/                         保留并改造
│   │   ├── src/
│   │   │   ├── core/                   ★ 新增,所有原后端逻辑
│   │   │   │   ├── agents/
│   │   │   │   │   ├── parse/          .ts(对应 apps/api/app/agents/parse/)
│   │   │   │   │   ├── research/
│   │   │   │   │   ├── framework/
│   │   │   │   │   ├── interviewer/
│   │   │   │   │   ├── reference/
│   │   │   │   │   ├── compression/
│   │   │   │   │   ├── report/
│   │   │   │   │   ├── coach/
│   │   │   │   │   ├── reflection/
│   │   │   │   │   └── observer/
│   │   │   │   ├── graphs/
│   │   │   │   │   ├── turnGraph.ts            ← LangGraph.js,节点名锁 {turn_assessment, compression, next_question}
│   │   │   │   │   ├── intakeGraph.ts          ← {parse_node, research_node, predict_questions_node}
│   │   │   │   │   └── postReportGraph.ts      ← {coach_node, reflection_node}
│   │   │   │   ├── schemas/             Zod
│   │   │   │   ├── llm/
│   │   │   │   │   ├── arkProvider.ts          ← 唯一 provider
│   │   │   │   │   ├── gateway.ts              ← 调 Swift LLMGateway
│   │   │   │   │   └── instructor.ts           ← Vercel AI SDK 包装
│   │   │   │   ├── asr/
│   │   │   │   │   └── volcStreamAsr.ts        ← 调 Swift ASRGateway
│   │   │   │   └── prompts/             从 apps/api/app/prompts/ 迁移
│   │   │   ├── services/
│   │   │   │   └── nativeBridge.ts      统一封装 webkit.messageHandlers 调用
│   │   │   ├── pages/                   保留
│   │   │   ├── components/              保留
│   │   │   ├── statecharts/             保留
│   │   │   └── stores/                  保留
│   │   ├── package.json                 + zod, @langchain/langgraph, ai
│   │   └── vite.config.ts               build target macOS 14 WKWebView
│   │
│   └── api/                             ★ M5 末完全删除
│
├── packages/shared-types/               保留
└── docs/
    ├── PRD/
    │   ├── Eatit_PRD_v3_2.docx          v3.2 主版本(不变)
    │   ├── Eatit_PRD_v3_3_addendum.md   v3.3 增量(不变)
    │   └── Eatit_PRD_v3_4_macos_appstore.md ★ 本文件
    └── ROADMAP.md                       追加 v3.4 章节
```

### 4.3 Sandbox / Entitlements

`apps/macos/Eatit/Eatit.entitlements`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
    <key>com.apple.security.device.audio-input</key>
    <true/>
    <key>keychain-access-groups</key>
    <array>
        <string>$(AppIdentifierPrefix)com.eatit.desktop</string>
    </array>
</dict>
</plist>
```

**关键变化(对比方案 A)**:
- ❌ 不需要 `com.apple.security.network.server`(没有本地端口监听,Swift 直接出站)
- ❌ 不需要 `com.apple.security.cs.disable-library-validation`(没有 Python 子进程加载未签 .so)
- ❌ 不需要 `com.apple.security.inherit`(没有子进程)

`Info.plist` 必加:
- `NSMicrophoneUsageDescription`:"Eatit 需要使用麦克风以录制您的面试回答"
- `LSMinimumSystemVersion`:`14.0`
- `LSApplicationCategoryType`:`public.app-category.education`

### 4.4 WebView Bridge 协议

#### 4.4.1 通道形态

- **JS → Swift**:`window.webkit.messageHandlers.eatit.postMessage(payload)`
- **Swift → JS**:`webView.evaluateJavaScript("window.eatitBridge.dispatch(...)")`

#### 4.4.2 消息 schema(Codable / Zod 双端契约)

```typescript
// JS 端 nativeBridge.ts
export interface BridgeRequest {
  id: string;          // UUID v4,用于 response 匹配
  method: string;      // "keychain.save" / "llm.chatStream" / "asr.start" 等
  params: unknown;
}

export interface BridgeResponse {
  id: string;
  ok: true;
  data: unknown;
} | {
  id: string;
  ok: false;
  error: { code: string; message: string };
}

export interface BridgeEvent {
  type: "stream-chunk" | "asr-partial" | "asr-final" | "asr-end";
  streamId: string;
  payload: unknown;
}
```

```swift
// Swift 端 BridgeMessage.swift
struct BridgeRequest: Codable {
    let id: String
    let method: String
    let params: AnyCodable
}

struct BridgeResponse: Codable {
    let id: String
    let ok: Bool
    let data: AnyCodable?
    let error: BridgeError?
}

struct BridgeError: Codable {
    let code: String
    let message: String
}
```

#### 4.4.3 方法清单

| Method | 方向 | 说明 |
|---|---|---|
| `keychain.save` | request | `{account, secret}` → void |
| `keychain.get` | request | `{account}` → `{secret}` 或 null |
| `keychain.delete` | request | `{account}` → void |
| `db.exec` | request | `{sql, params}` → `{rowsAffected, lastInsertId}` |
| `db.query` | request | `{sql, params}` → `{rows: any[]}` |
| `db.tx` | request | `{statements: [...]}` → 事务执行 |
| `file.pick` | request | `{accept, multiple}` → `[{name, size, base64}]` |
| `file.dropEnable` | request | 启用 WebView 内拖拽接收(返回拖入文件 base64) |
| `pdf.extractText` | request | `{base64}` → `{text, pageCount}` |
| `audio.start` | request | `{streamId}` → 开始录音(16kHz mono PCM)|
| `audio.stop` | request | `{streamId}` → 停止录音 |
| `audio.chunk` | event | Swift → JS,音频 PCM chunk(其实直接转给 ASR,不需要回到 JS,见 4.4.4 优化) |
| `llm.chat` | request | `{messages, model, temperature, response_format, tools}` → `{content, tool_calls}` 完整响应 |
| `llm.chatStream` | request → stream | `{...}` → 通过 `stream-chunk` 事件流推送 SSE delta |
| `asr.start` | request | `{streamId, sampleRate, lang}` → 建立 WS 连接 |
| `asr.stop` | request | `{streamId}` → 关闭 WS |
| `asr.partial` | event | Swift → JS,流式中间稿 `{streamId, text, definite: false}` |
| `asr.final` | event | Swift → JS,定稿 `{streamId, text, definite: true}` |
| `system.openUrl` | request | `{url}` → 调系统浏览器(仅白名单) |

#### 4.4.4 录音 → ASR 通路优化

**朴素流**:JS getUserMedia → JS 转 PCM → 通过 Bridge 推 Swift → Swift 推火山 WS → Swift 收 partial → 推 JS UI

**问题**:Bridge 走 JSON + base64,音频包每 200ms 一次反复 marshalling,延迟 + CPU 浪费

**优化(本版采用)**:Swift 端用 `AVAudioEngine` 直接录音 + 直接喂火山 WS,**不经过 JS**;只把 partial 文本通过 Bridge event 推回 JS UI。

```
JS:                                    Swift:
asr.start({streamId})  ────────────►   AudioCaptureService.start()
                                       └─► AVAudioEngine 录音 16kHz mono PCM
                                           └─► ASRGateway.feedPCM(chunk)
                                               └─► WebSocket → 火山 SAUC

                       ◄────────────── asr.partial event (流式)
                       ◄────────────── asr.final event   (定稿)

asr.stop({streamId})   ────────────►   AudioCaptureService.stop()
                                       └─► ASRGateway.close()
```

**前提**:JS 不需要拿到原始音频,只拿转写文本 → 验证现有产品需求,**确认不需要**(回答评估、压缩 Agent 都只看文本)。

### 4.5 火山引擎接入

#### 4.5.1 LLM(火山方舟 ARK)

```swift
// LLMGateway.swift 关键调用
let url = URL(string: "https://ark.cn-beijing.volces.com/api/v3/chat/completions")!
var req = URLRequest(url: url)
req.httpMethod = "POST"
req.setValue("Bearer \(arkApiKey)", forHTTPHeaderField: "Authorization")
req.setValue("application/json", forHTTPHeaderField: "Content-Type")
req.httpBody = try JSONEncoder().encode(payload)

// 流式 SSE
let (bytes, _) = try await URLSession.shared.bytes(for: req)
for try await line in bytes.lines {
    guard line.hasPrefix("data: ") else { continue }
    let data = line.dropFirst(6)
    if data == "[DONE]" { break }
    let chunk = try JSONDecoder().decode(ChatChunk.self, from: Data(data.utf8))
    bridgeEvent("stream-chunk", streamId, chunk)
}
```

模型选择(Settings 页下拉):
- `doubao-seed-1-6-250615`(默认 — 主力,Parse / Framework / Interviewer / Report)
- `doubao-seed-1-6-flash-250615`(Reference / Compression / Observer 用,降本)
- `doubao-seed-1-6-thinking-250715`(Reflection / Coach 用,深度推理)

#### 4.5.2 ASR(火山流式 SAUC)

```swift
// ASRGateway.swift 关键调用
let url = URL(string: "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel")!
var req = URLRequest(url: url)
req.setValue(appKey, forHTTPHeaderField: "X-Api-App-Key")
req.setValue(accessToken, forHTTPHeaderField: "X-Api-Access-Key")
req.setValue("volc.bigasr.sauc.duration", forHTTPHeaderField: "X-Api-Resource-Id")
req.setValue(UUID().uuidString, forHTTPHeaderField: "X-Api-Connect-Id")

let task = URLSession.shared.webSocketTask(with: req)
task.resume()

// 首帧:full-client-request(JSON 配置)
let header: [UInt8] = [0x10, 0x10, 0x11, 0x00] // 4-byte custom header
let configJson = """
{"audio":{"format":"pcm","rate":16000,"channels":1},"request":{"model_name":"bigmodel","enable_itn":true,"enable_punc":true}}
"""
let firstFrame = Data(header) + configJson.data(using: .utf8)!
try await task.send(.data(firstFrame))

// 后续:audio-only 帧(每 200ms 一包)
for await pcmChunk in audioStream {
    let audioFrame = Data([0x11, 0x10, 0x11, 0x00]) + pcmChunk
    try await task.send(.data(audioFrame))
}

// 接收
for try await message in task.receive() {
    let result = parseResult(message)
    if !result.utterances.last?.definite ?? true {
        bridgeEvent("asr.partial", streamId, result.text)
    } else {
        bridgeEvent("asr.final", streamId, result.text)
    }
}
```

**鉴权凭证存储**:用户在 Settings 页填 `AppID` + `Access Token` 两个字段,合并存 Keychain(`account="volc-asr"`,`secret={appId, accessToken}` JSON)。

---

## 5. Agent 体系(继承,落地形态变更)

10 个 Agent + 1 Orchestrator 全部保留(L0)。每个 Agent 从 `apps/api/app/agents/<name>/` 迁到 `apps/desktop/src/core/agents/<name>/`。

### 5.1 Agent 落地映射

| Agent | Python 现状 | TS 重构后 |
|---|---|---|
| Parse | Pydantic schema + Instructor + LiteLLM | Zod + Vercel AI SDK `generateObject` + ARK provider |
| Research | 同上 + 联网工具 | 同上 + 工具改前端 fetch (CORS 友好的搜索 API) |
| Framework | 同上 | 同上 |
| Interviewer | 同上 | 同上 |
| Reference | 同上 | 同上 |
| Compression | 同上 + asyncio wait_for(3s) | 同上 + `Promise.race` + AbortController |
| Report | 同上 | 同上 |
| Coach | 同上 + asyncio fire-and-forget | 同上 + Promise(不 await) |
| Reflection | 同上 | 同上 |
| Observer | 同上 | 同上 |

### 5.2 Agent 接口签名(TS)

每个 Agent 必须导出:

```typescript
// 例:apps/desktop/src/core/agents/parse/index.ts
export const ParseInputSchema = z.object({...}).strict();
export const ParseOutputSchema = z.object({...}).strict();

export type ParseInput = z.infer<typeof ParseInputSchema>;
export type ParseOutput = z.infer<typeof ParseOutputSchema>;

export interface ParseAgentDeps {
  llm: LLMGateway;       // 由 graph 注入
  logger: Logger;
}

export async function runParseAgent(
  input: ParseInput,
  deps: ParseAgentDeps
): Promise<ParseOutput> {
  // 1. validate input(Zod)
  // 2. build messages from prompt template
  // 3. llm.generateObject({ schema: ParseOutputSchema, ... })
  // 4. retry on validation fail (Vercel AI SDK 内置)
  // 5. return validated output
}
```

---

## 6. LangGraph.js 三图(节点名锁继续生效)

### 6.1 节点名锁(L0,继承)

```typescript
// turnGraph.ts
export const TURN_GRAPH_NODES = Object.freeze(
  new Set(["turn_assessment", "compression", "next_question"])
);

// intakeGraph.ts
export const INTAKE_GRAPH_NODES = Object.freeze(
  new Set(["parse_node", "research_node", "predict_questions_node"])
);

// postReportGraph.ts
export const POST_REPORT_GRAPH_NODES = Object.freeze(
  new Set(["coach_node", "reflection_node"])
);
```

三套节点名 = Python 版的 1:1 复制,**任何变更必须经 PRD 增量备案**。

### 6.2 三个 contract 测试(必须通过才能合并)

```typescript
// apps/desktop/src/__tests__/turnGraph.contract.test.ts
test("turn_graph 节点名集合锁", () => {
  const compiled = buildTurnGraph();
  const actualNodes = new Set(compiled.nodes.map(n => n.id));
  expect(actualNodes).toEqual(TURN_GRAPH_NODES);
});
```

类似 Python 版的 `test_graph_contract.py`,迁移到 Vitest。

### 6.3 LangGraph.js Channel 与 Python 等价

| Python | TS |
|---|---|
| `StateGraph(StateType)` | `new StateGraph<StateType>({ channels })` |
| `add_node("name", fn)` | `.addNode("name", fn)` |
| `add_edge("a", "b")` | `.addEdge("a", "b")` |
| `add_conditional_edges` | `.addConditionalEdges` |
| `START / END` | `START / END` |
| `compile()` | `.compile()` |
| `ainvoke(input)` | `.invoke(input)` |

并行:LangGraph.js 与 Python 版一样,多个从 START 出发的节点会自动并发执行,`Promise.all` 等价。

---

## 7. 数据模型

### 7.1 SQLite Schema(via GRDB.swift)

表结构 1:1 继承 v3.3,只是迁移工具从 Alembic 换成 Swift 端手写迁移脚本。

核心表(继承,不变):
- `sessions` / `turns` / `parse_results` / `frameworks` / `reports` / `meta_reports`
- `user_insight_cache`(F-318 Coach Agent)
- `reflections`(F-322 Reflection Agent)
- `research_cache`(F-320 Research Agent)
- `app_settings`(`com.eatit.research_optin` / `com.eatit.ark_model_pref` 等)

### 7.2 Zod Schema 迁移规则

| Pydantic | Zod |
|---|---|
| `BaseModel` | `z.object({...})` |
| `Field(default=...)` | `.default(...)` |
| `Literal["a", "b"]` | `z.union([z.literal("a"), z.literal("b")])` 或 `z.enum(["a","b"])` |
| `extra="forbid"` | `.strict()` |
| `min_length=1, max_length=3` | `.min(1).max(3)` |
| `constr(pattern=...)` | `z.string().regex(...)` |
| `Optional[X]` | `X.optional()` 或 `X.nullable()` |
| `Annotated[..., AfterValidator(fn)]` | `.refine(fn, message)` |

**关键护栏**:`extra="forbid"` → `.strict()` **必须保留**(L0 Research Agent 隐私护栏依赖 schema 拒绝额外字段)。

### 7.3 数据库迁移

`apps/macos/Eatit/Services/DatabaseService.swift` 内嵌迁移脚本数组:

```swift
let migrations: [String] = [
    // v1: sessions/turns/parse_results...(从 alembic 0001-000N 翻译)
    """
    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        ...
    );
    """,
    // v2: ...
]
```

启动时检查 `PRAGMA user_version`,顺序执行未应用的迁移。

---

## 8. 关键流程

### 8.1 录音 → 流式字幕 → Agent 评估(F-009 + F-403)

```
[用户按住空格]
   │
   ▼
[JS InterviewPage] ──► nativeBridge.call("asr.start", {streamId})
                         │
                         ▼
[Swift ASRGateway] ──► 建立 WS 到火山 SAUC,发首帧 config
                         │
                         ▼
[Swift AudioCaptureService] ──► AVAudioEngine 启动,16kHz mono PCM,200ms 一包
                         │
                         ▼
[Swift ASRGateway] ──► 每收 200ms PCM,WS 推帧
                         │
                         ▼
[火山 SAUC] ──► 流式返回 partial / final 结果
                         │
                         ▼
[Swift ASRGateway] ──► 通过 BridgeEvent 推 asr.partial / asr.final 给 JS
                         │
                         ▼
[JS InterviewPage] ──► 字幕实时刷新("边说边出字")
                         │
[用户松开空格]
                         ▼
[JS] ──► nativeBridge.call("asr.stop", {streamId})
        ──► 拿最后的 final text 调 Compression Agent + 进 turn_graph
```

### 8.2 LLM 流式调用(F-402)

```
[JS Agent.run] ──► llmGateway.chatStream({messages, model, response_format})
                    │
                    ▼
                  nativeBridge.call("llm.chatStream", {...streamId})
                    │
                    ▼
[Swift LLMGateway] ──► URLSession SSE → ARK Chat Completions
                    │
                    ▼
                  每收一条 SSE → BridgeEvent("stream-chunk", streamId, delta)
                    │
                    ▼
[JS] ──► async iterator yield 每个 chunk
        ──► UI 渐进渲染 + 累积 buffer
        ──► [DONE] 后 Zod parse(buffer) 完成 structured output
```

### 8.3 数据库读写(F-007 / F-008 / F-316)

```
[JS HistoryPage] ──► db.query("SELECT * FROM sessions ORDER BY created_at DESC LIMIT 50")
                      │
                      ▼
                    nativeBridge.call("db.query", {sql, params})
                      │
                      ▼
[Swift DatabaseService] ──► GRDB.swift Database.read { db in ... }
                      │
                      ▼
                    rows JSON 化 → BridgeResponse
                      │
                      ▼
[JS] ──► TanStack Query 缓存 + 渲染 StatCard / 表格
```

---

## 9. L0 红线(继承全部 + v3.4 增补)

### 9.1 继承自 v3.2 + v3.3(全部保留,落地从 Python 转 TS)

1. ✅ 通过可能性禁止"不建议/不通过",仅 中上 / 中 / 中下 三档(伦理)
2. ✅ AI 参考回答默认折叠
3. ✅ Coach Agent 必须异步,记录页打开时不实时调用
4. ✅ Reflection Agent 必须异步,不阻塞 Report 主流程
5. ✅ Tips 过场动画失败时降级为 shimmer
6. ✅ 填充词检测列表固定 7 词:嗯/呃/那个/就是/这个/反正/然后然后
7. ✅ InterviewerPersona 4 名锁:Sarah / Marcus / Lin / Daniel
8. ✅ 五维度评分 name 严格锁:专业深度 / 结构化表达 / 批判性思考 / 业务直觉 / 沟通节奏;长度严格 = 5 或空
9. ✅ 数据契约只增不改:`pass_probability` 等老字段保留作向后兼容
10. ✅ 12 禁止词清单(伦理护栏)
11. ✅ Research Agent 联网情报隐私护栏:opt-in / 仅公司名+岗位+行业关键词 / 禁止简历正文+PII / cache_key hash 化
12. ✅ Reflection 教学语气护栏:不得评判式 / 必须建设性 / "建议下次"句式
13. ✅ LangGraph 节点名锁(三图):turn / intake / post_report
14. ✅ 配置参数锁:`style` 4选1 / `directions` 6 选 1-3 / `duration_minutes` 3选1
15. ✅ Tailwind 默认色板封禁(`bg-green-500` / 十六进制色值禁用)
16. ✅ design-reference 是 UI 实现真理来源

### 9.2 v3.4 新增红线

#### 总纲(优先级最高,一切其他红线的根)

17. 🚫🚫🚫 **Mac App Store 上架是 v3.4 不可妥协的最终交付定义**(v3.4 总纲红线,**优先级 = MAX**)
    - **唯一交付定义**:本项目 v3.4 的"完成"=「应用通过 Mac App Store Review + 在 App Store 商店里可被搜索/下载/双击运行」。任何不满足这一条的状态(包括"功能跑通但未提交 Review"、"提交但被拒未处理"、"上架但 Sandbox 关闭")均**视为未完成**
    - **唯一分发渠道**:产品交付期间禁止任何"备用分发路径"——
      - ❌ DMG 直分发 / ad-hoc 签名 / 自家网站下载链接
      - ❌ Homebrew Cask 第三方仓库
      - ❌ 朋友圈 / 群聊发 .app 压缩包
      - ✅ 仅例外:Apple Developer 自家的 **TestFlight 内测**(开发期使用)
    - **冲突立即调整,不得延期**:任何与 App Store Review Guidelines 冲突的技术方案必须**当场调整**——不得"先上线再说"、不得"先打补丁绕过审核"、不得"等老板施压再改"
    - **历史教训**:v3.0~v3.3 的 Tauri + Python sidecar + faster-whisper + PyAV 架构是**永久排除清单**,不得在任何节点试图回退,即使它们能让某个 feature 更容易实现
    - **本条是 v3.4 红线 18~26 的总纲,所有具体红线都是这条的衍生落地**

#### 衍生红线(都是 17 总纲的具体形态,违反任一条即破坏总纲)

18. 🚫 **Sandbox 必须开启**:`com.apple.security.app-sandbox = true`,任何 PR 不得移除(对应 Guideline 2.4.5(i))
19. 🚫 **不得引入未签名二进制**:Frameworks/ 下所有 `.dylib` 必须 Team ID 签名;Build Phase 加 codesign 校验脚本,缺签直接 fail build
20. 🚫 **WebView 网络白名单**:WKWebView 内 fetch 仅允许 `ark.cn-beijing.volces.com` + `openspeech.bytedance.com`(后者其实由 Swift 调,WebView 不直接连);其他外站 fetch 通过 `WKContentRuleList` 拦截
21. 🚫 **不得引入 Network Server entitlement**:本地不监听端口,任何节点试图加 `network.server` 必须经 PRD 增量备案(因为它会触发 Review 追问"为什么本地需要监听端口")
22. 🚫 **不得使用 disable-library-validation**:此 entitlement 在方案 A(Python sidecar)需要,方案 B 不需要,任何节点试图加必须先证明 v3.4 架构破坏不可避免(等价于回退到方案 A,违反总纲 17)
23. 🚫 **API Key 全程不进日志 / 不进 Sentry / 不落 SQLite**:仅在 Keychain + Swift Service 内存中存在;调用 LLM/ASR 时仅在 URLRequest header 里出现(违反会触发 Review Guideline 5.1.1 隐私问题)
24. 🚫 **Bridge 协议 schema 化**:JS↔Swift 所有消息必须 Codable + Zod 双端校验,禁止裸 JSON 字符串(隐式契约破裂会让 Review 测试时崩溃)
25. 🚫 **TS 端 `extra="forbid"` 等价 `.strict()` 必须保留**:Research Agent 输入 schema 在内的所有"防扩散"schema 必须用 `.strict()`,与 Python 版行为对齐(违反破坏 v3.3 红线 11 联网隐私护栏)
26. 🚫 **macOS 14.0+ 锁**:`LSMinimumSystemVersion` 不得降低,任何 13.x 兼容性诉求需 PRD 增量备案(降版本会引入 Sandbox 行为差异,增加 Review 不确定性)
27. 🚫 **不得运行时下载可执行代码**:对应 Guideline 2.5.2,本项目仅可下载文本/JSON/图像/音频等数据资源,绝不下载 `.so` / `.dylib` / `.js`(动态执行的 JS bundle)/ 任何 native 代码模块

### 9.3 v3.4 总纲红线的执行机制

> 单纯把"必须上 App Store"写成红线不够,必须把它机械化成可在每个节点强制执行的检查项。本节定义机制。

#### 9.3.1 节点级闸门(每个 Ralph 节点 acceptance 必含)

每个 v3.4 节点的 `Acceptance` 段必须包含以下检查项中**至少 1 个**(根据节点性质):

- **Build 闸门**:`xcodebuild -scheme Eatit archive` 必须成功,且产物 entitlements `codesign -d --entitlements - Eatit.app` 输出与 [4.3](#43-sandbox--entitlements) 一致
- **Sandbox 闸门**:`spctl --assess --verbose=4 Eatit.app` 必须返回 `accepted source=Notarized Developer ID`(开发期允许 `unsigned`,但 M6 起必须 notarized)
- **Network 闸门**:`nettop -m process` 监控运行中的 Eatit,出站连接仅命中白名单 host(对应红线 20)
- **Privacy Manifest 闸门**:`grep -c "NSPrivacyTracking" Eatit.app/Contents/Resources/PrivacyInfo.xcprivacy` ≥ 1(M6 起强制)
- **TestFlight 闸门**(M1 起每节点末尾):`xcrun altool --upload-app` 必须能上传到 App Store Connect 不被拒(开发期内测渠道,验证签名 + Privacy Manifest 完整性)

#### 9.3.2 Review 失败回滚机制(M7 期间)

- 第 1 次 reject:48 小时内分析 + 修复 + 重提
- 第 2 次 reject:启动**架构 review meeting**,评估是否触发紧急 PRD 增量(v3.4.1 之类)
- 第 3 次 reject:**触发总纲红线 17 的"冲突立即调整"条款**,所有功能开发暂停,全员转 review fix
- 不得选择"放弃 App Store 改走 Developer ID 公证"作为兜底——这违反总纲 17

#### 9.3.3 不得绕过的"诱惑型"反模式

以下做法在开发中会自然出现,但**必须主动拒绝**:

- ❌ "先上 Developer ID 公证版给老板看,App Store 后面慢慢搞"——违反总纲 17 唯一分发渠道条款
- ❌ "先把 Python sidecar 跑起来,后面再想办法过 Sandbox"——违反总纲 17 永久排除清单
- ❌ "Privacy Manifest 后面再写,先把功能跑通"——违反节点闸门 9.3.1
- ❌ "ASR 先用浏览器内 WebSocket 调试,后面再迁 Swift"——浏览器内根本调不通(火山 ASR header 鉴权),且触发"先打补丁绕过"反模式
- ❌ "跨 macOS 版本兼容到 13,扩大用户群"——违反衍生红线 26 + 增加 Review 不确定性

---

## 10. 非功能性需求

### 10.1 性能基线

| 指标 | 目标 | 现状(Tauri 版) |
|---|---|---|
| 应用启动到 Home 页可交互 | < 500ms | 1-2s |
| 简历 Parse 端到端 | < 15s(取决于火山 ARK)| 8-15s(本地 LiteLLM) |
| ASR 首字延迟(说话开始 → 第一个字出现) | < 800ms | 现有方案不可比(批量) |
| ASR 端到端(松手 → final text) | < 1.5s | 当前方案 8-15s |
| 应用包体 | ≤ 30 MB | 127 MB |
| 应用内存峰值 | ≤ 250 MB | 600+ MB(含 Python) |

### 10.2 隐私 / 数据流

- **永不上传**:简历 / JD / 面试转写 / 报告 / 跨场次分析 / Reflection
- **出站请求(仅 2 个 host)**:
  - `https://ark.cn-beijing.volces.com/api/v3/chat/completions`(所有 LLM 调用)
  - `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel`(所有 ASR 调用)
- **API Key 处置**:仅 Keychain(`com.eatit.desktop` service);卸载应用 macOS 自动清理 Keychain
- **第三方 SDK / 跟踪**:零(无 Sentry / 无 Firebase / 无 Google Analytics);可选 telemetry **不在 v3.4 引入**

### 10.3 Privacy Manifest(`PrivacyInfo.xcprivacy`)

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

---

## 11. 里程碑(8-12 周,Ralph 节点驱动)

> 拆分原则继承 v3.3 经验:**单节点 ≤ 200 行 / ≤ 8 文件 / spec ≤ 100-150 行 markdown**,避免 Stream Idle Timeout。

### M1 — Xcode 工程脚手架(1 周)

- **M1.1** 新建 Xcode macOS App 工程(target macOS 14.0,SwiftUI lifecycle + AppKit WKWebView)
- **M1.2** 自定义 URL scheme `eatit://app/index.html` + `WKURLSchemeHandler` 加载 bundle 内静态 React build
- **M1.3** Apple Developer 证书 + Provisioning Profile 配置 + 第一份 TestFlight build(Hello World 出图)
- **M1.4** Eatit.entitlements 初版 + Info.plist + PrivacyInfo.xcprivacy 占位

**产出**:`apps/macos/Eatit.xcodeproj/`,空壳能在 TestFlight 安装

### M2 — Swift Native Services(1.5 周)

- **M2.1** `BridgeRouter` + `BridgeMessage` Codable 协议 + 测试
- **M2.2** `KeychainService`(SecItem CRUD)+ 测试
- **M2.3** `DatabaseService`(GRDB.swift + 空 schema)+ 测试
- **M2.4** `FilePickerService`(NSOpenPanel + drag-drop)+ 测试
- **M2.5** `PDFParserService`(PDFKit)+ 测试
- **M2.6** `AudioCaptureService`(AVAudioEngine 16kHz mono PCM)+ 测试
- **M2.7** `LLMGateway`(URLSession SSE → ARK Chat Completions stub)+ 测试
- **M2.8** `ASRGateway`(URLSessionWebSocketTask → 火山 SAUC stub)+ 测试

**产出**:7 个 Swift Service + Bridge,WebView 内 JS 能调通所有方法

### M3 — 后端逻辑迁 TS(3-4 周,**最大节点**)

- **M3.1**(3-5 天):基础设施
  - Zod schemas(11 个 schema 文件)
  - LLM provider 抽象 + Vercel AI SDK 接入 + ARK provider 实现
  - LangGraph.js 接入 + Hello World 单节点 graph
  - **acceptance**:1 个 Parse 调用从 JS 发起 → Swift Bridge → ARK → Zod parse 成功

- **M3.2**(3-5 天):简单 Agent 4 个
  - Parse / Reference / Compression / Observer
  - 每个 Agent 一份 Vitest 集成测试

- **M3.3**(5-7 天):核心 Agent + LangGraph.js 三图
  - turn_graph(turn_assessment / compression / next_question)
  - intake_graph(parse_node / research_node / predict_questions_node)
  - post_report_graph(coach_node ‖ reflection_node)
  - Interviewer / Framework / Research / Report / Coach / Reflection 6 个 Agent
  - 三个 contract 测试(节点名锁)

- **M3.4**(2-3 天):流式 ASR 接入
  - JS 端 `core/asr/volcStreamAsr.ts` 包装 BridgeEvent → AsyncIterator
  - InterviewPage 接入"边说边出字"
  - 端到端验证:按住空格 → 字幕实时 → 松开 → 最终文本

**产出**:21 个 F-ID 的核心逻辑全部跑在 TS 端

### M4 — UI 改造 + Bridge 接入(1 周)

- **M4.1** 替换所有 Tauri invoke 为 `nativeBridge.*`
- **M4.2** WebSocket 实时面试流改 AsyncIterator(本地函数,非网络)
- **M4.3** 21 个 F-ID UI 走查 + 修(对照 design-reference)
- **M4.4** 端到端冒烟测试:Onboarding → Upload → Config → Live → Report → History

**产出**:WKWebView 内完整跑通从首启到面试报告全流程

### M5 — 测试迁移 + Python 后端删除(1-2 周)

- **M5.1** 后端 471 pytest 处置
  - Agent 单测 → Vitest(估保留 ~300)
  - LangGraph 契约测 → Vitest(~50)
  - API 集成测全删(没有 API,~120)
- **M5.2** 前端 Vitest 扩充至 ~400+
- **M5.3** Playwright E2E 改造为 macOS UI Tests + 启动 Eatit.app 脚本
- **M5.4** 删除 `apps/api/` + `pyproject.toml` + `uv.lock` + `alembic*`
- **M5.5** `pnpm-workspace.yaml` 移除 api workspace
- **M5.6** README + AGENTS.md 同步更新

**产出**:Python 后端彻底退役

### M6 — Privacy Manifest + App Store 资产(3-5 天)

- **M6.1** PrivacyInfo.xcprivacy 完整版 + Review Notes 草稿
- **M6.2** 5 张 macOS 14 截图(1280×800)
- **M6.3** 隐私政策 URL(独立网页,公开可访问)
- **M6.4** App Store Connect 元数据:描述 / 关键词 / 分类 / 年龄分级
- **M6.5** 第一次 Archive + 上传到 App Store Connect

**产出**:第一次提交 Review

### M7 — Review 处理 + 上架(1 周)

预期 reject + 应对:

| 可能 reject 原因 | 应对 |
|---|---|
| 4.0 应用完整性 — 没填 Key 时 UI 报错 | M4.4 已加 Onboarding 引导,优化文案 |
| 4.0 没提供 demo Key | Review notes 加测试 ARK Key + ASR AppID/Token(短期 + 限额) |
| 5.1.1 隐私政策不完整 | 完善 privacy policy URL,明确写 BYOK 数据流 |
| 4.7 第三方代码下载 | 不会触发(我们没下载) |

**产出**:上架

---

## 12. 风险评估

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| LangGraph.js Channel 高级用法缺失 | 中 | 中 | 三图都不复杂,M3.3 spike 1 天验证;真不行手写 |
| Vercel AI SDK 不能完全替代 Instructor | 中 | 中 | 自己包一层 retry,Zod safeParse 失败重试 + 修正 prompt(参考 Python Instructor 实现) |
| WKWebView 内 React 18 启动性能比 Tauri 差 | 低 | 中 | M1 spike;Vite production build + tree-shaking |
| 火山 ASR 鉴权 4 字段任一不能从 header 传 | **极高,已确认** | **高,架构关键** | **方案 B 已修正:Swift native 代理,JS 不直连 WS** |
| 火山 ASR partial / final 字段 schema 与文档不一致 | 中 | 中 | M2.8 接 stub 时验证,留 fallback 解析逻辑 |
| 火山 ARK 在 macOS 出口 IP 偶发限流 | 低 | 中 | Swift LLMGateway 内置指数退避重试 |
| App Store Review 因 BYOK 被质疑(2.1 应用不完整)| 中 | 高 | Review Notes 写清楚 + Onboarding 引导 + demo Key |
| App Store Review 因 ASR/LLM 走第三方被要求 IAP | 低 | 高 | BYOK 不算 IAP 绕过;有先例(Cherry Studio 等);Review Notes 强调 |
| 数据库迁移脚本 bug 导致首启失败 | 低 | 高 | M2.3 + M5 充分单测 + 灰度(TestFlight 先试) |
| Mac App Store 4 GB 单 app 限制 | 极低 | 中 | 包体目标 30 MB,远低 |
| 用户 macOS 14.0 之前版本占比过高 | 中 | 中 | 14+ 用户占 70%+ (2026 数据);老板已确认放弃 |

---

## 13. App Store Review 准备清单

### 13.1 Review Notes(模板)

```
Eatit is a BYOK (Bring Your Own Key) AI mock interview tool for macOS.

KEY POINTS FOR REVIEW:
1. NO subscription, NO IAP, NO charges to users.
2. All AI features (LLM + ASR) require user to provide their own API keys
   from Volcengine Ark (火山方舟) and Volcengine Voice (豆包语音).
3. API keys are stored ONLY in macOS Keychain, never transmitted to our
   servers. We HAVE NO SERVER.
4. All interview data (resume, recordings, reports) stored locally in the
   app sandbox container. Nothing is uploaded except direct LLM/ASR calls
   to user-configured endpoints.
5. Network access:
   - https://ark.cn-beijing.volces.com (LLM)
   - wss://openspeech.bytedance.com (ASR)
   - No other outbound connections.

TEST CREDENTIALS (provided for review only, please do not redistribute):
   ARK API Key: <填短期测试 key>
   ASR AppID: <填测试 AppID>
   ASR Access Token: <填测试 token>

DEMO STEPS:
1. Launch app -> Onboarding shows -> click "Skip with test credentials"
   (this auto-fills the test key for review purposes)
2. Upload test resume + JD (sample files at: <your-public-url>/sample.zip)
3. Click "Start Parse" -> wait ~10s for Parse Agent
4. Click "Continue to Config" -> select default options
5. Click "Start Interview" -> wait ~30s for Framework Agent
6. Press and hold space bar to record answer (max 60s)
7. Click "End Session" -> wait ~20s for Report Agent
8. Review the generated report

Privacy Policy: <your-public-url>/privacy
Support: <your-email>
```

### 13.2 隐私政策必备点

- 数据收集:零(明确写"我们不收集任何用户数据")
- 数据传输:仅 2 个用户配置的第三方 endpoint
- 数据存储:本地 sandbox container,卸载即清除
- 第三方 SDK:零
- 用户控制:在「设置」中可清除所有数据 + 重置 Key

### 13.3 截图脚本(M6.2)

| # | 页面 | 卖点文案 |
|---|---|---|
| 1 | Home / Onboarding | "AI 模拟面试,完全本地,你的数据从不离开 Mac" |
| 2 | Upload + Parse | "上传简历 + JD,AI 综合解析 + 联网情报 + 题目预测" |
| 3 | Live(带字幕)| "实时语音转写,边说边出字,4 位面试官人格陪你练" |
| 4 | Report | "五维度评估 + 通过可能性 + 单题点评,带证据绑定" |
| 5 | History / Dashboard | "跨场次成长追踪 + AI Coach 个性化建议" |

---

## 14. 文档变更历史

| 版本 | 日期 | 变更 |
|---|---|---|
| v3.4 | 2026-05-04 | 初版。Tauri+Python 架构 → Xcode Swift 壳 + WKWebView + 全前端化;LLM/ASR 收敛火山引擎方舟 ARK + 流式 SAUC;ASR 走 Swift native 代理(WKWebView WebSocket header 限制);macOS 14+ 锁;新增 F-401~F-406;里程碑 M1~M7 / 8-12 周 |
| v3.4.1 | 2026-05-04 | 把"必须上 Mac App Store"升格为 v3.4 总纲红线(L0 第 17 条,优先级 = MAX);原 17~25 重编号为 18~26 并明确"都是总纲衍生";新增红线 27(运行时不得下载可执行代码);新增 9.3 总纲红线执行机制(节点级闸门 + Review 失败回滚 + 5 个反模式黑名单)|

---

## 15. 与 Ralph 自治循环对接

本版重构沿用 v3.3 已验证的 Ralph 工作流:

```
.ralph/specs/v34-macos-port-constraints.md   ← v3.4 红线汇总(本文档第 9 章)
.ralph/specs/v34-macos-port-sections.md      ← M1~M7 节点拆分(配合本文档第 11 章)
.ralph/fix_plan.md                            ← 节点 checklist
```

**节点 spec 必备 4 段(继承 v3.3)**:Goal / Files / Key Interfaces / Acceptance / Commit

**保护路径**:`.ralph/` 整目录 + `.ralphrc` Ralph 自身工作目录,Agent 实施时严禁修改。

**Tauri 退役边界**:M3.4 完成后(流式 ASR 跑通)Tauri 工程**完全删除**,不再保留双轨。具体节点:**M5.5** `apps/desktop/src-tauri/` 整目录删除 + `cargo` / `rust` 相关配置一并清理。
