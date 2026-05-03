import Foundation
import WebKit

/// Serves files from Bundle.main/Contents/Resources/web/ under the eatit://app/ scheme.
/// Path-traversal is blocked: any resolved path outside bundleResourcesURL returns 403.
/// TODO: Add SPA fallback (return index.html when file not found + Accept: text/html) for React Router.
final class EatitURLSchemeHandler: NSObject, WKURLSchemeHandler {

    private let bundleResourcesURL: URL

    init(bundleResourcesURL: URL = Bundle.main.bundleURL
            .appendingPathComponent("Contents/Resources/web")) {
        self.bundleResourcesURL = bundleResourcesURL
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let requestURL = urlSchemeTask.request.url else {
            fail(urlSchemeTask, code: 400, message: "missing URL")
            return
        }

        // Only serve eatit://app/...
        guard requestURL.scheme == "eatit", requestURL.host == "app" else {
            fail(urlSchemeTask, code: 404, message: "unknown host")
            return
        }

        // Build file path: strip leading "/" from URL path
        var relativePath = requestURL.path
        if relativePath.hasPrefix("/") {
            relativePath = String(relativePath.dropFirst())
        }
        // Empty path → index.html
        if relativePath.isEmpty {
            relativePath = "index.html"
        }

        // Path-traversal guard
        let resolved = bundleResourcesURL
            .appendingPathComponent(relativePath)
            .standardizedFileURL
        let baseStd = bundleResourcesURL.standardizedFileURL

        guard resolved.path.hasPrefix(baseStd.path + "/") || resolved.path == baseStd.path else {
            fail(urlSchemeTask, code: 403, message: "path-traversal blocked")
            return
        }

        // Read file data
        guard let data = try? Data(contentsOf: resolved) else {
            fail(urlSchemeTask, code: 404, message: "file not found: \(relativePath)")
            return
        }

        let mime = mimeType(for: resolved.pathExtension)
        let response = HTTPURLResponse(
            url: requestURL,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: [
                "Content-Type": mime,
                "Content-Length": "\(data.count)",
                "Cache-Control": "no-cache",
            ]
        )!

        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    // MARK: - Private helpers

    private func fail(_ task: WKURLSchemeTask, code: Int, message: String) {
        task.didFailWithError(NSError(
            domain: "EatitURLSchemeHandler",
            code: code,
            userInfo: [NSLocalizedDescriptionKey: message]
        ))
    }

    private func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs":   return "application/javascript; charset=utf-8"
        case "css":         return "text/css; charset=utf-8"
        case "json":        return "application/json; charset=utf-8"
        case "svg":         return "image/svg+xml"
        case "png":         return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "webp":        return "image/webp"
        case "woff":        return "font/woff"
        case "woff2":       return "font/woff2"
        case "ttf":         return "font/ttf"
        case "ico":         return "image/x-icon"
        case "wasm":        return "application/wasm"
        case "txt":         return "text/plain; charset=utf-8"
        default:            return "application/octet-stream"
        }
    }
}
