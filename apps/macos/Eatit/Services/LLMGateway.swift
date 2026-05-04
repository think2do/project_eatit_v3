import Foundation

// §A0.4 + §C1: ARK_API_KEY life-cycle — read Keychain → stack-local String → Bearer header → ARC release.
// §A0.3: redundant hostname check in makeRequest (code layer, in addition to ATS in Info.plist).
// §C3: apiKey NEVER crosses Bridge boundary; Authorization only injected here in Swift.
// §K #6 反模式: rejected — JS layer never receives apiKey.

// MARK: - KeychainReading (testability seam for final KeychainService)

/// Protocol seam so tests can inject a mock without subclassing final KeychainService.
protocol KeychainReading {
    func read(account: String) throws -> Data?
}

extension KeychainService: KeychainReading {}

// MARK: - Bridge result type (camelCase, per §7 Bridge contract)

struct LLMChatResult: Codable {
    let content: String?
    let toolCalls: [ToolCall]?
    let finishReason: String
    let usage: Usage?
}

// MARK: - ARK error envelope (for §5.4 error body decode)

struct ARKErrorEnvelope: Codable {
    let error: ARKError?

    struct ARKError: Codable {
        let code: String?
        let message: String?
        let type: String?
    }
}

// MARK: - LLMGateway

final class LLMGateway {
    private let keychain: KeychainReading
    private let session: URLSession

    // Injected endpoint allows testChat_HostNotAllowed to pass an evil-host URL.
    private let endpoint: URL

    private static let allowedHost = "ark.cn-beijing.volces.com"
    private static let defaultEndpoint = URL(
        string: "https://ark.cn-beijing.volces.com/api/v3/chat/completions"
    )!

    init(
        keychain: KeychainReading,
        session: URLSession = .shared,
        endpoint: URL = LLMGateway.defaultEndpoint
    ) {
        self.keychain = keychain
        self.session = session
        self.endpoint = endpoint
    }

    // Convenience init for production use with KeychainService directly.
    convenience init(keychain: KeychainService) {
        self.init(keychain: keychain as KeychainReading)
    }

    // MARK: - Synchronous chat

    func chat(_ params: ChatCompletionRequest) async throws -> ChatCompletionResponse {
        let body = try encodeSyncRequest(params)
        let req = try makeRequest(body: body, accept: "application/json")
        let (data, resp) = try await retryingURLSession(req)
        let http = resp as! HTTPURLResponse
        try mapHTTPError(status: http.statusCode, data: data)
        do {
            return try JSONDecoder().decode(ChatCompletionResponse.self, from: data)
        } catch {
            throw BridgeError(code: "llm.decode-failed",
                              message: "response decode failed: \(error)")
        }
    }

    // Encode the request with stream forced to false.
    private func encodeSyncRequest(_ params: ChatCompletionRequest) throws -> Data {
        let rawData = try JSONEncoder().encode(params)
        guard var dict = try JSONSerialization.jsonObject(with: rawData) as? [String: Any] else {
            throw BridgeError(code: "llm.params-invalid", message: "could not serialize request")
        }
        dict["stream"] = false
        return try JSONSerialization.data(withJSONObject: dict)
    }

    // MARK: - Request builder (§3.2 pseudocode + §A0.3 host check + §A0.4 key lifecycle)

    private func makeRequest(body: Data, accept: String) throws -> URLRequest {
        // §A0.4: read Keychain → stack-local String → header → ARC release on function return
        let apiKeyData = try keychain.read(account: "ark-api-key")
        guard let keyData = apiKeyData,
              let apiKey = String(data: keyData, encoding: .utf8),
              !apiKey.isEmpty else {
            throw BridgeError(code: "llm.api-key-missing",
                              message: "ark-api-key not configured in Keychain")
        }

        // §A0.3: redundant hostname check (code layer, defense-in-depth)
        guard endpoint.host?.lowercased() == Self.allowedHost else {
            throw BridgeError(code: "llm.host-not-allowed",
                              message: "host '\(endpoint.host ?? "")' not in allow list")
        }

        var req = URLRequest(url: endpoint)
        req.httpMethod = "POST"
        req.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(accept, forHTTPHeaderField: "Accept")
        req.httpBody = body
        // apiKey String goes out of scope at function return → ARC release
        return req
    }

    // MARK: - Retry with exponential backoff (§5.3: 0.5s / 1.0s / 2.0s × 3 retries)

    private func retryingURLSession(_ req: URLRequest) async throws -> (Data, URLResponse) {
        let backoffMs: [UInt64] = [500, 1000, 2000]  // 3 retries → 4 total attempts
        var lastError: Error?
        for attempt in 0..<(backoffMs.count + 1) {
            do {
                let (data, resp) = try await session.data(for: req)
                let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
                if shouldRetry(status: status), attempt < backoffMs.count {
                    try await Task.sleep(nanoseconds: backoffMs[attempt] * 1_000_000)
                    continue
                }
                return (data, resp)
            } catch {
                lastError = error
                if attempt < backoffMs.count {
                    try await Task.sleep(nanoseconds: backoffMs[attempt] * 1_000_000)
                    continue
                }
                throw BridgeError(code: "llm.network-error",
                                  message: "\(error)")
            }
        }
        throw BridgeError(code: "llm.http-5xx-retry-exhausted",
                          message: "\(lastError?.localizedDescription ?? "unknown")")
    }

    private func shouldRetry(status: Int) -> Bool {
        return status == 429 || (status >= 500 && status < 600)
    }

    // MARK: - HTTP error mapping (§5.4)

    private func mapHTTPError(status: Int, data: Data) throws {
        if (200..<300).contains(status) { return }
        let arkErr = (try? JSONDecoder().decode(ARKErrorEnvelope.self, from: data))?.error
        let detail = arkErr.map { "[\($0.code ?? "?")] \($0.message ?? "")" } ?? "status \(status)"
        switch status {
        case 401, 403:
            throw BridgeError(code: "llm.api-key-invalid", message: detail)
        case 429:
            throw BridgeError(code: "llm.rate-limited", message: detail)
        case 400, 422:
            throw BridgeError(code: "llm.params-invalid", message: detail)
        case 500..<600:
            throw BridgeError(code: "llm.http-5xx-retry-exhausted", message: detail)
        default:
            throw BridgeError(code: "llm.http-4xx", message: detail)
        }
    }
}
