import AppKit
import WebKit
import os.log

private let wvDiag = OSLog(subsystem: "com.eatit.desktop.asr", category: "webview")

final class WebViewController: NSViewController {
    private let schemeHandler = EatitURLSchemeHandler()
    let bridgeRouter = BridgeRouter()  // internal — accessible from tests and future service registration
    private var webView: DropAwareWebView!
    private let keychainService = KeychainService()
    private let databaseService: DatabaseService = {
        do { return try DatabaseService() }
        catch { fatalError("DatabaseService init failed: \(error)") }
    }()
    private let filePickerService = FilePickerService()
    private let pdfParserService = PDFParserService()
    private let audioCaptureService = AudioCaptureService()
    // lazy var avoids stored-property ordering issue: keychainService is init'd before this runs.
    // §A0.4: apiKey is read inside LLMGateway per-call; not cached here.
    private lazy var llmGateway: LLMGateway = LLMGateway(keychain: keychainService)
    // §A0.4: volc-asr-credentials read per-call inside ASRGateway; not cached here.
    private lazy var asrGateway: ASRGateway = ASRGateway(keychain: keychainService, router: bridgeRouter)
    // §C3: volc-asr-credentials read per-call inside TTSGateway; not cached here.
    private lazy var ttsGateway: TTSGateway = TTSGateway(keychain: keychainService)
    // §6.3: active SSE stream tasks keyed by streamId. NSLock for thread-safe mutation.
    private var activeStreams: [String: Task<Void, Never>] = [:]
    private let activeStreamsLock = NSLock()

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(schemeHandler, forURLScheme: "eatit")
        // Register BridgeRouter as WKScriptMessageHandlerWithReply (macOS 11+).
        // §A0.1 / §A0.2: in-process IPC via WKUserContentController, no new entitlement required.
        config.userContentController.addScriptMessageHandler(
            bridgeRouter,
            contentWorld: .page,
            name: "eatit"
        )
        webView = DropAwareWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        // Enable Web Inspector (right-click → Inspect Element) in Debug builds
        // so silent React render failures / JS exceptions / CSS issues are
        // diagnosable without rebuilding. macOS 13.3+ API. Archive/Release
        // builds inherit this — Apple's review doesn't complain about it.
        if #available(macOS 13.3, *) {
            webView.isInspectable = true
        }
        // 让 <input type="file"> 在 WKWebView 内可触发 NSOpenPanel(WKUIDelegate.runOpenPanel)。
        // M2.4 FilePickerService 的 bridge.call("file.pick") 是 JS 主动调用通道;
        // 这里是 web 标准 input.click() 通道,二者并存。§A0.1 复用 files.user-selected.read-write entitlement。
        webView.uiDelegate = self
        view = webView
        bridgeRouter.webView = webView
        // §A0.1: files.user-selected.read-write covers drop; Powerbox auto-grants access.
        webView.onFilesDropped = { [weak self] urls in
            guard let self = self else { return }
            let files = urls.compactMap(FilePickerService.makePickedFile(from:))
            let dicts = files.map { f -> [String: Any] in
                ["name": f.name, "size": f.size, "base64": f.base64]
            }
            self.bridgeRouter.dispatchEvent(
                type: "file-dropped",
                streamId: UUID().uuidString,
                payload: ["files": dicts]
            )
        }
        registerEchoHandler()
        registerKeychainHandlers()
        registerDatabaseHandlers()
        registerFilePickerHandlers()
        registerPDFParserHandlers()
        registerAudioCaptureHandlers()
        registerLLMHandlers()
        registerASRHandlers()
        registerTTSHandlers()
    }

    private func registerEchoHandler() {
        struct EchoParams: Codable { let msg: String }
        struct EchoResult: Codable { let msg: String }
        // Test method: bridge.echo({ msg }) → { msg }
        bridgeRouter.register(method: "bridge.echo") { (p: EchoParams) -> EchoResult in
            EchoResult(msg: p.msg)
        }

        // diag.log({ level, msg }) → 把 JS console 输出写进 macOS unified log。
        // 让 `log show --process Eatit` 能看到 JS 端日志。subsystem 用 com.eatit.desktop.js。
        struct LogParams: Codable { let level: String; let msg: String }
        struct LogResult: Codable {}
        let jsLog = OSLog(subsystem: "com.eatit.desktop.js", category: "console")
        bridgeRouter.register(method: "diag.log") { (p: LogParams) -> LogResult in
            let logType: OSLogType
            switch p.level {
            case "error", "rejection", "window-error":
                logType = .error
            default:
                logType = .info
            }
            os_log("[%{public}@] %{public}@", log: jsLog, type: logType, p.level, p.msg)
            return LogResult()
        }
    }

    /// Registers keychain bridge methods: save / exists / delete.
    /// §C3: keychain.read / keychain.get are intentionally NOT registered — secrets must not cross the Bridge boundary.
    /// §C2: Single-app private keychain mode; no kSecAttrAccessGroup (access-group entitlement deferred to Apple Dev Portal config).
    /// Design note: spec lists AppDelegate as the registration site, but M2.1.dev fixed bridgeRouter as a WebViewController
    /// property bound after webView is created — so registration lives here, not in AppDelegate.
    private func registerKeychainHandlers() {
        struct SaveParams: Codable { let account: String; let secret: String }
        struct AccountParams: Codable { let account: String }
        struct EmptyResponse: Codable {}
        struct ExistsResponse: Codable { let exists: Bool }

        bridgeRouter.register(method: "keychain.save") { [weak self] (p: SaveParams) -> EmptyResponse in
            guard let self = self else {
                throw BridgeError(code: "bridge.internal-error", message: "service released")
            }
            guard let data = p.secret.data(using: .utf8) else {
                throw BridgeError(code: "bridge.params-invalid", message: "secret encoding failed")
            }
            do {
                try self.keychainService.save(account: p.account, secret: data)
                return EmptyResponse()
            } catch {
                throw BridgeError(code: "keychain.save-failed", message: "\(error)")
            }
        }

        bridgeRouter.register(method: "keychain.exists") { [weak self] (p: AccountParams) -> ExistsResponse in
            guard let self = self else {
                throw BridgeError(code: "bridge.internal-error", message: "service released")
            }
            return ExistsResponse(exists: self.keychainService.exists(account: p.account))
        }

        bridgeRouter.register(method: "keychain.delete") { [weak self] (p: AccountParams) -> EmptyResponse in
            guard let self = self else {
                throw BridgeError(code: "bridge.internal-error", message: "service released")
            }
            do {
                try self.keychainService.delete(account: p.account)
                return EmptyResponse()
            } catch {
                throw BridgeError(code: "keychain.delete-failed", message: "\(error)")
            }
        }
    }

    /// Registers database bridge methods: db.exec / db.query / db.tx.
    /// §B9: Swift Codable + JS Zod schemas updated in same commit.
    /// §A0.4 / §E3: callers must not pass ARK_API_KEY / volc-asr-credentials / app-encryption-key as params.
    /// Design note: registration lives here (not AppDelegate), matching M2.1.dev / M2.2 pattern.
    private func registerDatabaseHandlers() {
        struct ExecParams: Codable { let sql: String; let params: [BridgeDBValue]? }
        struct QueryParams: Codable { let sql: String; let params: [BridgeDBValue]? }
        struct TxBridgeStatement: Codable { let sql: String; let params: [BridgeDBValue]? }
        struct TxParams: Codable { let statements: [TxBridgeStatement] }
        struct EmptyResponse: Codable {}

        bridgeRouter.register(method: "db.exec") { [weak self] (p: ExecParams) -> DatabaseService.ExecResult in
            guard let self = self else {
                throw BridgeError(code: "bridge.internal-error", message: "service released")
            }
            do {
                return try await self.databaseService.exec(
                    sql: p.sql,
                    params: (p.params ?? []).map(\.dbValue)
                )
            } catch {
                throw BridgeError(code: "db.exec-failed", message: "\(error)")
            }
        }

        bridgeRouter.register(method: "db.query") { [weak self] (p: QueryParams) -> [[String: DatabaseValueRepresentation]] in
            guard let self = self else {
                throw BridgeError(code: "bridge.internal-error", message: "service released")
            }
            do {
                return try await self.databaseService.query(
                    sql: p.sql,
                    params: (p.params ?? []).map(\.dbValue)
                )
            } catch {
                throw BridgeError(code: "db.query-failed", message: "\(error)")
            }
        }

        bridgeRouter.register(method: "db.tx") { [weak self] (p: TxParams) -> EmptyResponse in
            guard let self = self else {
                throw BridgeError(code: "bridge.internal-error", message: "service released")
            }
            do {
                let txStmts = p.statements.map {
                    DatabaseService.TxStatement(sql: $0.sql, params: $0.params?.map(\.dbValue) ?? [])
                }
                try await self.databaseService.tx(statements: txStmts)
                return EmptyResponse()
            } catch {
                throw BridgeError(code: "db.tx-failed", message: "\(error)")
            }
        }
    }

    /// Registers file bridge methods: file.pick / file.dropEnable.
    /// §A0.1: NSOpenPanel + drag-and-drop use files.user-selected.read-write (M1.4) — no new entitlement.
    /// §C3: payload is user resume/transcript content, not secret material.
    /// §B9: dual-end contract — JS Zod BridgeEventSchema enum updated in same commit.
    private func registerFilePickerHandlers() {
        struct PickParams: Codable { let accept: [String]?; let multiple: Bool }
        struct DropEnableParams: Codable { let enabled: Bool }
        struct EmptyResponse: Codable {}

        bridgeRouter.register(method: "file.pick") { [weak self] (p: PickParams) -> [PickedFile] in
            guard let self = self else {
                throw BridgeError(code: "bridge.internal-error", message: "service released")
            }
            return await self.filePickerService.pick(accept: p.accept, multiple: p.multiple)
        }

        bridgeRouter.register(method: "file.dropEnable") { [weak self] (p: DropEnableParams) -> EmptyResponse in
            guard let self = self else {
                throw BridgeError(code: "bridge.internal-error", message: "service released")
            }
            await MainActor.run {
                self.webView.dropInterceptEnabled = p.enabled
            }
            return EmptyResponse()
        }
    }

    /// Registers pdf.extractText bridge method.
    /// §B9: Swift PDFExtractResult Codable + JS PDFExtractResultSchema Zod in same commit.
    /// §C3: handler must NOT log p.base64 (PDF may contain candidate PII).
    private func registerPDFParserHandlers() {
        struct ExtractParams: Codable { let base64: String }

        bridgeRouter.register(method: "pdf.extractText") { [weak self] (p: ExtractParams) -> PDFExtractResult in
            guard let self = self else {
                throw BridgeError(code: "bridge.internal-error", message: "service released")
            }
            do {
                return try self.pdfParserService.extractText(base64: p.base64)
            } catch PDFParserService.PDFParseError.invalidBase64 {
                throw BridgeError(code: "pdf.invalid-base64", message: "params.base64 is not valid base64")
            } catch PDFParserService.PDFParseError.invalidPDF {
                throw BridgeError(code: "pdf.invalid-pdf", message: "decoded data is not a valid PDF")
            } catch {
                throw BridgeError(code: "pdf.extract-failed", message: "\(error)")
            }
        }
    }

    /// Registers audio.start / audio.stop bridge methods (control only; PCM stays Swift-internal).
    /// §C / §C3: PCM bytes never cross the JS boundary; M2.8 ASRGateway will register the
    /// pcmCallback at the Swift level when an interview turn begins.
    /// §B9: Codable params + Zod schemas updated in the same commit.
    private func registerAudioCaptureHandlers() {
        struct StartParams: Codable { let streamId: String }
        struct EmptyParams: Codable {}
        struct EmptyResponse: Codable {}

        bridgeRouter.register(method: "audio.start") { [weak self] (p: StartParams) -> EmptyResponse in
            guard let self = self else {
                throw BridgeError(code: "bridge.internal-error", message: "service released")
            }
            os_log("%{public}@", log: wvDiag, type: .info, "audio.start Bridge call streamId=\(p.streamId)")
            do {
                // M2.8.dev.d: PCM flows Swift→Swift in-process; zero JS hop (§C3 / §6.1).
                // If ASRGateway is not yet connected, handlePCMChunk silent-drops the chunk.
                try await self.audioCaptureService.start(streamId: p.streamId, onPCMChunk: { [weak self] pcmChunk in
                    // §C3: PCM bytes 直注入 ASRGateway,零 JS 经手。
                    // §6.1: in-process Swift→Swift callback; if ASR not connected, handlePCMChunk silent drop.
                    self?.asrGateway.handlePCMChunk(pcmChunk)
                })
                return EmptyResponse()
            } catch AudioCaptureService.AudioError.permissionDenied {
                throw BridgeError(code: "audio.permission-denied", message: "microphone permission denied")
            } catch AudioCaptureService.AudioError.converterInitFailed {
                throw BridgeError(code: "audio.converter-init-failed", message: "AVAudioConverter init failed")
            } catch AudioCaptureService.AudioError.engineStartFailed(let why) {
                throw BridgeError(code: "audio.engine-start-failed", message: why)
            } catch {
                throw BridgeError(code: "audio.start-failed", message: "\(error)")
            }
        }

        bridgeRouter.register(method: "audio.stop") { [weak self] (_: EmptyParams) -> EmptyResponse in
            guard let self = self else {
                throw BridgeError(code: "bridge.internal-error", message: "service released")
            }
            self.audioCaptureService.stop()
            return EmptyResponse()
        }
    }

    /// Registers LLM Bridge methods: llm.chat (sync) + llm.chatStream + llm.stopStream.
    /// §C3: Authorization injected in LLMGateway.makeRequest; never crosses Bridge.
    /// §A0.4: apiKey read per-call in LLMGateway, not stored in this controller.
    /// §B9: dual-end contract — BridgeEventSchema enum stream-end / stream-error updated same commit.
    private func registerLLMHandlers() {
        bridgeRouter.register(method: "llm.chat") { [weak self] (p: ChatCompletionRequest) -> LLMChatResult in
            guard let self = self else {
                throw BridgeError(code: "bridge.internal-error", message: "service released")
            }
            let resp = try await self.llmGateway.chat(p)
            let first = resp.choices.first
            return LLMChatResult(
                content: first?.message.content,
                toolCalls: first?.message.toolCalls,
                finishReason: first?.finishReason ?? "stop",
                usage: resp.usage
            )
        }

        struct LLMChatStreamParams: Codable {
            let streamId: String
            let model: String
            let messages: [ChatMessage]
            let stream: Bool?  // ignored, forced true by chatStream
            let temperature: Double?
            let topP: Double?
            let maxTokens: Int?
            let stop: [String]?
            let tools: [ToolDef]?
            let toolChoice: ToolChoiceCodable?
            let responseFormat: ResponseFormat?

            enum CodingKeys: String, CodingKey {
                case streamId  // camelCase per Bridge protocol §4.3 footer
                case model, messages, stream, temperature, stop, tools
                case topP = "top_p"
                case maxTokens = "max_tokens"
                case toolChoice = "tool_choice"
                case responseFormat = "response_format"
            }

            func asRequest() -> ChatCompletionRequest {
                ChatCompletionRequest(
                    model: model, messages: messages, stream: true,
                    temperature: temperature, topP: topP, maxTokens: maxTokens,
                    stop: stop, tools: tools, toolChoice: toolChoice,
                    responseFormat: responseFormat
                )
            }
        }
        struct LLMChatStreamStarted: Codable { let streamId: String; let started: Bool }
        struct StreamIdParams: Codable { let streamId: String }
        struct StopResult: Codable { let stopped: Bool }

        bridgeRouter.register(method: "llm.chatStream") { [weak self] (p: LLMChatStreamParams) -> LLMChatStreamStarted in
            guard let self = self else {
                throw BridgeError(code: "bridge.internal-error", message: "service released")
            }
            let task = Task<Void, Never> { [weak self] in
                guard let self = self else { return }
                await self.llmGateway.chatStream(p.asRequest(), streamId: p.streamId, dispatcher: self.bridgeRouter)
                self.activeStreamsLock.lock()
                self.activeStreams[p.streamId] = nil
                self.activeStreamsLock.unlock()
            }
            self.activeStreamsLock.lock()
            self.activeStreams[p.streamId] = task
            self.activeStreamsLock.unlock()
            return LLMChatStreamStarted(streamId: p.streamId, started: true)
        }

        bridgeRouter.register(method: "llm.stopStream") { [weak self] (p: StreamIdParams) -> StopResult in
            guard let self = self else {
                throw BridgeError(code: "bridge.internal-error", message: "service released")
            }
            self.activeStreamsLock.lock()
            let task = self.activeStreams[p.streamId]
            self.activeStreams[p.streamId] = nil
            self.activeStreamsLock.unlock()
            task?.cancel()
            return StopResult(stopped: true)
        }
    }

    /// Registers ASR Bridge methods: asr.start + asr.stop + asr.status.
    /// §C3: volc-asr-credentials read inside ASRGateway; never crosses Bridge.
    /// §A0.4: Keychain read per-call, not stored in this controller.
    /// §B9: dual-end contract — JS ASRStartParamsSchema + ASRStartedSchema + ASRStoppedSchema + ASRStatusResultSchema in same commit.
    /// M2.8.dev.c: asr.status added (§9 row 24).
    private func registerASRHandlers() {
        struct ASRStopParams: Codable { let streamId: String }
        struct EmptyParams: Codable {}

        bridgeRouter.register(method: "asr.start") { [weak self] (p: ASRStartParams) -> ASRStartedResult in
            guard let self = self else {
                throw BridgeError(code: "bridge.internal-error", message: "service released")
            }
            os_log("%{public}@", log: wvDiag, type: .info, "asr.start Bridge call streamId=\(p.streamId)")
            do {
                try await self.asrGateway.connect(streamId: p.streamId, params: p)
                return ASRStartedResult(streamId: p.streamId, started: true)
            } catch let bridgeErr as BridgeError {
                throw bridgeErr
            } catch {
                throw BridgeError(code: "asr.start-failed", message: "\(error)")
            }
        }

        bridgeRouter.register(method: "asr.stop") { [weak self] (p: ASRStopParams) -> ASRStoppedResult in
            guard let self = self else {
                throw BridgeError(code: "bridge.internal-error", message: "service released")
            }
            await self.asrGateway.disconnect()
            return ASRStoppedResult(stopped: true)
        }

        bridgeRouter.register(method: "asr.status") { [weak self] (_: EmptyParams) -> ASRStatusResult in
            guard let self = self else {
                throw BridgeError(code: "bridge.internal-error", message: "service released")
            }
            return self.asrGateway.statusSnapshot()
        }
    }

    /// Registers tts.synthesize Bridge method. One-shot HTTP TTS via Volc Doubao.
    /// §C3: volc-asr-credentials never crosses Bridge; only synthesized audio
    /// (no PII, server-generated speech of interviewer questions) flows out.
    /// §B9: dual-end contract — JS TTSSynthesizeParamsSchema + TTSResultSchema in same commit.
    private func registerTTSHandlers() {
        struct TTSSynthesizeParams: Codable {
            let text: String
            let voiceType: String
            let speedRatio: Double?
        }
        bridgeRouter.register(method: "tts.synthesize") { [weak self] (p: TTSSynthesizeParams) -> TTSGateway.TTSResult in
            guard let self = self else {
                throw BridgeError(code: "bridge.internal-error", message: "service released")
            }
            return try await self.ttsGateway.synthesize(
                text: p.text,
                voiceType: p.voiceType,
                speedRatio: p.speedRatio ?? 1.0
            )
        }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let url = URL(string: "eatit://app/index.html")!
        webView.load(URLRequest(url: url))
    }
}

// MARK: - WKUIDelegate (NSOpenPanel for <input type="file">)

extension WebViewController: WKUIDelegate {
    /// 当 WKWebView 内 `<input type="file">` 触发文件选择时,弹原生 NSOpenPanel。
    /// §A0.1 files.user-selected.read-write entitlement 覆盖 Powerbox,无需新 entitlement。
    /// §C3 PickedFile 内容由 WebKit 自动从用户选中的 URL 读取并交给 web,Bridge 不参与。
    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping ([URL]?) -> Void
    ) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.allowedContentTypes = [
            .pdf,
            .plainText,
            .rtf,
            .text,
            // .doc / .docx 走通用 .data + .item;HTML accept 属性侧已经过滤
            .data,
            .item,
        ]

        let presentingWindow = webView.window
        let handle: (NSApplication.ModalResponse) -> Void = { response in
            if response == .OK && !panel.urls.isEmpty {
                completionHandler(panel.urls)
            } else {
                completionHandler(nil)
            }
        }

        if let window = presentingWindow {
            panel.beginSheetModal(for: window, completionHandler: handle)
        } else {
            panel.begin(completionHandler: handle)
        }
    }

    /// 拦下 `<a target="_blank">` 之类需要打开新窗的链接,转交系统浏览器。
    ///
    /// 默认 WKWebView 对这种 navigation 的反应是「啥都不做」(因为我们没
    /// 开 `WKWebView.allowsLinkPreview` 之外的弹窗能力,也没让它创建 child
    /// WebView),用户体验是「点了没反应」。SettingsPage 上 BYOK · LLM 与
    /// BYOK · ASR 两段「前往火山引擎控制台」外链全部因此哑火。
    ///
    /// 这里只放行 http(s),拒绝 `mailto:` / `tel:` / 自定义 scheme,避免
    /// 借此弹起其它 app(沙盒侧 `NSWorkspace.open` 自身合规,但白名单仍
    /// 由我们守住,跟 §A0.3 出站 host 白名单保持同样的「最小授权」精神)。
    /// 始终返回 nil,主 WKWebView 不会被替换或弹出 child window。
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url,
           let scheme = url.scheme?.lowercased(),
           scheme == "http" || scheme == "https" {
            NSWorkspace.shared.open(url)
        }
        return nil
    }
}

// MARK: - DropAwareWebView

/// WKWebView subclass that surfaces file drops to a closure.
/// Default WKWebView routes drags to the page; we intercept at the view level so
/// drops on the WebView container fire a BridgeEvent instead.
/// §A0.1: files.user-selected.read-write entitlement (M1.4) covers user-initiated drops via Powerbox.
final class DropAwareWebView: WKWebView {
    /// Invoked on a successful drop with the dragged file URLs.
    var onFilesDropped: (([URL]) -> Void)?
    /// Toggled from JS via file.dropEnable({enabled}). When false, drops fall through to WKWebView default.
    var dropInterceptEnabled: Bool = false

    override init(frame: CGRect, configuration: WKWebViewConfiguration) {
        super.init(frame: frame, configuration: configuration)
        registerForDraggedTypes([.fileURL])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) not implemented") }

    override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
        dropInterceptEnabled ? .copy : super.draggingEntered(sender)
    }

    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        guard dropInterceptEnabled,
              let urls = sender.draggingPasteboard.readObjects(
                  forClasses: [NSURL.self],
                  options: [.urlReadingFileURLsOnly: true]
              ) as? [URL]
        else { return super.performDragOperation(sender) }
        onFilesDropped?(urls)
        return true
    }
}
