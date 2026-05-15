import Foundation
import os.log

private let ttsDiag = OSLog(subsystem: "com.eatit.desktop.asr", category: "tts")

// §A0.4 + §C1: volc-asr-credentials life-cycle — read Keychain → stack-local creds
// → Bearer header → ARC release. Same creds as ASR (Volc unified Doubao access).
// §A0.3: host pinned to openspeech.bytedance.com (already in ATS whitelist).
// §C3: accessToken never crosses Bridge — only the synthesized audio bytes do.

/// One-shot HTTP TTS via 火山引擎 Doubao TTS.
/// Returns base64-encoded audio bytes for JS to play via <audio> element.
final class TTSGateway {
    private let keychain: KeychainReading
    private let session: URLSession
    private let endpoint: URL

    private static let allowedHost = "openspeech.bytedance.com"
    private static let defaultEndpoint = URL(
        string: "https://openspeech.bytedance.com/api/v1/tts"
    )!

    init(
        keychain: KeychainReading,
        session: URLSession = .shared,
        endpoint: URL = TTSGateway.defaultEndpoint
    ) {
        self.keychain = keychain
        self.session = session
        self.endpoint = endpoint
    }

    convenience init(keychain: KeychainService) {
        self.init(
            keychain: keychain as KeychainReading,
            session: TTSGateway.makeProductionSession()
        )
    }

    private static func makeProductionSession() -> URLSession {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        return URLSession(configuration: config)
    }

    // MARK: - Result type

    struct TTSResult: Codable {
        let audioBase64: String
        let encoding: String  // typically "mp3"
    }

    // MARK: - Body types (Volc TTS v1 wire format)
    //
    // 新版控制台 X-Api-Key 鉴权下,`app.token` 和 `app.appid` 由 header 替代;
    // 但 v1 `/api/v1/tts` 路径仍可能要求 body 里出现 `app` 块以路由到 TTS 服务。
    // 旧版用 cluster="volcano_tts" 标识 TTS 路由,这里保留空 appid/token + cluster,
    // 万一服务端只校验 cluster 而不校验 appid,我们就能继续走这条 v1 路径。

    private struct App: Codable {
        let appid: String   // 新版鉴权下为空字符串
        let token: String   // 新版鉴权下为空字符串
        let cluster: String // 仍为 "volcano_tts" — TTS 服务路由标识
    }
    private struct UserCfg: Codable { let uid: String }
    private struct AudioCfg: Codable {
        let voice_type: String
        let encoding: String
        let speed_ratio: Double
    }
    private struct RequestCfg: Codable {
        let reqid: String
        let text: String
        let text_type: String
        let operation: String
    }
    private struct Body: Codable {
        let app: App
        let user: UserCfg
        let audio: AudioCfg
        let request: RequestCfg
    }

    private struct VolcResp: Codable {
        let code: Int?
        let message: String?
        let data: String?
        let reqid: String?
        let operation: String?
        let sequence: Int?
    }

    // MARK: - synthesize

    func synthesize(text: String, voiceType: String, speedRatio: Double = 1.0) async throws -> TTSResult {
        guard endpoint.host?.lowercased() == Self.allowedHost else {
            throw BridgeError(code: "tts.host-not-allowed",
                              message: "host '\(endpoint.host ?? "")' not in allow list")
        }

        // Read creds same as ASR
        guard let credsData = try keychain.read(account: "volc-asr-credentials") else {
            throw BridgeError(code: "tts.credentials-missing",
                              message: "volc-asr-credentials not in keychain")
        }
        struct Creds: Codable { let apiKey: String }
        let creds: Creds
        do {
            creds = try JSONDecoder().decode(Creds.self, from: credsData)
        } catch {
            throw BridgeError(code: "tts.credentials-invalid",
                              message: "credentials json malformed: \(error)")
        }
        guard !creds.apiKey.isEmpty else {
            throw BridgeError(code: "tts.credentials-invalid",
                              message: "apiKey empty")
        }

        let body = Body(
            // 新版鉴权:appid/token 走 X-Api-Key header,body 里留空;
            // cluster 仍是 TTS 服务路由标识。
            app: App(appid: "", token: "", cluster: "volcano_tts"),
            user: UserCfg(uid: "eatit"),
            audio: AudioCfg(voice_type: voiceType, encoding: "mp3", speed_ratio: speedRatio),
            request: RequestCfg(
                reqid: UUID().uuidString,
                text: text,
                text_type: "plain",
                operation: "query"
            )
        )
        let bodyData = try JSONEncoder().encode(body)

        var req = URLRequest(url: endpoint)
        req.httpMethod = "POST"
        req.httpBody = bodyData
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // 新版控制台单 key 鉴权:X-Api-Key 取代旧版 "Authorization: Bearer;<token>"。
        req.setValue(creds.apiKey, forHTTPHeaderField: "X-Api-Key")
        // 公版音色(zh_*_bigtts) → volc.service_type.10029。
        // 漏这个 header 服务端 403 / code=3001,错误信息会显示 "[resource_id=] requested resource not granted"。
        req.setValue("volc.service_type.10029", forHTTPHeaderField: "X-Api-Resource-Id")

        os_log("%{public}@", log: ttsDiag, type: .info,
               "tts.synthesize voice=\(voiceType) textLen=\(text.count) speed=\(speedRatio)")

        let (data, resp) = try await session.data(for: req)
        guard let http = resp as? HTTPURLResponse else {
            throw BridgeError(code: "tts.network-error", message: "non-HTTP response")
        }
        guard (200..<300).contains(http.statusCode) else {
            let bodyStr = String(data: data.prefix(500), encoding: .utf8) ?? "<binary>"
            os_log("%{public}@", log: ttsDiag, type: .error,
                   "tts http \(http.statusCode): \(bodyStr)")
            throw BridgeError(code: "tts.http-\(http.statusCode)",
                              message: "volc tts http \(http.statusCode): \(bodyStr.prefix(200))")
        }

        let parsed: VolcResp
        do {
            parsed = try JSONDecoder().decode(VolcResp.self, from: data)
        } catch {
            throw BridgeError(code: "tts.decode-failed", message: "\(error)")
        }
        // Volc TTS success code is 3000
        guard parsed.code == 3000, let audio = parsed.data, !audio.isEmpty else {
            let codeStr = parsed.code.map { String($0) } ?? "?"
            let msg = parsed.message ?? "no data"
            os_log("%{public}@", log: ttsDiag, type: .error,
                   "tts server error code=\(codeStr) msg=\(msg)")
            throw BridgeError(code: "tts.server-error",
                              message: "code=\(codeStr) msg=\(msg)")
        }
        os_log("%{public}@", log: ttsDiag, type: .info,
               "tts synthesized OK \(audio.count) base64-chars")
        return TTSResult(audioBase64: audio, encoding: "mp3")
    }
}
