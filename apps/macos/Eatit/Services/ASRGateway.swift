import Foundation

// §A0.4 + §C1: volc-asr-credentials life-cycle — read Keychain → stack-local VolcAsrCreds → 4 headers → ARC release.
// §A0.3: redundant hostname check in makeWebSocketRequest (code layer, in addition to ATS in Info.plist).
// §C3: accessToken NEVER crosses Bridge boundary; X-Api-Access-Key only injected here in Swift.
// §K #6 反模式: rejected — JS layer never receives accessToken or appId.

// MARK: - WebSocketSendable (testability seam for URLSessionWebSocketTask)

/// Protocol seam so tests can inject a mock without subclassing URLSessionWebSocketTask.
/// Production path: URLSessionWebSocketTask conforms via extension below.
protocol WebSocketSendable: AnyObject {
    func send(_ message: URLSessionWebSocketTask.Message) async throws
    func cancel(with closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?)
    func resume()
    var state: URLSessionTask.State { get }
}

extension URLSessionWebSocketTask: WebSocketSendable {}

// MARK: - WebSocketTaskFactory (testability seam for task creation)

/// Protocol seam so tests can inject a mock factory without touching URLSession.
protocol WebSocketTaskFactory {
    func makeTask(with request: URLRequest) -> WebSocketSendable
}

struct URLSessionTaskFactory: WebSocketTaskFactory {
    let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func makeTask(with request: URLRequest) -> WebSocketSendable {
        session.webSocketTask(with: request)
    }
}

// MARK: - Bridge result types for asr.start / asr.stop (camelCase per Bridge contract §4.1)

struct ASRStartedResult: Codable {
    let streamId: String
    let started: Bool
}

struct ASRStoppedResult: Codable {
    let stopped: Bool
}

// MARK: - ASRGateway

final class ASRGateway {
    private let keychain: KeychainReading
    private let router: BridgeEventDispatching
    private let factory: WebSocketTaskFactory
    private let endpoint: URL

    private static let allowedHost = "openspeech.bytedance.com"
    private static let resourceId = "volc.bigasr.sauc.duration"
    private static let defaultEndpoint = URL(
        string: "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel"
    )!

    // Mutable state — access must be from same actor (bridge call handlers are serial in BridgeRouter).
    private var task: WebSocketSendable?
    private var streamId: String?
    private var connectId: String = ""

    init(
        keychain: KeychainReading,
        router: BridgeEventDispatching,
        factory: WebSocketTaskFactory = URLSessionTaskFactory(),
        endpoint: URL = ASRGateway.defaultEndpoint
    ) {
        self.keychain = keychain
        self.router = router
        self.factory = factory
        self.endpoint = endpoint
    }

    // MARK: - connect() (§5.1 full flow + §5.3 no-ack-block)

    /// Connect WS, inject 4 auth headers, send first frame, return immediately.
    /// Does NOT block waiting for server ack per §5.3 design decision.
    func connect(streamId: String, params: ASRStartParams) async throws {
        guard task == nil else {
            throw BridgeError(code: "asr.already-connected",
                              message: "another stream is active: \(self.streamId ?? "?")")
        }

        let req = try makeWebSocketRequest()   // §3.2 — throws on keychain / host check failures
        let newTask = factory.makeTask(with: req)
        newTask.resume()
        self.task = newTask
        self.streamId = streamId

        // Build first-frame config from ASRStartParams (§5.2 field-locked JSON)
        let config = ASRConfigPayload(
            audio: ASRAudioConfig(format: "pcm", rate: 16000, channels: 1, codec: "raw"),
            request: ASRRequestConfig(
                modelName: "bigmodel",
                enableITN: params.enableITN ?? true,
                enablePunc: params.enablePunc ?? true,
                enableSpeakerInfo: nil
            )
        )

        let firstFrame: Data
        do {
            firstFrame = try packFirstFrame(config: config, gzip: false)
        } catch {
            // Pack failure is internal; clean up before throwing.
            self.task = nil
            self.streamId = nil
            newTask.cancel(with: .normalClosure, reason: nil)
            throw BridgeError(code: "asr.frame-pack-failed",
                              message: "first frame pack: \(error)")
        }

        do {
            try await newTask.send(.data(firstFrame))
        } catch {
            // §5.4: send failure — reset state, cancel task to prevent leak.
            self.task = nil
            self.streamId = nil
            newTask.cancel(with: .normalClosure, reason: nil)
            throw BridgeError(code: "asr.ws-handshake-failed",
                              message: "first frame send failed: \(error)")
        }

        // Spawn receive loop stub — body deferred to M2.8.dev.c.
        Task { [weak self] in
            guard let self = self else { return }
            await self.receiveLoop()
        }
    }

    // MARK: - disconnect()

    /// Cancel active WS task and clear state. Receive-loop cleanup is .c's responsibility.
    func disconnect() async {
        task?.cancel(with: .normalClosure, reason: nil)
        task = nil
        streamId = nil
    }

    // MARK: - receiveLoop() stub (body deferred to M2.8.dev.c)

    private func receiveLoop() async {
        // TODO M2.8.dev.c: implement partial/final/end frame dispatch
    }

    // MARK: - makeWebSocketRequest() (§3.2 pseudocode + §A0.3 host check + §A0.4 lifecycle)

    private func makeWebSocketRequest() throws -> URLRequest {
        // §A0.3: redundant hostname check (code layer, defense-in-depth alongside ATS)
        guard endpoint.host?.lowercased() == Self.allowedHost else {
            throw BridgeError(code: "asr.host-not-allowed",
                              message: "host '\(endpoint.host ?? "")' not in allow list")
        }

        // §A0.4: read Keychain → JSON-decode → stack-local creds → headers → ARC release on return
        guard let credsData = try keychain.read(account: "volc-asr-credentials") else {
            throw BridgeError(code: "asr.credentials-missing",
                              message: "volc-asr-credentials not configured in Keychain")
        }

        let creds: VolcAsrCreds
        do {
            creds = try JSONDecoder().decode(VolcAsrCreds.self, from: credsData)
        } catch {
            throw BridgeError(code: "asr.credentials-malformed",
                              message: "volc-asr-credentials JSON decode failed")
        }

        guard !creds.appId.isEmpty, !creds.accessToken.isEmpty else {
            throw BridgeError(code: "asr.credentials-missing",
                              message: "appId or accessToken is empty")
        }

        let newConnectId = UUID().uuidString
        self.connectId = newConnectId

        var req = URLRequest(url: endpoint)
        req.setValue(creds.appId,        forHTTPHeaderField: "X-Api-App-Key")
        req.setValue(creds.accessToken,  forHTTPHeaderField: "X-Api-Access-Key")
        req.setValue(Self.resourceId,    forHTTPHeaderField: "X-Api-Resource-Id")
        req.setValue(newConnectId,       forHTTPHeaderField: "X-Api-Connect-Id")
        // creds (and creds.accessToken) exits scope at function return → ARC release
        return req
    }
}
