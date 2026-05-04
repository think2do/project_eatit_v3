import AppKit
import WebKit

final class WebViewController: NSViewController {
    private let schemeHandler = EatitURLSchemeHandler()
    let bridgeRouter = BridgeRouter()  // internal — accessible from tests and future service registration
    private var webView: WKWebView!
    private let keychainService = KeychainService()
    private let databaseService: DatabaseService = {
        do { return try DatabaseService() }
        catch { fatalError("DatabaseService init failed: \(error)") }
    }()

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
        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        view = webView
        bridgeRouter.webView = webView
        registerEchoHandler()
        registerKeychainHandlers()
        registerDatabaseHandlers()
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

    override func viewDidLoad() {
        super.viewDidLoad()
        let url = URL(string: "eatit://app/index.html")!
        webView.load(URLRequest(url: url))
    }
}
