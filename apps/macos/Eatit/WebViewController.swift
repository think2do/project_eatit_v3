import AppKit
import WebKit

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
    }

    private func registerEchoHandler() {
        struct EchoParams: Codable { let msg: String }
        struct EchoResult: Codable { let msg: String }
        // Test method: bridge.echo({ msg }) → { msg }
        bridgeRouter.register(method: "bridge.echo") { (p: EchoParams) -> EchoResult in
            EchoResult(msg: p.msg)
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

    override func viewDidLoad() {
        super.viewDidLoad()
        let url = URL(string: "eatit://app/index.html")!
        webView.load(URLRequest(url: url))
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
