# Eatit v3.4 macOS App Store Port — Fix Plan

Source of truth for what's left. Ralph picks the **first unchecked item** in "High Priority" each loop. Section specs live in:

- **当前阶段(v3.4 — macOS App Store 重构)**: [`.ralph/specs/v34-macos-port-constraints.md`](specs/v34-macos-port-constraints.md) + [`.ralph/specs/v34-macos-port-sections.md`](specs/v34-macos-port-sections.md)
- v3.3 全收尾(P3/M4,已完成 2026-05-01): [`.ralph/specs/v32-p3-constraints.md`](specs/v32-p3-constraints.md) + [`.ralph/specs/v32-p3-sections.md`](specs/v32-p3-sections.md)
- v3.3 P2/M3(已完成 2026-05-01): [`.ralph/specs/v32-p2-constraints.md`](specs/v32-p2-constraints.md) + [`.ralph/specs/v32-p2-sections.md`](specs/v32-p2-sections.md)
- v3.3 P1/M2(已完成 2026-04-30): [`.ralph/specs/v32-p1-constraints.md`](specs/v32-p1-constraints.md) + [`.ralph/specs/v32-p1-sections.md`](specs/v32-p1-sections.md)
- v3.2 P0(已完成 2026-04-30): [`.ralph/specs/v32-p0-constraints.md`](specs/v32-p0-constraints.md) + [`.ralph/specs/v32-p0-sections.md`](specs/v32-p0-sections.md)
- v3.1 历史阶段(已归档): `.ralph/specs/phase3-sections.md` / `phase3.5-sections.md` / `phase4-sections.md` / `phase5-sections.md`

Match the section prefix(`V34.M*.*`)to 当前 spec 文件即可。

> 🚫🚫🚫 **总纲红线**(L0 优先级 = MAX):
> Mac App Store 上架是 v3.4 不可妥协的最终交付定义。详 [`AGENTS.md` 第 6 节条款 13](../AGENTS.md) + [PRD v3.4 §9.2.17](../docs/PRD/Eatit_PRD_v3_4_macos_appstore.md)。
>
> **永久排除清单**:Tauri + Python sidecar + faster-whisper + PyAV(任何节点试图回退立即报告)
> **唯一分发渠道**:App Store + TestFlight 内测,**禁止** DMG / ad-hoc / Homebrew Cask / 自家网站

## High Priority (work top-down,52 节点 / 8-12 周)

> **节点 ID 规范**:
> - `M{n}.{m}` — 普通实施节点(developer 主导)
> - `M{n}.{m}.arch` — 架构设计节点(architect 主导,产 design doc)
> - `M{n}.{m}.dev` — 实施节点(developer 主导,跟在 .arch 后)
> - `M{n}.X` — milestone 末 audit 节点(tester 主导)
> - `M{n}.X.audit-fix` — audit 后修复节点(若 audit 发现 🔴)
>
> **多 Agent 协作模式**:每个节点 spec 头部声明 `Lead Agent`,Ralph loop 内根据声明派对应 subagent。架构敏感节点拆 .arch + .dev 两个 loop 跑。详 [`v34-macos-port-constraints.md` §H](specs/v34-macos-port-constraints.md)。

### M1 — Xcode 工程脚手架(1 周,5 节点 + 1 audit)

- [x] M1.1.arch Xcode 工程结构设计(architect)— 产 `.ralph/docs/v34-design/M1.1-xcode-project-structure.md`(303 行 / 10 H2 段;占位 + 终态 entitlements 双段 + ATS 仅 ark/openspeech 双 host + 严禁项白名单 6 项 + 14 条 M1.1.dev 实施 checklist)(85d35a9, 2026-05-04)
- [x] M1.1.dev Xcode 工程脚手架 + WKWebView Hello World(developer)— 产 `apps/macos/Eatit.xcodeproj/`(xcodegen v2.45.4 生成,project.yml 67 行权威 + pbxproj 494 行派生)+ 8 个 pre-staged 源文件(1e815a7)+ §B8 amendment(1533a2c 授权 xcodegen)。xcodebuild build SUCCEEDED, codesign 校验:app-sandbox=true / network.client=true / 5 项禁项全无 / Bundle Id = com.eatit.desktop。(8ba27a9, 2026-05-04)
- [x] M1.2 WKURLSchemeHandler + React build 加载(developer)— 产 `EatitURLSchemeHandler.swift`(103 行,含 path-traversal guard + MIME 映射)+ `vite.config.ts` 加 base/outDir/emptyOutDir + `scripts/sync-web-resources.sh`(preBuildScript,clean-rebuild 通过)+ project.yml `Eatit/Resources` → `Eatit/Resources/web` 修 M1.1.dev 双 Resources bug + .gitignore 排除 vite 产物。codesign:app-sandbox=true,无禁项。(900c373, 2026-05-04)
- [x] M1.3 Apple Developer 证书 + TestFlight 第一份 build(developer)— 产 `apps/macos/scripts/archive-and-upload.sh`(70 行,严格 App Store-only,override Apple Distribution + altool)+ `apps/macos/ExportOptions-AppStore.plist`(method=app-store / teamID=469QTH6TU2 / signingStyle=manual)+ 根 `.gitignore` 5 项 cert/profile 模式。**🟡 LIVE-UPLOAD 待人工**:Apple Developer Program 注册 / Apple Distribution 证书 .p12 装 keychain / App Store Connect App 记录 / app-specific password 存 keychain `AC_PASSWORD` / `export APPLE_ID=...` / 跑 `./scripts/archive-and-upload.sh`。详见 commit 758be58 body 内"Manual follow-up checklist"。(758be58, 2026-05-04)
- [x] M1.4 entitlements + Info.plist + PrivacyInfo 占位(developer)— 产 entitlements 三件套 + verify-entitlements.sh Build Phase 校验。Eatit.entitlements 占位 2-key → 终态 4-key(sandbox / network.client / files.user-selected.read-write / device.audio-input;keychain-access-groups 推迟到 M2.2 / Apple Dev Portal 配置后);Info.plist +LSApplicationCategoryType +NSAppTransportSecurity(严格 2-host 白名单,NSAllowsArbitraryLoads=false);PrivacyInfo.xcprivacy 占位(M6.1 完善 FileTimestamp / UserDefaults)。xcodebuild BUILD SUCCEEDED + verify 脚本输出 "✅ source entitlements verified"。(c8da395, 2026-05-04)
- [x] M1.X tester audit M1 全段(tester)— 产 `.ralph/logs/M1.X-audit.md`(285 行,6 H2 段;评分 9/10;0 🔴 严重缺口 → 不触发 audit-fix;7 🟡 minor 全部 known-deferred / doc-drift,不阻 M2)。同 commit 修 .gitignore:`!.ralph/logs/*-audit.md` 例外让未来 M2.X / M3.3.X / 等 audit 报告可入 git。(b2787a2, 2026-05-04)

### M2 — Swift Native Services(1.5 周,12 节点 + 1 audit)

- [x] M2.1.arch Bridge 协议设计(architect)— 产 `.ralph/docs/v34-design/M2.1-bridge-protocol.md`(472 行 / 12 H2 + 23 H3;18 method PRD §4.4.3 锁;§C3 keychain.get 仅返 `{exists}` 不返 secret;§K #6 反模式显式拒绝;手写 Codable+Zod 双端 schema 策略 + §B9 SOP;starter 错误码 codebook 22 行;in-process bridge 零 entitlement 增量)。(e02396b, 2026-05-04)
- [x] M2.1.dev BridgeRouter + Codable + Zod 双端契约(developer)— 产 Swift Bridge 三件套(BridgeRouter 132 行 / BridgeMessage 109 行 含 AnyCodable + Request/Response/Event / BridgeError 8 行)+ JS nativeBridge.ts(103 行,Zod discriminated-union)+ 双端测试(vitest 8/8 pass + XCTest 7 case 已写但 runner env-blocked)+ WebViewController 注册 messageHandler "eatit" + bridge.echo end-to-end smoke + zod ^4.4.2 + vitest include 扩展到 `src/**/*`。**🟡 XCTest 在本地 env 受 signing/provisioning 阻断**(同 M1.4 keychain-access-groups gate),M2.X audit 时再 re-verify。(458a24e, 2026-05-04)
- [x] M2.2 KeychainService(developer,**Parallel-safe**)— 产 Swift KeychainService(SecItemAdd/Update/Copy/Delete + 单 app 私有 keychain,§C2 access-group 推迟)+ 3 bridge methods(save/exists/delete,§C3 锁:**无** `keychain.get`/`keychain.read`)+ JS keychain wrapper(同样无 get)+ 双端测试(vitest 7/7 pass + XCTest 7 case 已写但 runner env-blocked,同 M2.1.dev)+ WebViewController.registerKeychainHandlers()(注册位置偏离 spec,沿用 M2.1.dev `bridgeRouter` 在 WebViewController 的模式,**未改 AppDelegate**)。xcodebuild build SUCCEEDED + tsc clean + verify-entitlements ✅ + 0 secret leak。(891a242, 2026-05-04)
- [x] M2.3 DatabaseService(GRDB.swift)(developer,**Parallel-safe**)— 产 GRDB.swift 7.10.0 SPM 依赖(xcodegen `packages` block,pbxproj 自动生成 +64 行)+ DatabaseService.swift 217 行(WAL `prepareDatabase` + sandbox `Application Support/Eatit/eatit.db` + 双 init `convenience init()` / `init(databasePath:)` + `applyMigrations()` PRAGMA user_version + `exec/query/tx` 3 方法 + BridgeDBValue/DatabaseValueRepresentation Codable 桥)+ Migrations.swift 空数组(M3 起追加)+ 3 bridge methods (db.exec/db.query/db.tx) 注册在 WebViewController.registerDatabaseHandlers()(沿用 M2.2 模式,**未改 AppDelegate**)+ db.ts(Zod RowSchema/ExecResultSchema)+ 双端测试(vitest 8/8 pass + XCTest 5 case 已写但 runner env-blocked,同 M2.1.dev/M2.2)+ Package.resolved 锁 GRDB rev 36e30a6f。xcodebuild build SUCCEEDED + tsc clean + verify-entitlements ✅(0 banned + sandbox=on)+ 0 secret leak。(96850be, 2026-05-04)
- [x] M2.4 FilePickerService(developer,**Parallel-safe**)— 产 FilePickerService.swift(`PickedFile` Encodable + `makePickedFile(from:)` static helper + `pick(accept:multiple:)` async @MainActor NSOpenPanel wrap;UTType.allowedContentTypes 文件类型过滤)+ DropAwareWebView 子类(WKWebView + `registerForDraggedTypes([.fileURL])` + `dropInterceptEnabled` toggle + `onFilesDropped` closure;放 WebViewController.swift 末尾控制文件数)+ 2 bridge methods (file.pick / file.dropEnable) + **新增 BridgeEvent type "file-dropped"**(§B9 同 commit 改 nativeBridge.ts BridgeEventSchema enum,Swift 端 BridgeEvent.type 是 open String 无需改)+ file.ts(Zod PickedFileSchema/FileDroppedPayloadSchema + `file.pick / dropEnable / onDrop` 含 unsubscribe)+ 双端测试(vitest 7/7 + 全套 30/30 无回归 + XCTest 4 case 已写但 runner env-blocked,同 M2.1.dev/M2.2/M2.3)。Pre-existing files.user-selected.read-write entitlement 覆盖 Powerbox,**无新 entitlement**。xcodebuild build SUCCEEDED + tsc clean + 0 banned entitlement + 0 secret leak。(7426edc, 2026-05-04)
- [x] M2.5 PDFParserService(PDFKit)(developer,**Parallel-safe**)— 产 PDFParserService.swift(`PDFExtractResult: Codable {text, pageCount}` + `PDFParseError {invalidBase64, invalidPDF}` typed errors + `extractText(base64:) throws` PDFKit `PDFDocument(data:)` 多页拼接)+ 1 bridge method `pdf.extractText` 注册在 WebViewController.registerPDFParserHandlers()(handler 区分 invalidBase64/invalidPDF 映射 BridgeError `pdf.invalid-base64` / `pdf.invalid-pdf`)+ pdf.ts(Zod PDFExtractResultSchema + `pdf.extractText` wrapper)+ XCTest 5 case **CGContext 程序化 PDF 生成**(无 binary 入 git,单/多页/invalidBase64/非PDF/空 string 全覆盖)+ vitest 7/7 + 全套 37/37 无回归。**spec 偏差**:① extractText Optional → throws typed error(信息更完整);② sample.pdf binary fixture → 程序化 CGContext 生成(deterministic + 无 git binary)。PDFKit 系统框架,无 SPM 增量,无 entitlement 增量。XCTest 同 M2.1.dev~M2.4 env-blocked。(53589c6, 2026-05-04)
- [x] M2.6 AudioCaptureService(AVAudioEngine)(developer)— 产 AudioCaptureService.swift(AVAudioEngine 麦克风录音 + AVAudioConverter 重采样到 16kHz mono Int16 LE + NSLock 保护 Data accumulator + `appendAndDrain` 切包到精确 6400 bytes / 200ms + 余数保留;`AudioError.{permissionDenied, engineStartFailed, converterInitFailed}` typed errors;`skipPermissionForTesting` + `setTestCallback` 测试缝)+ 2 bridge methods (audio.start/audio.stop) **仅控制开关**(§C3 PCM bytes **不出 Swift 边界**,M2.8 ASRGateway 在 Swift 内部注册 pcmCallback 直接消费)+ JS audio.ts 控制 wrapper(start/stop only,无 PCM 相关 method)+ XCTest 6 case(常量锁 6400/16000 + 4 个 accumulator drain 边界 6400/12800/余数/sub-threshold + stop 清空)+ vitest 6/6 + 全套 43/43 无回归。`device.audio-input` entitlement 与 `NSMicrophoneUsageDescription` Info.plist 在 M1.4 已就位,**无新 entitlement**。xcodebuild build SUCCEEDED + tsc clean + 0 banned + 0 secret/PCM leak。XCTest 同 M2.1.dev~M2.5 env-blocked。**🟡 protected path slip**:developer subagent 曾在工作树编辑 `.ralph/specs/v34-macos-port-sections.md`(M2.7.dev 拆分提议,未进 commit),Ralph 主进程已 `git checkout` 撤销 — §B6 违规但已无残留。(283f1f5, 2026-05-04)
- [x] M2.7.arch LLMGateway SSE 设计(architect)— 产 `.ralph/docs/v34-design/M2.7-llm-gateway.md`(986 行 / 11 H2 + 42 H3,远超 spec ≥ 5 H3 阈值)。覆盖 §1 节点边界 + L0 红线回引 / §2 endpoint(`https://ark.cn-beijing.volces.com/api/v3/chat/completions`)+ ATS 白名单 + URLSession 代码层**冗余 hostname check 决策(已采纳)**/ §3 Authorization Bearer 注入 + Keychain `ark-api-key` → Swift stack → header → ARC 释放序列图 + 禁日志 redact 规则 / §4 Codable + Zod 双端 schema 表(ChatCompletionRequest / Response / Message / Choice / Usage / ToolCall / ChatChunk / ChatChunkDelta;snake_case body 字段透传保留 OpenAI compat)/ §5 sync chat 重试策略(429/500/502/503/504 → 0.5s/1s/2s 指数退避 ×3)+ 11 个 `llm.*` BridgeError codes / §6 chatStream URLSession.bytes(for:) 行迭代 + `data: ` prefix + `[DONE]` 终止符 + `bridgeRouter.dispatchEvent("stream-chunk"/"stream-end"/"stream-error", streamId, payload)` / §7 **新 Bridge method `llm.stopStream({streamId})` + `[String: Task]` 字典 + `task.cancel()`(取消语义重做,放弃 JS AbortController)** + BridgeEventSchema enum 必扩 `stream-end`+`stream-error` / §8 Vercel AI SDK ai@^4 `createDataStream` adapter(BridgeEvent → ReadableStream<Uint8Array> SSE-formatted)+ `useChat` / `streamText` 调用样例 + ToolCall 穿透链 / §9 §K 反模式拒绝 5 条(messageHandler 传 Key / OpenAI proxy 绕 BYOK / 只 chat 不 chatStream / 临时关 ATS / 临时加 disable-library-validation)/ §10 测试矩阵(URLProtocol mock 7 case + Vitest contract test)/ §11 M2.7.dev 实施 5-phase roadmap + 21 项 checklist + **建议 .dev 拆 a/b/c 三子节点(架构师提议,留 Ralph 主进程裁决,**未直接编辑 spec 文件**§B6)**。0 真 key leak。**🟡 §B6 protected-path slip(已撤销)**:本 loop 开始时工作树有未授权 `.ralph/fix_plan.md`(28 行 diff,把 M2.7.dev/M2.8.dev/M3.1.1/M3.3.x 多节点拆子节点)+ `.ralph/specs/v34-macos-port-sections.md`(554 行 diff)修改,**非 architect subagent 引入**(architect 只 stage 了 design doc,正确遵守 §B6)。Ralph 主进程已 `git checkout` 撤销两文件。下一 loop 跑 M2.7.dev 时,Ralph 主进程基于 design doc §11.3 提议判断是否拆 .dev.a/b/c。(73f7f65, 2026-05-04)
- [x] M2.7.dev.a LLMGateway Codable 类型 + JSON 编解码(developer)— 不调网络。产 LLMTypes.swift(13 个 Codable struct/enum:ChatMessage / ResponseFormat / ToolDef / ToolChoiceCodable {auto,none,function} 自定义 single-value Codable / ChatCompletionRequest / Usage / ChatChoice / ChatCompletionResponse / ToolCallDelta + ChatChunkDelta + ChatChunkChoice + ChatChunk SSE 类型 / ToolCall;Swift `tool_call_id` / `tool_calls` / `top_p` / `max_tokens` / `prompt_tokens` / `finish_reason` 等 6 个 CodingKey 映射 camelCase 属性 → snake_case JSON;复用 BridgeMessage.swift 现有 AnyCodable 不重定义)+ llmTypes.ts(13 对 Zod schema,字段 snake_case 与 ARK/OpenAI compat 一致 §4.3 决策)+ XCTest 17 round-trip case(snake_case key 断言 + null content + ToolChoice 双形态 + canonical fixture)+ vitest 20/20 + 全套 63/63 无回归。**spec 偏差**:`byte-equal` 解读为"双端结构等价"(JSON encoder key 顺序不确定 → byte-level 跨平台不可达,architect §11.2 措辞精细化);实际 13 个 struct(非 12)因 ToolCallDelta SSE partial 与 ToolCall full 排布不同。**纯类型层**:0 URLSession / URLRequest / fetch / Keychain 引用,符合"不调网络"要求。xcodebuild build SUCCEEDED + tsc clean + 0 banned entitlement + 0 secret leak。XCTest 同 M2.1.dev~M2.6 env-blocked。(8aea261, 2026-05-04)
- [x] M2.7.dev.b LLMGateway.chat 同步 + 重试 + Bearer header(developer)— 产 LLMGateway.swift 165 行(`KeychainReading` protocol seam + `extension KeychainService: KeychainReading {}` 注入测试 mock,因 KeychainService final 不可子类化;`LLMChatResult` + `ARKErrorEnvelope` Codable;async `chat(_:)` + `makeRequest(body:accept:)`(§A0.4 stack-local apiKey → Bearer header → ARC 释放序列)+ `retryingURLSession(_:)` 指数退避 0.5s/1s/2s ×3 + `mapHTTPError(status:data:)` 11 个 llm.* error code 映射;§A0.3 代码层冗余 hostname `ark.cn-beijing.volces.com` 校验;`init(keychain:session:endpoint:)` 三路注入测试 seam(URLSession + endpoint 用于 URLProtocol mock 与 host-not-allowed case))+ 1 bridge method `llm.chat` 注册在 WebViewController.registerLLMHandlers()(`lazy var llmGateway` 避开 stored-property init ordering)+ JS llm.ts 40 行(`LLMChatResultSchema` Zod + `llmChat()` wrapper;`chatStream/stopStream` 仅留 deferral 注释 — .c/.d 实施)+ 8 vitest case + XCTest 7 case(MockURLProtocol + MockKeychainReading;happy 200 / 429 retry success / 500×4 retry exhaust / 401 no retry / api-key-missing zero-network / host-not-allowed zero-network / decode-failed)+ **新 CI gate `scripts/check-no-key-leak.sh`**(grep ban os_log/print/console.log Authorization/Bearer/apiKey/allHTTPHeaderFields + git ls-files key 字面量扫描)接 `apps/desktop/package.json scripts.lint:no-key-leak`。**spec 偏差**:① architect §3.2 pseudocode 是 `init(keychain: KeychainService)` 简单签名,改为协议注入 + 三路 init 是 final class 不可 mock 的必要 testability seam;② vitest 8 case > spec §10.2 头 2 case(扩到 contract scope checks + 2 额外 error code 映射)。0 banned entitlement / 0 secret leak / 0 key 字面量出 git。XCTest 同 M2.1.dev~M2.7.dev.a env-blocked。全套 vitest 71/71 无回归。(329d8f2, 2026-05-04)
- [x] M2.7.dev.c LLMGateway.chatStream SSE + Bridge events(developer)— LLMGateway.swift +97 行(`BridgeEventDispatching` protocol seam **Option C**(因 BridgeRouter 是 final class,沿用 .b `KeychainReading` pattern)+ extension `BridgeRouter: BridgeEventDispatching {}` 生产路径绑定 + async `chatStream(_:streamId:dispatcher:)` fire-and-forget(URLSession.bytes(for:) 行迭代 + `data: ` prefix + `[DONE]` 终止符 + `Task.checkCancellation()` 协作取消;dispatchEvent stream-chunk × N + stream-end finishReason / stream-error code)+ `streamRequest(_:)` helper 重建 stream=true 的 ChatCompletionRequest(因字段是 let)+ 复用 makeRequest 共享 §A0.4 Keychain Bearer 注入 + §A0.3 hostname check)+ WebViewController +71 行(`activeStreams: [String: Task<Void, Never>]` + `activeStreamsLock: NSLock` 同步 + 2 新 bridge methods `llm.chatStream` / `llm.stopStream` + 4 个内联 Codable struct;`LLMChatStreamParams.streamId` camelCase + ARK 字段 snake_case 混合命名 §4.3 footer 决策)+ `BridgeEventSchema` enum 扩展 **stream-end + stream-error**(§B9 同 commit JS Zod 改;Swift `BridgeEvent.type: String` open string 无需改)+ llm.ts +54 行(`StreamChunkPayloadSchema` / `StreamEndPayloadSchema` / `StreamErrorPayloadSchema` Zod + `llmChatStream(params)` / `llmStopStream(streamId)` 薄 Bridge wrapper,**无** AI SDK / createDataStream / 真调 ARK — 留 .d)+ XCTest 4 chatStream case(MockBridgeEventDispatching:SSE 5-chunk happy / network-interrupt 选 eof 路径 / cancel emits `llm.stream-cancelled` / 500 emits `llm.http-5xx-retry-exhausted`)+ vitest 7 new case(scope check 更新 + chatStream 契约 + 3 payload schema + BridgeEventSchema enum 反向断言)。**spec 偏差**:① architect §6.2 pseudocode `p.stream = true` 直接赋值在 immutable struct 不可行,改用 `streamRequest` helper 重建;② architect §10.1 row 9 "interrupt OR" 选择前者(stream-end + finishReason: eof)与 §6.2 实现路径一致;③ MockBridgeRouter Option C 协议 seam(`BridgeEventDispatching`)沿用 .b 同模式;④ architect §6.2 chatStream 签名 `router: BridgeRouter` → 改 `dispatcher: BridgeEventDispatching`(协议 seam 必然结果)。0 banned entitlement / 0 key 泄露 / 0 ai npm package(.d boundary 严守)。check-no-key-leak.sh exit 0。XCTest 同 M2.1.dev~M2.7.dev.b env-blocked。全套 vitest 78/78 无回归。(e0d5416, 2026-05-04)
- [x] M2.7.dev.d JS Ark provider + Vercel AI SDK + 真调火山 ARK 冒烟(developer)— **完整收尾 M2.7.dev 4-way split**(.a 8aea261 → .b 329d8f2 → .c e0d5416 → .d 本 commit)。`pnpm add ai@^4`(实际 `ai@4.3.19` 落 `apps/desktop/package.json` + lockfile +148 行)+ llm.ts +92 行(`createDataStream(streamId): ReadableStream<Uint8Array>` 适配器:BridgeEvent stream-chunk/stream-end/stream-error → OpenAI compat SSE wire format `data: {choices:[{delta:{content}}]}\n\n` × N + `data: [DONE]\n\n` sentinel + 三路径 unsubscribe cleanup 防内存泄漏 + reader.cancel() 触发 `bridge.call("llm.stopStream",{streamId})` 异常吞掉)+ `llmChatStreamAsAISDKStream(params)` 高级 wrapper(crypto.randomUUID + bridge.call("llm.chatStream") + createDataStream 三步组合,返 ReadableStream<Uint8Array>)+ vitest 6 new case(`describe("createDataStream")`:SSE 格式 / [DONE] terminator / stream-error rejection / streamId filtering / reader.cancel→stopStream;`describe("llmChatStreamAsAISDKStream")`:wrapper end-to-end)。**测试隔离策略**:每 case 用唯一 streamId(ds-chunk-1 等),依赖 stream-end/stream-error/cancel 三路径自动调用 unsubscribe 清 bridge.eventHandlers Set,无需 singleton reset。**spec 微偏差**:① ai@4.3.19 peer dep 期望 zod@^3.23.8 但项目锁 zod@4.4.2,createDataStream 不调 ai 内部 zod-using 路径,运行时无影响 — 不降级 zod;② package.json `"ai": "^4"`(pnpm 写省略 minor)= spec `"ai": "^4.0.0"` 等价。**真调 ARK 是 manual checklist**(architect §11.2 Phase 5,commit body 8 项 checklist 嵌入,非自动测试)。0 banned entitlement / 0 key 泄露 / 0 ARK_API_KEY 字面量 / xcodebuild build SUCCEEDED 回归 / vitest 全套 84/84 无回归 / check-no-key-leak.sh exit 0。**保留** .b/.c 落地的 lower-level wrappers (llmChat/llmChatStream/llmStopStream) 作为 building blocks 不破坏 contract。(d824edf, 2026-05-04)
- [ ] M2.8.arch ASRGateway WS 设计(architect)— 产 `.ralph/docs/v34-design/M2.8-asr-gateway.md`
- [ ] M2.8.dev.a ASR 二进制帧 packing/unpacking(developer)— ASRFrame.swift + Codable + 边界单测
- [ ] M2.8.dev.b ASRGateway WS connect + 4 header 鉴权 + 首帧(developer)
- [ ] M2.8.dev.c feedPCM + receive loop + partial/final dispatch(developer)
- [ ] M2.8.dev.d AudioCaptureService → ASRGateway 直连(developer)— 不经 JS,减延迟
- [ ] M2.8.dev.e JS asr.ts AsyncIterator + 真调 SAUC 冒烟(developer)
- [ ] M2.X tester audit M2 全段(tester)— 产 `.ralph/logs/M2.X-audit.md`,评分 ≥ 7/10 才能进 M3

### M3 — 后端逻辑迁 TS(3-4 周,21 节点 + 2 audit)

#### M3.1 — 基础设施(3-5 天)

- [ ] M3.1.1.a Zod schemas: common + assets(developer)
- [ ] M3.1.1.b Zod schemas: parse + frameworks(developer)
- [ ] M3.1.1.c Zod schemas: reports + sessions + turns(developer)— L0 锁:5 维度 / 3 档 / 12 禁止词 fuzz
- [ ] M3.1.1.d Zod schemas: coach + reflection + research + meta_reports(developer)— strict() 隐私 fuzz N=300
- [ ] M3.1.2 LLM provider 抽象 + ARK provider TS(developer)— 产 `core/llm/` + Vercel AI SDK retry 包装
- [ ] M3.1.3 LangGraph.js 接入 + Hello World graph(developer)— 验证 LangGraph.js v0.2 可用

#### M3.2 — 4 个简单 Agent(3-5 天,**全部 Parallel-safe**,可同时启 4 个 Ralph 实例)

- [ ] M3.2.1 Parse Agent (TS)(developer,**Parallel-safe**)— 产 `core/agents/parse/`
- [ ] M3.2.2 Reference Agent (TS)(developer,**Parallel-safe**)— 产 `core/agents/reference/`
- [ ] M3.2.3 Compression Agent (TS)(developer,**Parallel-safe**)— 产 `core/agents/compression/`,asyncio.wait_for 3s → Promise.race + AbortController
- [ ] M3.2.4 Observer Agent (TS)(developer,**Parallel-safe**)— 产 `core/agents/observer/`,fillerWords 7 词锁

#### M3.3 — 核心 Agent + LangGraph.js 三图(5-7 天,节点名锁 L0)

- [ ] M3.3.1.arch turn_graph 设计(architect)— 产 `.ralph/docs/v34-design/M3.3.1-turn-graph.md`
- [ ] M3.3.1.dev.a Interviewer Agent + Persona 4 名锁(developer)— 不动 graph
- [ ] M3.3.1.dev.b turn_graph 三节点接通 + 节点名锁(developer)— turnGraph.ts
- [ ] M3.3.2.arch intake_graph 设计(architect)— 产 `.ralph/docs/v34-design/M3.3.2-intake-graph.md`
- [ ] M3.3.2.dev.a Framework Agent(developer,**Parallel-safe with .b**)— predicted_questions 8-15 锁
- [ ] M3.3.2.dev.b Research Agent(developer,**Parallel-safe with .a**)— strict() 隐私 fuzz N=300
- [ ] M3.3.2.dev.c intake_graph 接通(developer)— parse → research → predict + 节点名锁
- [ ] M3.3.3.arch post_report_graph 设计(architect)— 产 `.ralph/docs/v34-design/M3.3.3-post-report-graph.md`
- [ ] M3.3.3.dev.a Report Agent 主报告(developer)— 5 维度 + 3 档 + 12 禁止词 sanitize
- [ ] M3.3.3.dev.b Coach Agent(developer,**Parallel-safe with .c**)— 跨 session 异步 + 教学护栏
- [ ] M3.3.3.dev.c Reflection Agent(developer,**Parallel-safe with .b**)— 单场教学复盘 + 句式护栏
- [ ] M3.3.3.dev.d post_report_graph 接通(developer)— coach ‖ reflection 并行 + 节点名锁
- [ ] **M3.3.X tester re-audit 三图(必须)**(tester)— 产 `.ralph/logs/M3.3.X-audit.md`,评分 ≥ 8/10 才能进 M3.4

#### M3.4 — 流式 ASR 接入(2-3 天,端到端关键)

- [ ] M3.4.1.arch 流式 ASR Bridge → AsyncIterator 设计(architect)— 产 `.ralph/docs/v34-design/M3.4.1-streaming-asr-async-iterator.md`
- [ ] M3.4.1.dev volcStreamAsr + InterviewPage 接入(developer)— 产 volcStreamAsr.ts + LiveCaption.tsx,"边说边出字"
- [ ] **M3.4.X tester re-audit 流式 ASR(必须)**(tester)— 端到端真录音验证,首字 < 800ms / 松手 < 1.5s

### M4 — UI 改造(1 周,3 节点 + 1 E2E)

- [ ] M4.1 Tauri invoke → nativeBridge 全替换(developer)— grep `@tauri-apps` 应为 0
- [ ] M4.2 WS interview stream → AsyncIterator(developer)— 删 `apps/desktop/src/api/ws.ts`
- [ ] M4.3 21 F-ID UI 走查 + 修(developer)— 对照 design-reference 7 页面
- [ ] M4.X tester E2E smoke 全流程(tester)— Onboarding → Settings → Upload → Parse → Config → Live → Report → History → Reflection

### M5 — 测试迁移 + 后端删除(1-2 周,5 节点)

- [ ] M5.1 后端 471 pytest 分类(tester)— 产 `.ralph/docs/v34-design/M5.1-pytest-migration-triage.md`,目标 KEEP ~300 / REWRITE ~50 / DELETE ~120
- [ ] M5.2.a Vitest port: agents/* (developer)— ≥ 100 tests
- [ ] M5.2.b Vitest port: orchestrator graphs contract (developer)— ≥ 30 tests
- [ ] M5.2.c Vitest port: domain / repositories / infra (developer)— ≥ 100 tests
- [ ] M5.2.d Vitest port: schemas + ethics fuzzers + 收尾 (developer)— 总数 ≥ 400 + tsc 干净
- [ ] M5.3 Playwright E2E 改造为启 Eatit.app(developer)— 5 个金标 E2E 在 .app 内跑通
- [ ] M5.4.arch apps/api 删除决策(architect)— 产 `.ralph/docs/v34-design/M5.4-python-retirement-decision.md`
- [ ] M5.4.dev 删除 apps/api + 残余清理(developer)— `apps/api/` 整目录删,grep Python 库引用应为 0
- [ ] M5.5 README + AGENTS.md + workspace 同步(developer)— pnpm-workspace 移除 api workspace

### M6 — Privacy Manifest + App Store 准备(3-5 天,5 节点 + 1 dual-audit)

- [ ] M6.1 PrivacyInfo.xcprivacy 完整版(developer)— FileTimestamp + UserDefaults 两类 NSPrivacyAccessedAPI
- [ ] M6.2 5 张截图 + 文案(product-manager,**Parallel-safe with M6.3/M6.4**)— 1280×800 macOS 14
- [ ] M6.3 隐私政策网页(product-manager,**Parallel-safe**)— 中英双语
- [ ] M6.4 App Store Connect 元数据(product-manager,**Parallel-safe**)— 描述/关键词/Review Notes
- [ ] **M6.X tester + product-manager 双审**(tester+product-manager)— 提交 Review 前最后一关
- [ ] M6.5 第一次 Archive + 上传 App Store Connect(developer)— `archive-and-upload.sh`

### M7 — Review 处理 + 上架(反应式,1+ 节点)

- [ ] M7.1+ Review reject 处理(按 reject 内容现场拆节点)(architect/developer/tester/product-manager,视情况)

> ⚠️ **第 3 次 reject 触发架构 review meeting**(constraints §K),**不得选择"放弃 App Store"作为兜底**。

---

## 待命态(EXIT_SIGNAL: true)条件

所有 M1~M7 节点 [x] + 应用上架到 App Store + 用户能搜索/下载/双击运行。

任何状态(功能跑通但未提交 / 提交被拒未处理 / 上架但 Sandbox 关闭)均**视为未完成**。

---

## Archived(v3.0~v3.3 已完成,v3.4 视为新 app,不读取老数据)

> v3.4 总纲红线规定 Tauri + Python + faster-whisper + PyAV 永久排除,以下章节仅作历史归档,Ralph 不再读取。

### Completed (v3.3 全收尾 / P3/M4 — 2026-05-01)



## Completed (P3/M4 — v3.2+, ARCHIVED v3.4)

- [x] V32.M4.X M4 收口文档同步(FEATURES.md F-315 ⏳→✅ + 把 P2 待做(M4)段改写成 P3 已完成(M4)+ v3.3 全收尾 banner;fix_plan High Priority 清空) (7488597, 2026-05-01)
- [x] V32.M4.1 F-315 SidebarQuotaCard + quotaMock localStorage(read/increment/reset/getRemaining + 跨月自动归零 + 默认 0/10 + "占位" 文案 + 5+4=9 vitest 单测;前端 160→169) (bbfc3af, 2026-05-01)
- [x] V32.M4.2 woff2 字体本地子集化(Inter Regular/Medium/Semibold 18-19K + Instrument Serif Regular 20K + JetBrains Mono Regular 30K + 3 SIL OFL 1.1 LICENSE + index.css 5 @font-face 替换 googleapis @import;A19 enforced) (ed1ce0d, 2026-05-01)
- [x] V32.M4.3 Playwright 烟雾 E2E(playwright.config + 2 spec + 3 fixtures + Tauri stub 解决 30s mount 阻塞 + LIFO route 顺序;upload-to-config + report-renders 2/2 passed in 2.7s;A20 enforced) (8cd24d3, 2026-05-01)
- [x] V32.M4.4 locust 性能骨架(parse_baseline.py + conftest_perf.py 1.5s P50 / 8s P95 mock + baseline.md 占位 + README + pyproject.toml norecursedirs;pytest collect 0 perf cases / 471 passed unchanged;A21 enforced) (01de0ae, 2026-05-01)

## Completed (P2/M3 — v3.2+)

- [x] V32.M3.X M3 audit-fix(G1 fire-and-forget 隔离测试 2 case:Coach build raise → report READY + Reflection build raise → report READY;G2 HistoryPage 集成测试 4 case:null/ok/running/failed AICoachCard 切分;只动测试,不动产品代码;后端 469→471 / 前端 156→160) (d08ea08, 2026-05-01)
- [x] V32.M3.2.3 F-322 ReportPage [评估] [详细复盘] tabs + ReflectionView 状态机(SegmentTabs 通用组件 + MockDialogue 双向气泡 + PerQuestionCoachingCard 折叠卡 + ReflectionView 6 状态 absent/loading/running/ok/failed/error + 2s/180s 轮询 + cached store 跳过首次 fetch + getReflection API client + reflection store slot + 14 tests;前端 142→156) (eab98cf, 2026-05-01)
- [x] V32.M3.2.2 F-322 reflection_node parallel coach + reflection_reports 表 + API(20260501_0001 迁移 + ReflectionReportRow session_id UNIQUE + ix_rr_session + SqlAlchemyReflectionReportRepository 4 lifecycle + uuid7 PK + DBReflectionReportLoader joins reports×turns + ReflectionService + GET /sessions/{id}/reflection 204/200/404 跨 user 鉴权 + POST_REPORT_GRAPH_NODES 锁扩到 {coach_node, reflection_node} + _generate_report_task 单 graph spawn 覆盖两节点 + 14 tests;后端 460→469) (0e92324, 2026-05-01)
- [x] V32.M3.2.1 F-322 Reflection Agent + ReflectionReport schema + 教学语气护栏(reflection 包 schemas/service/__init__ + system.j2/user.j2 + AGENT_NAMES 10 + extra=forbid 拒 PII + 12 禁止词 sanitize_tone + ACCUSATORY_PREFIXES "建议下次" 重写 + AI_VERDICT_CORE_TERMS 后置 regex 防重复评价 + ReflectionReport TS 类型 + 40 tests;后端 418→460) (4ca25d9, 2026-05-01)
- [x] V32.M3.1.5 F-316 复用上次配置 + HistoryFooterCTA(extractConfigFromSnapshot 防御 v3.1 老 snapshot + pickLastReusableConfig 跳过 malformed 行 + skipUpload/reuseLastConfig/consumeSkipUpload store actions + UploadPage useEffect 消费并 redirect /config + HistoryPage 挂 HistoryFooterCTA + 14 tests;前端 128→142) (4b8f3ec, 2026-05-01)
- [x] V32.M3.1.4 F-316/F-318 Dashboard 整版重写(4 StatCard + AICoachCard linear-gradient brand-softer + 4 FilterTabs + 6 列 SessionTable + getUserInsights API client + insights store slot + HistoryPage 全量重写并保留 MetaReport modal + 20 tests;前端 108→128) (ea30874, 2026-05-01)
- [x] V32.M3.1.3 F-318 user_insight_cache 表 alembic + GET /api/v1/users/me/insights API(20260430_0003 迁移 + UserInsightCacheRow + ix_uic_user_session + SqlAlchemyUserInsightCacheRepository 5 lifecycle 方法 SQLite ON CONFLICT + GET 路由 204/200 + build_default_coach_service 切到真 repo + 6 tests;后端 412→418) (8fff706, 2026-04-30)
- [x] V32.M3.1.2 F-318 post_report_graph + asyncio.create_task 异步触发(POST_REPORT_GRAPH_NODES={coach_node} A7-style 锁 + CoachService Protocols + InMemoryUserInsightCacheRepository 默认 + DBRecentReportsReader + _generate_report_task 末尾 fire-and-forget + _POST_REPORT_TASKS 强引用集 + 场次<3 跳过 / 幂等 / 失败非致命 / reader 抛错静默 + 12 tests;后端 400→412) (f62ffd5, 2026-04-30)
- [x] V32.M3.1.1 F-318 Coach Agent + UserInsightCache schema + 教学语气护栏(coach 包 schemas/service/__init__ + system.j2/user.j2 + AGENT_NAMES 9 + extra=forbid 拒 PII + 12 禁止词 sanitize + UserInsightCache TS 类型 + 21 tests;后端 377→400) (13a3da5, 2026-04-30)

## Completed (P1/M2.3 — v3.2+)

- [x] V32.M2.3.X M2.3 audit-fix(G1 _extract_company_and_role 改 Parse-driven jd_* + G2 _resolve_tools + 去 service.py:119 注释 + G3 ParseRequestResponse + UploadPage / store / ParsedPanel 透传 research_payload/predicted_questions + G4 research_cache repo 真读写 30天 TTL + G5/G6 ParsedPanel.research + ResearchOptInSection 集成测试 + G7 probe=True happy path + G8 except 已收窄至 PdfReadError/ValueError + G9 DialogTitle;intake_graph 并行→sequential trade-off;后端 365→377 / 前端 102→108) (557fc7d, 2026-04-30)
- [x] V32.M2.3.5 F-320/F-321 ParsedPanel 3 块卡 + PrivacyOptInDialog(CompanyCard + IndustryCard + PredictedQuestionList + Settings opt-in toggle + L0 A11 模态确认 + 21 tests;前端 81→102) (3bc6544, 2026-04-30)
- [x] V32.M2.3.4 F-320/F-321 intake_graph LangGraph(parse_node || research_node → predict_questions_node + 15s research timeout + opt-out short-circuit + trigger_parse 改用 intake_graph + 8 contract tests + turn_graph A7 锁未动;后端 354→362) (821172e, 2026-04-30)
- [x] V32.M2.3.3 F-321 Framework Agent PredictedQuestionBank(8-15 道 + 4 category + 3 source 枚举 + Framework 接 Research 输入 + Interviewer 软优先 + 20 tests;后端 334→354) (18d9b7b, 2026-04-30)
- [x] V32.M2.3.2 F-320 research_cache 表 + opt-in API(alembic 20260430_0002 30-day TTL + research_opt_in 加入 ALLOWED_KEYS + GET/PUT /api/v1/settings/research-opt-in StrictBool + 6 tests;后端 328→334) (a322a57, 2026-04-30)
- [x] V32.M2.3.1 F-320 Research Agent + LLM web_search tool 适配(extra=forbid + cache_key sha256 + audit log 脱敏 + BYOK tool use probe 降级 + 12 tests + AGENT_NAMES 增至 8;后端 314→328) (3b762bb, 2026-04-30)

## Completed (P1/M2.2 — v3.2+)

- [x] V32.M2.2.X M2.2 audit-fix(F-303 chips + MatchScore cross-field validator + 3 service fallback tests + 4 ParsedPanel integration tests + 3 ConfigPage focusSync tests + ParsedMetaBar 60s 自刷新;后端 299→314 / 前端 74→81) (4126dd3, 2026-04-30)
- [x] V32.M2.2.1 F-301 后端 ParseResult schema 扩展(MatchScore + profile_summary + advantages/gaps + interview_focus + project_hooks_v32 + 7 子 schema + 30 边界测试) (d14ea15, 2026-04-30)
- [x] V32.M2.2.2 F-303 候选 profile chips + F-304 PageStepIndicator(3 页统一 eyebrow + ParseResultCard ProfileChips + 4 tests;meta 行 file size/pages 推迟到 M2.2.4) (699ad5b, 2026-04-30)
- [x] V32.M2.2.3 F-302 FocusCard + F-305 ParsedMetaBar(relativeTime + selectedFocusIds store 联动 ConfigPage directions + 14 tests) (827f63e, 2026-04-30)
- [x] V32.M2.2.4 ParsedPanel 整页重构(MatchDial SVG 圆环 + StrengthGapList 双栏 + 接入 M2.2.1-3 + TipsCarousel large + 删老 ParseResultCard + 10 tests + 全量 74 passed) (31cdeec, 2026-04-30)

## Completed (P1/M2.1 — v3.2+)

- [x] V32.M2.1.X 测试缺口修补(audit fix:G1 bootstrap force-None / G2 删自证循环 + 改 prompt 文本守护 / G3 后端 fillerWords 锁 + 双端 diff / G4 wpm=100/200 边界 / G5/G6 TipsCarousel lower-bound + spec 4-5s 间隔 / G7 LiveObservationCard fallback / G8 contentEditable / G9 A10 legacy schema 6 项 / G10 InterviewPage 4 组件 smoke;后端 +12 / 前端 +20) (fb9bd15, 2026-04-30)
- [x] V32.M2.1.1 F-309 实时观察侧栏(InterviewerAgentOutput.live_observation ≤30 字 + LiveObservationCard + 7 boundary tests + A13 Observer fallback) (2d15550, 2026-04-30)
- [x] V32.M2.1.2 F-310 实时统计纯前端 hook(useTurnStats + 双端 L0 fillerWords 锁 + Vitest@^2 框架引入 + 12 tests + InterviewPage stat row) (c180456, 2026-04-30)
- [x] V32.M2.1.3 F-311 键盘快捷键(useGlobalKeymap + EndConfirmDialog + KeyboardShortcutHelper + 7 tests + 提前结束 按钮统一走确认弹窗) (6071069, 2026-04-30)
- [x] V32.M2.1.4 F-306 TipsCarousel 替换 WaitingTips(tips.json 25 条 + selectTips 合并 + 完成态 ✓ 0.4s 过渡 + 7 tests + 3 调用点迁移) (5bff886, 2026-04-30)
- [x] V32.M2.1.5 InterviewPage 顶部重构(RecBadge + SessionMetaStrip + WaveBars + RecentRounds + eatit-wave keyframe + session detail fetch + pastRounds 本地历史) (e60f8ea, 2026-04-30)

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
- M2.3.X audit-fix 完成后,P1/M2 全批(M2.1 + M2.2 + M2.3 + 3 audit-fix = 17 节点)收口。下一批 M3 需要 v32-p2-sections.md。
