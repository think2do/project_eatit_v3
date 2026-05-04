import WebKit

// §B9: Any method add/remove/signature change must update Swift Codable + JS Zod in same commit.
// §C3: handlers MUST NOT return secret material in response.data.
// KeychainService (M2.2) returns { exists: bool }, never the secret itself.

final class BridgeRouter: NSObject, WKScriptMessageHandlerWithReply {

    // MARK: - State

    private var handlers: [String: ([String: Any]) async throws -> Any?] = [:]
    weak var webView: WKWebView?

    // MARK: - Registration

    /// Register a typed handler for a bridge method.
    /// P must be Decodable (params), R must be Encodable (result).
    /// §6.2: error codes are hard-coded strings, not enum-to-string.
    func register<P: Decodable, R: Encodable>(
        method: String,
        handler: @escaping (P) async throws -> R
    ) {
        handlers[method] = { rawParams in
            let data: Data
            do {
                data = try JSONSerialization.data(withJSONObject: rawParams)
            } catch {
                throw BridgeError(code: "bridge.params-invalid",
                                  message: "params serialization failed: \(error)")
            }
            let params: P
            do {
                params = try JSONDecoder().decode(P.self, from: data)
            } catch let decodingError as DecodingError {
                // §决策5: DecodingError → bridge.params-invalid (not bridge.internal-error)
                throw BridgeError(code: "bridge.params-invalid",
                                  message: "\(decodingError)")
            }
            let result = try await handler(params)
            let resultData = try JSONEncoder().encode(result)
            return try JSONSerialization.jsonObject(with: resultData)
        }
    }

    // MARK: - WKScriptMessageHandlerWithReply

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let body = message.body as? [String: Any] else {
            replyHandler(nil, "bridge.params-invalid: message body is not a dictionary")
            return
        }
        Task { await self.handle(body: body, reply: replyHandler) }
    }

    // MARK: - Core dispatch (testable without WKScriptMessage)

    func handle(body: [String: Any], reply: @escaping (Any?, String?) -> Void) async {
        guard let id = body["id"] as? String, !id.isEmpty,
              let method = body["method"] as? String, !method.isEmpty else {
            let errorJSON: [String: Any] = [
                "id": body["id"] as? String ?? "",
                "ok": false,
                "error": [
                    "code": "bridge.params-invalid",
                    "message": "missing or empty 'id' / 'method' field"
                ]
            ]
            reply(errorJSON, nil)
            return
        }

        let params = body["params"] as? [String: Any] ?? [:]

        guard let handler = handlers[method] else {
            let errorJSON: [String: Any] = [
                "id": id,
                "ok": false,
                "error": [
                    "code": "bridge.method-not-found",
                    "message": "method '\(method)' not registered"
                ]
            ]
            reply(errorJSON, nil)
            return
        }

        do {
            let result = try await handler(params)
            let okJSON: [String: Any] = [
                "id": id,
                "ok": true,
                "data": result ?? NSNull()
            ]
            reply(okJSON, nil)
        } catch let bridgeErr as BridgeError {
            let errorJSON: [String: Any] = [
                "id": id,
                "ok": false,
                "error": ["code": bridgeErr.code, "message": bridgeErr.message]
            ]
            reply(errorJSON, nil)
        } catch {
            let errorJSON: [String: Any] = [
                "id": id,
                "ok": false,
                "error": [
                    "code": "bridge.internal-error",
                    "message": "\(error)"
                ]
            ]
            reply(errorJSON, nil)
        }
    }

    // MARK: - Event dispatch (Swift → JS)

    /// Push a BridgeEvent to the JS dispatcher (`window.eatitBridge.dispatch`).
    func dispatchEvent(type: String, streamId: String, payload: Any) {
        guard let webView = webView else { return }
        let body: [String: Any] = ["type": type, "streamId": streamId, "payload": payload]
        guard let data = try? JSONSerialization.data(withJSONObject: body),
              let json = String(data: data, encoding: .utf8) else { return }
        let js = "if (window.eatitBridge && window.eatitBridge.dispatch) { window.eatitBridge.dispatch(\(json)); }"
        DispatchQueue.main.async {
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }
}
