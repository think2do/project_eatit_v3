import Foundation

// §A0.4 + §C1: volc-asr-credentials life-cycle — read Keychain → stack-local VolcAsrCreds → 4 headers → ARC release.
// §A0.3: redundant hostname check in makeWebSocketRequest (code layer, in addition to ATS in Info.plist).
// §C3: accessToken NEVER crosses Bridge boundary; X-Api-Access-Key only injected here in Swift.
// §K #6 反模式: rejected — JS layer never receives accessToken or appId.

// MARK: - WebSocketSendable (testability seam for URLSessionWebSocketTask)

/// Protocol seam so tests can inject a mock without subclassing URLSessionWebSocketTask.
/// Production path: URLSessionWebSocketTask conforms via extension below.
/// M2.8.dev.c additions: receive() + closeCode for receive loop + §8.1 close-code classification.
protocol WebSocketSendable: AnyObject {
    func send(_ message: URLSessionWebSocketTask.Message) async throws
    func receive() async throws -> URLSessionWebSocketTask.Message
    func cancel(with closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?)
    func resume()
    var state: URLSessionTask.State { get }
    var closeCode: URLSessionWebSocketTask.CloseCode { get }
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

    // Reconnect backoff delays in milliseconds: 500ms, 1s, 2s (§8.2)
    private static let backoffMs: [UInt64] = [500, 1000, 2000]

    // Mutable state — access must be from same actor (bridge call handlers are serial in BridgeRouter).
    private var task: WebSocketSendable?
    private var streamId: String?
    private var connectId: String = ""
    private var retryCount: Int = 0
    // Stashed params for reconnectSilent (§8.2 invariant: re-use same config).
    private var lastParams: ASRStartParams?

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
        self.lastParams = params              // stash for reconnectSilent (§8.2)

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

        // Spawn receive loop (M2.8.dev.c full impl).
        Task { [weak self] in
            guard let self = self else { return }
            await self.receiveLoop()
        }
    }

    // MARK: - disconnect() — graceful §6.4 or abrupt

    /// Disconnect WebSocket. graceful=true sends last-flag audio frame + 1s drain before close.
    func disconnect(graceful: Bool = true) async {
        guard let task = self.task else { return }
        let savedStreamId = self.streamId

        if graceful {
            let lastFrame = packAudioFrame(pcmChunk: Data(), last: true)
            try? await task.send(.data(lastFrame))
            try? await Task.sleep(nanoseconds: 1_000_000_000)  // 1s drain
        }

        task.cancel(with: .normalClosure, reason: nil)
        self.task = nil
        self.streamId = nil
        retryCount = 0

        router.dispatchEvent(
            type: "asr-end",
            streamId: savedStreamId ?? "",
            payload: ["reason": graceful ? "client-stop" : "abrupt"]
        )
    }

    // MARK: - handlePCMChunk (§6.2 — PCM ingest, silent-drop when not running)

    /// Called by AudioCaptureService on background audio thread per 6400-byte (200ms) chunk.
    /// §C3: in-process Swift; PCM never crosses Bridge.
    func handlePCMChunk(_ pcmChunk: Data) {
        guard let task = self.task, task.state == .running else {
            // Silent drop: WS not connected or reconnecting.
            // Don't log here — would spam at 5 Hz; §3.3 PII guard.
            return
        }
        let frame = packAudioFrame(pcmChunk: pcmChunk, last: false)
        Task { [weak self] in
            do {
                try await task.send(.data(frame))
            } catch {
                self?.dispatchError(code: "asr.frame-send-failed",
                                    message: "audio frame send: \(error)")
                await self?.attemptReconnect()
            }
        }
    }

    // MARK: - statusSnapshot (§9 asr.status result)

    /// Returns current connection state snapshot for asr.status Bridge method.
    func statusSnapshot() -> ASRStatusResult {
        let connected = task != nil && task?.state == .running
        return ASRStatusResult(
            connected: connected,
            streamId: self.streamId,
            retryCount: self.retryCount
        )
    }

    // MARK: - receiveLoop() (§7.1 full impl — M2.8.dev.c)

    private func receiveLoop() async {
        guard let task = self.task else { return }
        while task.state == .running {
            let msg: URLSessionWebSocketTask.Message
            do {
                msg = try await task.receive()
            } catch {
                await handleReceiveError(error)
                return
            }
            switch msg {
            case .data(let frameData):
                handleFrame(frameData)
            case .string:
                // SAUC does not send text frames; ignore defensively.
                continue
            @unknown default:
                continue
            }
        }
    }

    // MARK: - handleFrame (§7.1)

    private func handleFrame(_ data: Data) {
        let resp: ASRResponse
        do {
            resp = try unpackResponseFrame(data: data)
        } catch ASRFrameError.payloadDecodeFailed(let why) {
            dispatchError(code: "asr.frame-unpack-failed", message: why)
            return
        } catch {
            dispatchError(code: "asr.frame-unpack-failed", message: "\(error)")
            return
        }
        switch resp {
        case .result(let r):
            dispatchUtterances(r.result.utterances)
        case .serverError(let env):
            dispatchError(code: "asr.server-error",
                          message: "[\(env.code)] \(env.message)")
        }
    }

    // MARK: - dispatchUtterances (§7.1)

    private func dispatchUtterances(_ utterances: [ASRUtterance]) {
        for u in utterances {
            // §C3 / §3.3: utterance.text is candidate PII — never write to log.
            var payload: [String: Any] = ["definite": u.definite]
            payload["text"] = u.text
            if u.definite {
                if let st = u.startTime { payload["startTime"] = st }
                if let et = u.endTime   { payload["endTime"] = et }
            }
            let eventType = u.definite ? "asr-final" : "asr-partial"
            router.dispatchEvent(type: eventType, streamId: self.streamId ?? "", payload: payload)
        }
    }

    // MARK: - handleReceiveError (§8.1 close code → 行为表)

    private func handleReceiveError(_ error: Error) async {
        let savedStreamId = self.streamId

        // Check if the error is a local cancel (disconnect() was called).
        // In that case, disconnect() already emitted asr-end; do nothing.
        if (error as? URLError)?.code == .cancelled {
            return
        }
        if error is CancellationError {
            return
        }

        // URLError no-network — do not retry.
        if let urlErr = error as? URLError, urlErr.code == .notConnectedToInternet {
            self.task = nil
            self.streamId = nil
            router.dispatchEvent(
                type: "asr-end",
                streamId: savedStreamId ?? "",
                payload: ["reason": "error", "errorCode": "asr.no-network",
                          "errorMessage": urlErr.localizedDescription]
            )
            return
        }

        // Classify by close code when available.
        let code = task?.closeCode

        switch code {
        case .normalClosure:
            // 1000 — server closed cleanly; no retry.
            self.task = nil
            self.streamId = nil
            router.dispatchEvent(
                type: "asr-end",
                streamId: savedStreamId ?? "",
                payload: ["reason": "stop"]
            )

        case .internalServerError:
            // 1011 — server overload; retry ×3.
            await attemptReconnect()

        case .abnormalClosure:
            // 1006 — network drop; retry ×3.
            await attemptReconnect()

        case .policyViolation:
            // 1008 — auth failure; no retry.
            self.task = nil
            self.streamId = nil
            retryCount = 0
            router.dispatchEvent(
                type: "asr-end",
                streamId: savedStreamId ?? "",
                payload: ["reason": "error",
                          "errorCode": "asr.api-key-invalid",
                          "errorMessage": "WS policy violation (1008)"]
            )

        case .protocolError:
            // 1002 — frame bug; no retry.
            self.task = nil
            self.streamId = nil
            retryCount = 0
            router.dispatchEvent(
                type: "asr-end",
                streamId: savedStreamId ?? "",
                payload: ["reason": "error",
                          "errorCode": "asr.frame-pack-failed",
                          "errorMessage": "WS protocol error (1002)"]
            )

        default:
            // URLError(.networkConnectionLost) or unknown — retry like 1006.
            if let urlErr = error as? URLError, urlErr.code == .networkConnectionLost {
                await attemptReconnect()
            } else {
                // Unknown close code — single retry attempt then give up.
                self.task = nil
                self.streamId = nil
                retryCount = 0
                router.dispatchEvent(
                    type: "asr-end",
                    streamId: savedStreamId ?? "",
                    payload: ["reason": "error",
                              "errorCode": "asr.ws-close-unknown",
                              "errorMessage": "\(error)"]
                )
            }
        }
    }

    // MARK: - dispatchError (§7.4 — asr-end with reason="error")

    private func dispatchError(code: String, message: String) {
        let savedStreamId = self.streamId
        router.dispatchEvent(
            type: "asr-end",
            streamId: savedStreamId ?? "",
            payload: ["reason": "error", "errorCode": code, "errorMessage": message]
        )
    }

    // MARK: - attemptReconnect (§8.2 — [500, 1000, 2000]ms ×3 backoff)

    private func attemptReconnect() async {
        guard retryCount < Self.backoffMs.count else {
            let savedStreamId = self.streamId ?? ""
            router.dispatchEvent(
                type: "asr-end",
                streamId: savedStreamId,
                payload: [
                    "reason": "1011",
                    "errorCode": "asr.server-overload",
                    "errorMessage": "retry exhausted after \(retryCount) attempts"
                ]
            )
            self.task = nil
            self.streamId = nil
            retryCount = 0
            return
        }
        let delay = Self.backoffMs[retryCount]
        retryCount += 1
        try? await Task.sleep(nanoseconds: delay * 1_000_000)
        do {
            try await reconnectSilent()
        } catch {
            await attemptReconnect()
        }
    }

    // MARK: - reconnectSilent (§8.2 — preserves streamId, re-reads Keychain §3.1 invariant 4)

    private func reconnectSilent() async throws {
        // Re-read Keychain on every reconnect — §3.1 invariant 4: never cache creds.
        let req = try makeWebSocketRequest()
        let newTask = factory.makeTask(with: req)
        newTask.resume()
        self.task = newTask

        // Re-send first frame with the same params used on initial connect.
        guard let params = self.lastParams else {
            throw BridgeError(code: "asr.ws-connect-failed",
                              message: "no lastParams available for reconnect")
        }
        let config = ASRConfigPayload(
            audio: ASRAudioConfig(format: "pcm", rate: 16000, channels: 1, codec: "raw"),
            request: ASRRequestConfig(
                modelName: "bigmodel",
                enableITN: params.enableITN ?? true,
                enablePunc: params.enablePunc ?? true,
                enableSpeakerInfo: nil
            )
        )
        let firstFrame = try packFirstFrame(config: config, gzip: false)
        try await newTask.send(.data(firstFrame))

        // Spawn fresh receive loop.
        Task { [weak self] in
            guard let self = self else { return }
            await self.receiveLoop()
        }
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
