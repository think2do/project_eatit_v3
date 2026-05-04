import AppKit
import WebKit

final class WebViewController: NSViewController {
    private let schemeHandler = EatitURLSchemeHandler()
    let bridgeRouter = BridgeRouter()  // internal — accessible from tests and future service registration
    private var webView: WKWebView!

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
    }

    private func registerEchoHandler() {
        struct EchoParams: Codable { let msg: String }
        struct EchoResult: Codable { let msg: String }
        // Test method: bridge.echo({ msg }) → { msg }
        bridgeRouter.register(method: "bridge.echo") { (p: EchoParams) -> EchoResult in
            EchoResult(msg: p.msg)
        }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let url = URL(string: "eatit://app/index.html")!
        webView.load(URLRequest(url: url))
    }
}
