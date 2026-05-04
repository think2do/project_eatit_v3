import XCTest
@testable import Eatit

// MARK: - MockWebSocketSendableQueued
// A queue-based mock that lets tests pre-load frames for receive() to return in order.
// Once the queue is empty, receive() suspends indefinitely (or throws if errorAfterQueue is set).

final class MockWebSocketSendableQueued: WebSocketSendable {
    var sentFrames: [Data] = []
    var cancelCalled: Bool = false
    var sendError: Error?
    var resumed: Bool = false
    var state: URLSessionTask.State = .running
    var closeCode: URLSessionWebSocketTask.CloseCode = .invalid

    // Queue of frames to return from receive().
    private var receiveQueue: [URLSessionWebSocketTask.Message] = []
    // If set, thrown after all queued frames are consumed.
    var errorAfterQueue: Error?
    // Continuation for one pending receive() waiter.
    private var pendingContinuation: CheckedContinuation<URLSessionWebSocketTask.Message, Error>?
    private let lock = NSLock()

    func enqueue(_ message: URLSessionWebSocketTask.Message) {
        lock.lock()
        defer { lock.unlock() }
        if let cont = pendingContinuation {
            pendingContinuation = nil
            cont.resume(returning: message)
        } else {
            receiveQueue.append(message)
        }
    }

    func send(_ message: URLSessionWebSocketTask.Message) async throws {
        if let err = sendError { throw err }
        if case .data(let d) = message { sentFrames.append(d) }
    }

    func receive() async throws -> URLSessionWebSocketTask.Message {
        lock.lock()
        if !receiveQueue.isEmpty {
            let msg = receiveQueue.removeFirst()
            lock.unlock()
            return msg
        }
        if let err = errorAfterQueue {
            lock.unlock()
            throw err
        }
        // Park until enqueue() resumes us or task is cancelled.
        return try await withCheckedThrowingContinuation { cont in
            pendingContinuation = cont
            lock.unlock()
        }
    }

    func cancel(with closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        cancelCalled = true
        state = .canceling
        lock.lock()
        if let cont = pendingContinuation {
            pendingContinuation = nil
            lock.unlock()
            cont.resume(throwing: URLError(.cancelled))
        } else {
            lock.unlock()
        }
    }

    func resume() {
        resumed = true
    }
}

// MARK: - MockWebSocketTaskFactoryQueued

final class MockWebSocketTaskFactoryQueued: WebSocketTaskFactory {
    var taskToReturn: MockWebSocketSendableQueued

    init(taskToReturn: MockWebSocketSendableQueued) {
        self.taskToReturn = taskToReturn
    }

    func makeTask(with request: URLRequest) -> WebSocketSendable {
        taskToReturn
    }
}

// MARK: - Frame builders for test

private func makeServerFullResponseFrame(utterances: [[String: Any]]) -> Data {
    // Build JSON matching ASRResultPayload shape:
    // { "result": { "utterances": [...] } }
    var utteranceJSON: [[String: Any]] = []
    for u in utterances {
        utteranceJSON.append(u)
    }
    let body: [String: Any] = ["result": ["utterances": utteranceJSON]]
    let payload = try! JSONSerialization.data(withJSONObject: body)

    var header = Data(count: 4)
    header[0] = 0x11
    header[1] = (0x9 << 4) | 0x0   // serverFullResponse, flags=0
    header[2] = (0x1 << 4) | 0x0   // JSON, no compression
    header[3] = 0x00
    return header + payload
}

private func makeServerErrorFrame(code: Int, message: String) -> Data {
    let body: [String: Any] = ["code": code, "message": message]
    let payload = try! JSONSerialization.data(withJSONObject: body)

    var header = Data(count: 4)
    header[0] = 0x11
    header[1] = (0xB << 4) | 0x0   // serverErrorResponse, flags=0
    header[2] = (0x1 << 4) | 0x0   // JSON, no compression
    header[3] = 0x00
    return header + payload
}

// MARK: - Helper to build gateway for receive tests

private func makeValidCredsDataReceive(appId: String = "test-app", accessToken: String = "test-token") -> Data {
    let json = "{\"appId\":\"\(appId)\",\"accessToken\":\"\(accessToken)\"}"
    return json.data(using: .utf8)!
}

// MARK: - ASRGatewayReceiveTests

final class ASRGatewayReceiveTests: XCTestCase {

    private var mockKeychain: MockKeychainReading!
    private var mockRouter: MockBridgeEventDispatching!
    private var mockTask: MockWebSocketSendableQueued!
    private var mockFactory: MockWebSocketTaskFactoryQueued!

    private let validEndpoint = URL(string: "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel")!

    override func setUp() {
        super.setUp()
        mockKeychain = MockKeychainReading()
        mockKeychain.mockKey = String(data: makeValidCredsDataReceive(), encoding: .utf8)!
        mockRouter = MockBridgeEventDispatching()
        mockTask = MockWebSocketSendableQueued()
        mockFactory = MockWebSocketTaskFactoryQueued(taskToReturn: mockTask)
    }

    private func makeGateway() -> ASRGateway {
        ASRGateway(
            keychain: mockKeychain,
            router: mockRouter,
            factory: mockFactory,
            endpoint: validEndpoint
        )
    }

    private func connectGateway(_ gw: ASRGateway, streamId: String = "stream-rx-1") async throws {
        let params = ASRStartParams(streamId: streamId, enableITN: nil, enablePunc: nil)
        try await gw.connect(streamId: streamId, params: params)
    }

    // MARK: - Case 1: Happy path — partial then final dispatched in order

    func testReceiveLoop_HappyPath_ServerFullResponseDispatchesPartialThenFinal() async throws {
        let gw = makeGateway()

        let partialFrame = makeServerFullResponseFrame(utterances: [
            ["text": "hello", "definite": false]
        ])
        let finalFrame = makeServerFullResponseFrame(utterances: [
            ["text": "hello world", "definite": true]
        ])
        // Queue: partial → final → then error to end loop
        mockTask.enqueue(.data(partialFrame))
        mockTask.enqueue(.data(finalFrame))
        mockTask.errorAfterQueue = URLError(.cancelled)

        try await connectGateway(gw)

        await mockRouter.waitForEvents(count: 2, timeout: 2.0)

        let events = mockRouter.events
        // First event from connect-loop is the asr-end from cancelled, but we want partial/final first.
        let asrEvents = events.filter { $0.type == "asr-partial" || $0.type == "asr-final" }
        XCTAssertEqual(asrEvents.count, 2)
        XCTAssertEqual(asrEvents[0].type, "asr-partial")
        XCTAssertEqual(asrEvents[1].type, "asr-final")

        let partialPayload = asrEvents[0].payload as? [String: Any]
        XCTAssertEqual(partialPayload?["text"] as? String, "hello")
        XCTAssertEqual(partialPayload?["definite"] as? Bool, false)

        let finalPayload = asrEvents[1].payload as? [String: Any]
        XCTAssertEqual(finalPayload?["text"] as? String, "hello world")
        XCTAssertEqual(finalPayload?["definite"] as? Bool, true)
    }

    // MARK: - Case 2: Single frame with multiple utterances dispatched in order

    func testReceiveLoop_MultipleUtterancesInOneFrame_DispatchesInOrder() async throws {
        let gw = makeGateway()

        let multiFrame = makeServerFullResponseFrame(utterances: [
            ["text": "first", "definite": false],
            ["text": "second", "definite": false],
            ["text": "final utterance", "definite": true]
        ])
        mockTask.enqueue(.data(multiFrame))
        mockTask.errorAfterQueue = URLError(.cancelled)

        try await connectGateway(gw)

        await mockRouter.waitForEvents(count: 3, timeout: 2.0)

        let events = mockRouter.events.filter { $0.type == "asr-partial" || $0.type == "asr-final" }
        XCTAssertEqual(events.count, 3)
        XCTAssertEqual(events[0].type, "asr-partial")
        XCTAssertEqual(events[1].type, "asr-partial")
        XCTAssertEqual(events[2].type, "asr-final")

        let texts = events.compactMap { ($0.payload as? [String: Any])?["text"] as? String }
        XCTAssertEqual(texts, ["first", "second", "final utterance"])
    }

    // MARK: - Case 3: Malformed frame data → asr-end with reason="error" + errorCode="asr.frame-unpack-failed"

    func testReceiveLoop_DecodeFailed_DispatchesAsrEndError() async throws {
        let gw = makeGateway()

        // Too-short data triggers ASRFrameError.headerTooShort
        mockTask.enqueue(.data(Data([0x11, 0x90])))
        mockTask.errorAfterQueue = URLError(.cancelled)

        try await connectGateway(gw)

        await mockRouter.waitForEvents(count: 1, timeout: 2.0)

        let endEvents = mockRouter.events.filter { $0.type == "asr-end" }
        XCTAssertGreaterThanOrEqual(endEvents.count, 1)

        let payload = endEvents.first?.payload as? [String: Any]
        XCTAssertEqual(payload?["reason"] as? String, "error")
        XCTAssertEqual(payload?["errorCode"] as? String, "asr.frame-unpack-failed")
    }

    // MARK: - Case 4: Server error response frame → asr-end with errorCode="asr.server-error"

    func testReceiveLoop_ServerErrorResponse_DispatchesAsrEndError() async throws {
        let gw = makeGateway()

        let errFrame = makeServerErrorFrame(code: 403, message: "unauthorized access")
        mockTask.enqueue(.data(errFrame))
        mockTask.errorAfterQueue = URLError(.cancelled)

        try await connectGateway(gw)

        await mockRouter.waitForEvents(count: 1, timeout: 2.0)

        let endEvents = mockRouter.events.filter { $0.type == "asr-end" }
        XCTAssertGreaterThanOrEqual(endEvents.count, 1)

        let payload = endEvents.first?.payload as? [String: Any]
        XCTAssertEqual(payload?["reason"] as? String, "error")
        XCTAssertEqual(payload?["errorCode"] as? String, "asr.server-error")
        let msg = payload?["errorMessage"] as? String ?? ""
        XCTAssertTrue(msg.contains("unauthorized access"), "error message should contain server message")
    }

    // MARK: - Case 5: handlePCMChunk — task not running → silent drop (no send calls)

    func testHandlePCMChunk_TaskNotRunning_SilentDrop() async throws {
        let gw = makeGateway()
        mockTask.state = .canceling

        // Even though we never connected, simulate as if task is set but not running.
        // The guard in handlePCMChunk checks task.state == .running.
        // We connect so the task is set, then cancel the state.
        mockTask.errorAfterQueue = URLError(.cancelled)
        try await connectGateway(gw)

        // Now force state to canceling to simulate reconnect window.
        mockTask.state = .canceling

        let pcmChunk = Data(repeating: 0xAA, count: 6400)
        gw.handlePCMChunk(pcmChunk)

        // Give async Task inside handlePCMChunk a moment.
        try await Task.sleep(nanoseconds: 50_000_000)

        // Only the first frame (from connect) should have been sent; no additional audio frame.
        // sentFrames[0] is the first frame from connect; no index 1.
        XCTAssertEqual(mockTask.sentFrames.count, 1, "No audio frame should be sent when task is not running")
    }

    // MARK: - Case 6: handlePCMChunk — task running → sends packed audio frame

    func testHandlePCMChunk_HappyPath_SendsAudioFrame() async throws {
        let gw = makeGateway()
        mockTask.errorAfterQueue = URLError(.cancelled)

        try await connectGateway(gw, streamId: "stream-pcm")

        let pcmChunk = Data(repeating: 0xBB, count: 6400)
        gw.handlePCMChunk(pcmChunk)

        // Wait for async send to complete.
        try await Task.sleep(nanoseconds: 100_000_000)

        // sentFrames[0] = first frame from connect, sentFrames[1] = audio frame
        XCTAssertEqual(mockTask.sentFrames.count, 2, "Expected 2 sends: first frame + audio frame")

        let expectedAudioFrame = packAudioFrame(pcmChunk: pcmChunk, last: false)
        XCTAssertEqual(mockTask.sentFrames[1], expectedAudioFrame,
                       "Audio frame bytes must match packAudioFrame output byte-for-byte")
    }

    // MARK: - Case 7: disconnect(graceful: true) — sends last-flag frame + asr-end with reason="client-stop"

    func testDisconnectGraceful_SendsLastFlagFrameAndDispatchesAsrEnd() async throws {
        let gw = makeGateway()
        mockTask.errorAfterQueue = URLError(.cancelled)

        try await connectGateway(gw, streamId: "stream-stop")

        await gw.disconnect(graceful: true)

        // sentFrames[0] = first frame, sentFrames[1] = last-flag audio frame
        XCTAssertEqual(mockTask.sentFrames.count, 2, "Expected first frame + last-flag frame")

        let expectedLastFrame = packAudioFrame(pcmChunk: Data(), last: true)
        XCTAssertEqual(mockTask.sentFrames[1], expectedLastFrame,
                       "Last-flag frame must match packAudioFrame(last: true) output")

        XCTAssertTrue(mockTask.cancelCalled, "task.cancel() must be called")

        let endEvents = mockRouter.events.filter { $0.type == "asr-end" }
        XCTAssertGreaterThanOrEqual(endEvents.count, 1)
        let payload = endEvents.last?.payload as? [String: Any]
        XCTAssertEqual(payload?["reason"] as? String, "client-stop")
    }

    // MARK: - Case 8: disconnect(graceful: false) — no last-flag frame, asr-end reason="abrupt"

    func testDisconnectAbrupt_NoLastFlagDispatchesAbruptEnd() async throws {
        let gw = makeGateway()
        mockTask.errorAfterQueue = URLError(.cancelled)

        try await connectGateway(gw, streamId: "stream-abrupt")

        await gw.disconnect(graceful: false)

        // Only the first frame from connect; no last-flag frame.
        XCTAssertEqual(mockTask.sentFrames.count, 1, "Only first frame should be sent; no last-flag frame on abrupt disconnect")

        XCTAssertTrue(mockTask.cancelCalled, "task.cancel() must be called")

        let endEvents = mockRouter.events.filter { $0.type == "asr-end" }
        XCTAssertGreaterThanOrEqual(endEvents.count, 1)
        let payload = endEvents.last?.payload as? [String: Any]
        XCTAssertEqual(payload?["reason"] as? String, "abrupt")
    }

    // MARK: - Case 9 (optional): statusSnapshot — not connected returns connected=false

    func testStatusSnapshot_NotConnected_ReturnsConnectedFalse() {
        let gw = makeGateway()
        let status = gw.statusSnapshot()
        XCTAssertFalse(status.connected)
        XCTAssertNil(status.streamId)
        XCTAssertEqual(status.retryCount, 0)
    }

    // MARK: - Case 10 (optional): statusSnapshot — after connect returns connected=true

    func testStatusSnapshot_AfterConnect_ReturnsConnectedTrue() async throws {
        let gw = makeGateway()
        mockTask.errorAfterQueue = URLError(.cancelled)

        try await connectGateway(gw, streamId: "stream-status")

        let status = gw.statusSnapshot()
        XCTAssertTrue(status.connected)
        XCTAssertEqual(status.streamId, "stream-status")
        XCTAssertEqual(status.retryCount, 0)
    }

    // MARK: - Case 11: 1011 close code — receive error triggers attemptReconnect (exhausted → asr-end)

    func testHandleReceiveError_1011CloseCode_AttemptsReconnectThenEmitsEnd() async throws {
        let gw = makeGateway()

        // Close code 1011 = internalServerError
        mockTask.closeCode = .internalServerError
        // Error after empty queue: normal URLError (non-cancelled, non-no-network)
        mockTask.errorAfterQueue = URLError(.badServerResponse)

        // The reconnect attempts will also fail since mockFactory always returns mockTask.
        // mockTask still has errorAfterQueue set so reconnect send also fails eventually.
        // We just need to verify asr-end with reason="1011" after 3 retry exhaustions.
        // This test is time-sensitive (3×backoff); set shorter delays by not testing timing.
        // We wait for the final asr-end event.

        try await connectGateway(gw)

        // Wait up to 10s for retry exhaustion (3 * [500+1000+2000]ms max = 3.5s + overhead)
        await mockRouter.waitForEvents(count: 1, timeout: 10.0)

        let endEvents = mockRouter.events.filter {
            $0.type == "asr-end" &&
            (($0.payload as? [String: Any])?["errorCode"] as? String) == "asr.server-overload"
        }
        XCTAssertGreaterThanOrEqual(endEvents.count, 1,
            "After 3 retries exhausted, asr-end with errorCode=asr.server-overload should be dispatched")
    }

    // MARK: - Case 12: 1008 close code — no retry, asr-end with reason="error"

    func testHandleReceiveError_1008CloseCode_NoRetryEmitsApiKeyInvalid() async throws {
        let gw = makeGateway()

        mockTask.closeCode = .policyViolation
        mockTask.errorAfterQueue = URLError(.badServerResponse)

        try await connectGateway(gw)

        await mockRouter.waitForEvents(count: 1, timeout: 3.0)

        let endEvents = mockRouter.events.filter { $0.type == "asr-end" }
        XCTAssertGreaterThanOrEqual(endEvents.count, 1)
        let payload = endEvents.first?.payload as? [String: Any]
        XCTAssertEqual(payload?["reason"] as? String, "error")
        XCTAssertEqual(payload?["errorCode"] as? String, "asr.api-key-invalid")

        // Verify no reconnect attempt: factory was called once (initial connect)
        // Since reconnect reuses mockFactory which always returns mockTask, we check
        // that mockTask.resumed was called only once.
        XCTAssertEqual(mockTask.sentFrames.count, 1, "Only first frame; no reconnect send")
    }

    // MARK: - Case 13: 1006 close code — attempts reconnect (same as 1011)

    func testHandleReceiveError_1006CloseCode_AttemptsReconnect() async throws {
        let gw = makeGateway()

        mockTask.closeCode = .abnormalClosure
        mockTask.errorAfterQueue = URLError(.networkConnectionLost)

        try await connectGateway(gw)

        await mockRouter.waitForEvents(count: 1, timeout: 10.0)

        // After exhaustion, asr-end reason="1011" (retry-exhausted path)
        let endEvents = mockRouter.events.filter {
            $0.type == "asr-end" &&
            (($0.payload as? [String: Any])?["errorCode"] as? String) == "asr.server-overload"
        }
        XCTAssertGreaterThanOrEqual(endEvents.count, 1,
            "1006 triggers retry; after exhaustion emits asr-server-overload end")
    }
}
