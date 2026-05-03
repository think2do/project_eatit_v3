import AppKit
import WebKit

final class WebViewController: NSViewController {
    private let schemeHandler = EatitURLSchemeHandler()
    private var webView: WKWebView!

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(schemeHandler, forURLScheme: "eatit")
        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let url = URL(string: "eatit://app/index.html")!
        webView.load(URLRequest(url: url))
    }
}
