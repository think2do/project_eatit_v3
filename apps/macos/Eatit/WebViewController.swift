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
