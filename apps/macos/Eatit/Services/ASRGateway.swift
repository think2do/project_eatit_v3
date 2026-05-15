import Foundation
import os.log

// [DIAG-ASR] Subsystem-prefixed logger so `log show --predicate 'subsystem == "com.eatit.desktop.asr"'`
// captures everything end-to-end during dev. Remove after diagnostics complete.
private let asrDiag = OSLog(subsystem: "com.eatit.desktop.asr", category: "diag")

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
    // 豆包流式语音识别 2.0(Seed ASR Streaming 2.0)产品线 — resource id 是
    // `volc.seedasr.sauc.duration`,跟老 SAUC 大模型版的 `volc.bigasr.sauc.duration`
    // 不同。错用老 id 接 2.0 实例,火山服务端直接拒绝 WS upgrade(NSURLErrorBadServerResponse
    // -1011 / WebSocketHandshakeFailureReasonKey=0)。
    //
    // 参考实现:https://github.com/missuo/koe(同样接 Seed ASR 2.0 的 macOS 客户端)
    // 其 koe-asr/src/doubao.rs 显式使用 `volc.seedasr.sauc.duration`。
    //
    // 用户若开通的是其它套餐(订阅版 / 老 SAUC bigmodel),可在设置页「高级」区块
    // 通过 keychain JSON 的 `resourceId` 字段覆盖。
    private static let resourceId = "volc.seedasr.sauc.duration"
    private static let defaultEndpoint = URL(
        string: "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async"
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
    // [DIAG-ASR] Audio frame counter (transient diagnostic, remove after debugging).
    private var audioFrameCounter: Int = 0

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
        // If a previous stream is still around, close it abruptly before
        // starting a new one.  Real-world triggers we've seen for this drift:
        //   - testASRConnection (SettingsPage) left a stream live whose
        //     graceful drain hadn't fully completed before the user moved on.
        //   - InterviewPage re-mount called start before the previous mount's
        //     stop fully processed.
        //   - Server-side close that didn't cancel our local task.
        // Throwing `asr.already-connected` and forcing the user to retry was
        // user-hostile; auto-recovery is safe because each stream is isolated
        // by streamId and we hold only one task slot.
        if self.task != nil {
            await disconnect(graceful: false)
        }

        let req = try makeWebSocketRequest()   // §3.2 — throws on keychain / host check failures
        let newTask = factory.makeTask(with: req)
        newTask.resume()
        self.task = newTask
        self.streamId = streamId
        self.lastParams = params              // stash for reconnectSilent (§8.2)

        // Build first-frame config — Seed ASR 2.0 wire format.
        // gzip=true matches koe (working reference impl); the server's
        // compression flag handling is more permissive on gzip than raw JSON
        // for some 2.0 deployments per anecdotal community reports.
        let config = ASRConfigPayload(
            user: ASRUserConfig(uid: "eatit"),
            audio: ASRAudioConfig(
                format: "pcm",
                codec: "raw",
                rate: 16000,
                bits: 16,
                channel: 1
            ),
            request: ASRRequestConfig(
                modelName: "bigmodel",
                enableITN: params.enableITN ?? true,
                enablePunc: params.enablePunc ?? true,
                enableDDC: false,
                enableNonstream: false,
                resultType: "full",
                showUtterances: true
            )
        )

        let firstFrame: Data
        do {
            firstFrame = try packFirstFrame(config: config)
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
            // [DIAG-ASR] First-frame size + header hex (no payload bytes — payload is JSON config, not PII).
            let hex = firstFrame.prefix(8).map { String(format: "%02x", $0) }.joined(separator: " ")
            os_log("%{public}@", log: asrDiag, type: .info, "firstFrame sent: \(firstFrame.count)B header8=[\(hex)] endpoint=\(self.endpoint.absoluteString) resourceId=\(Self.resourceId)")
        } catch {
            // §5.4: send failure — reset state, cancel task to prevent leak.
            self.task = nil
            self.streamId = nil
            newTask.cancel(with: .normalClosure, reason: nil)
            os_log("%{public}@", log: asrDiag, type: .info, "firstFrame send FAILED: \(error)")
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
            // JS Zod ASR end-reason enum: ["1006","1011","stop","client-stop","eof","error"].
            // "abrupt" was rejected (verified via WKJavaScriptException log). Both graceful
            // and non-graceful self-initiated closes map to "client-stop" — the distinction
            // (stale-task cleanup vs explicit stop) doesn't matter to the UI.
            payload: ["reason": "client-stop"]
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
        // [DIAG-ASR] PCM-frame counter — log every 10th frame (≈ once / 2s) to confirm audio flowing.
        audioFrameCounter += 1
        if audioFrameCounter == 1 || audioFrameCounter % 10 == 0 {
            os_log("%{public}@", log: asrDiag, type: .info, "audio frame #\(audioFrameCounter) sent: \(frame.count)B (pcm=\(pcmChunk.count)B)")
        }
        Task { [weak self] in
            do {
                try await task.send(.data(frame))
            } catch {
                os_log("%{public}@", log: asrDiag, type: .info, "audio frame send FAILED at #\(self?.audioFrameCounter ?? 0): \(error)")
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
        os_log("%{public}@", log: asrDiag, type: .info, "receiveLoop started, task.state=\(task.state.rawValue)")
        var frameRxCount = 0
        while task.state == .running {
            let msg: URLSessionWebSocketTask.Message
            do {
                msg = try await task.receive()
            } catch {
                os_log("%{public}@", log: asrDiag, type: .info, "receive() THREW after \(frameRxCount) frames: error=\(error) urlErr=\((error as? URLError)?.code.rawValue ?? -9999) closeCode=\(task.closeCode.rawValue)")
                await handleReceiveError(error)
                return
            }
            switch msg {
            case .data(let frameData):
                frameRxCount += 1
                let hex = frameData.prefix(16).map { String(format: "%02x", $0) }.joined(separator: " ")
                os_log("%{public}@", log: asrDiag, type: .info, "RX frame #\(frameRxCount): \(frameData.count)B header16=[\(hex)]")
                handleFrame(frameData)
            case .string(let text):
                // SAUC does not send text frames; log defensively.
                os_log("%{public}@", log: asrDiag, type: .info, "RX text frame (unexpected): \(text.prefix(120))")
                continue
            @unknown default:
                os_log("%{public}@", log: asrDiag, type: .info, "RX unknown message kind")
                continue
            }
        }
        os_log("%{public}@", log: asrDiag, type: .info, "receiveLoop exiting, task.state=\(task.state.rawValue), closeCode=\(task.closeCode.rawValue)")
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
            // Seed ASR 2.0 may send a per-utterance breakdown, a summary-only
            // text, or a heartbeat with neither.  dispatchResult handles all.
            dispatchResult(r.result)
        case .serverError(let env):
            dispatchError(code: "asr.server-error",
                          message: "[\(env.code)] \(env.message)")
        }
    }

    // MARK: - dispatchResult (§7.1)

    /// Handle the optional `result` block per Seed ASR 2.0 wire format.
    ///
    /// IMPORTANT (verified empirically against Volc Seed ASR 2.0 + matched in
    /// /tmp/asr_test.py output):
    ///   - `result.text` is ALWAYS the FULL cumulative transcript so far across
    ///     the whole session, not the delta. The text grows monotonically per
    ///     frame.
    ///   - `result.utterances` is the FULL HISTORY of segmented utterances
    ///     (each subsequent frame includes ALL prior + current utterances).
    ///     Iterating utterances per-frame (the original M2.8.dev.c approach)
    ///     causes the same definite utterance to get re-dispatched many times,
    ///     producing the catastrophic "repeated 10+ times" UI bug observed.
    ///
    /// Therefore: emit ONE event per frame using `result.text` as the entire
    /// transcript. Mark the event "final" iff every utterance in the array is
    /// definite=true (server has committed the whole transcript so far).
    /// JS layer just shows whatever `text` arrives — no accumulation needed.
    private func dispatchResult(_ result: ASRResultInner?) {
        guard let result = result else {
            os_log("%{public}@", log: asrDiag, type: .info, "dispatchResult: result==nil (heartbeat)")
            return
        }
        guard let text = result.text, !text.isEmpty else {
            // No text yet (initial heartbeat or empty interim) — nothing to render.
            return
        }
        // Definite if ALL utterances have definite=true (i.e. server committed
        // the full transcript so far). If utterances missing or any is partial,
        // treat as live partial.
        let allDefinite: Bool
        if let utts = result.utterances, !utts.isEmpty {
            allDefinite = utts.allSatisfy { ($0.definite ?? false) }
        } else {
            allDefinite = false
        }
        let eventType = allDefinite ? "asr-final" : "asr-partial"
        var payload: [String: Any] = ["definite": allDefinite, "text": text]
        if allDefinite, let utts = result.utterances, let lastDefinite = utts.last(where: { ($0.definite ?? false) }) {
            if let st = lastDefinite.startTime { payload["startTime"] = st }
            if let et = lastDefinite.endTime   { payload["endTime"] = et }
        }
        os_log("%{public}@", log: asrDiag, type: .info, "dispatch \(eventType) streamId=\(self.streamId ?? "nil") textLen=\(text.count) allDefinite=\(allDefinite)")
        router.dispatchEvent(type: eventType, streamId: self.streamId ?? "", payload: payload)
    }

    // MARK: - dispatchUtterances (§7.1)

    private func dispatchUtterances(_ utterances: [ASRUtterance]) {
        for u in utterances {
            // Skip utterances with no text — server occasionally emits
            // metadata-only entries (e.g. timing markers) the UI can't render.
            guard let text = u.text, !text.isEmpty else { continue }
            // `definite` defaults to false (partial) when the server omits it.
            let isDefinite = u.definite ?? false
            // §C3 / §3.3: utterance.text is candidate PII — never write to log.
            var payload: [String: Any] = ["definite": isDefinite, "text": text]
            if isDefinite {
                if let st = u.startTime { payload["startTime"] = st }
                if let et = u.endTime   { payload["endTime"] = et }
            }
            let eventType = isDefinite ? "asr-final" : "asr-partial"
            // [DIAG-ASR] Log dispatch — text length only (PII §C3 keeps text out of log).
            os_log("%{public}@", log: asrDiag, type: .info, "dispatch \(eventType) streamId=\(self.streamId ?? "nil") textLen=\(text.count) definite=\(isDefinite)")
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
            user: ASRUserConfig(uid: "eatit"),
            audio: ASRAudioConfig(
                format: "pcm",
                codec: "raw",
                rate: 16000,
                bits: 16,
                channel: 1
            ),
            request: ASRRequestConfig(
                modelName: "bigmodel",
                enableITN: params.enableITN ?? true,
                enablePunc: params.enablePunc ?? true,
                enableDDC: false,
                enableNonstream: false,
                resultType: "full",
                showUtterances: true
            )
        )
        let firstFrame = try packFirstFrame(config: config)
        try await newTask.send(.data(firstFrame))

        // Spawn fresh receive loop.
        Task { [weak self] in
            guard let self = self else { return }
            await self.receiveLoop()
        }
    }

    // MARK: - makeWebSocketRequest() (§3.2 pseudocode + §A0.3 host check + §A0.4 lifecycle)

    private func makeWebSocketRequest() throws -> URLRequest {
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

        guard !creds.apiKey.isEmpty else {
            throw BridgeError(code: "asr.credentials-missing",
                              message: "apiKey is empty")
        }

        // Resolve endpoint: creds.endpointPath overrides ONLY the path
        // (host stays pinned by §A0.3 white-list).  Empty / nil → fall back
        // to the gateway-level endpoint baked at init.
        let resolvedEndpoint: URL = {
            let pathOverride = (creds.endpointPath ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !pathOverride.isEmpty,
                  var comps = URLComponents(url: endpoint, resolvingAgainstBaseURL: false) else {
                return endpoint
            }
            comps.path = pathOverride.hasPrefix("/") ? pathOverride : "/\(pathOverride)"
            return comps.url ?? endpoint
        }()

        // §A0.3: redundant hostname check (code layer, defense-in-depth alongside ATS)
        guard resolvedEndpoint.host?.lowercased() == Self.allowedHost else {
            throw BridgeError(code: "asr.host-not-allowed",
                              message: "host '\(resolvedEndpoint.host ?? "")' not in allow list")
        }

        let resolvedResourceId: String = {
            let trimmed = (creds.resourceId ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? Self.resourceId : trimmed
        }()

        let newConnectId = UUID().uuidString
        self.connectId = newConnectId

        var req = URLRequest(url: resolvedEndpoint)
        // 新版控制台单 key 鉴权:X-Api-Key 取代旧版 X-Api-App-Key + X-Api-Access-Key。
        // X-Api-Resource-Id / X-Api-Connect-Id 在新旧两版协议中保持不变。
        req.setValue(creds.apiKey,       forHTTPHeaderField: "X-Api-Key")
        req.setValue(resolvedResourceId, forHTTPHeaderField: "X-Api-Resource-Id")
        req.setValue(newConnectId,       forHTTPHeaderField: "X-Api-Connect-Id")
        // creds (and creds.apiKey) exits scope at function return → ARC release
        return req
    }
}
