import XCTest
@testable import Eatit

// MARK: - MockWebSocketSendable

final class MockWebSocketSendable: WebSocketSendable {
    var sentFrames: [Data] = []
    var cancelCalled: Bool = false
    var sendError: Error?
    var resumed: Bool = false
    var state: URLSessionTask.State = .running

    func send(_ message: URLSessionWebSocketTask.Message) async throws {
        if let err = sendError { throw err }
        if case .data(let d) = message { sentFrames.append(d) }
    }

    func cancel(with closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        cancelCalled = true
    }

    func resume() {
        resumed = true
    }
}

// MARK: - MockWebSocketTaskFactory

final class MockWebSocketTaskFactory: WebSocketTaskFactory {
    var capturedRequests: [URLRequest] = []
    var taskToReturn: MockWebSocketSendable

    init(taskToReturn: MockWebSocketSendable) {
        self.taskToReturn = taskToReturn
    }

    func makeTask(with request: URLRequest) -> WebSocketSendable {
        capturedRequests.append(request)
        return taskToReturn
    }
}

// MARK: - Helpers

private func makeValidCredsData(appId: String = "test-app", accessToken: String = "test-token") -> Data {
    let json = "{\"appId\":\"\(appId)\",\"accessToken\":\"\(accessToken)\"}"
    return json.data(using: .utf8)!
}

private func makeMinimalParams(streamId: String = "stream-001") -> ASRStartParams {
    ASRStartParams(streamId: streamId, enableITN: nil, enablePunc: nil)
}

private let validEndpoint = URL(string: "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel")!
private let badHostEndpoint = URL(string: "wss://evil.example.com/api/v3/sauc/bigmodel")!

// MARK: - ASRGatewayConnectTests

final class ASRGatewayConnectTests: XCTestCase {

    private var mockKeychain: MockKeychainReading!
    private var mockRouter: MockBridgeEventDispatching!
    private var mockTask: MockWebSocketSendable!
    private var mockFactory: MockWebSocketTaskFactory!

    override func setUp() {
        super.setUp()
        mockKeychain = MockKeychainReading()
        mockRouter = MockBridgeEventDispatching()
        mockTask = MockWebSocketSendable()
        mockFactory = MockWebSocketTaskFactory(taskToReturn: mockTask)
    }

    private func makeGateway(endpoint: URL = validEndpoint) -> ASRGateway {
        ASRGateway(
            keychain: mockKeychain,
            router: mockRouter,
            factory: mockFactory,
            endpoint: endpoint
        )
    }

    // MARK: - Case 1: Happy path — 4 headers injected

    func testConnect_HappyPath_4HeadersInjected() async throws {
        mockKeychain.mockKey = String(data: makeValidCredsData(appId: "test-app", accessToken: "test-token"), encoding: .utf8)!
        let gw = makeGateway()
        let params = makeMinimalParams(streamId: "stream-hdr")

        try await gw.connect(streamId: "stream-hdr", params: params)

        XCTAssertEqual(mockFactory.capturedRequests.count, 1)
        let req = mockFactory.capturedRequests[0]

        XCTAssertEqual(req.value(forHTTPHeaderField: "X-Api-App-Key"), "test-app")
        XCTAssertEqual(req.value(forHTTPHeaderField: "X-Api-Access-Key"), "test-token")
        XCTAssertEqual(req.value(forHTTPHeaderField: "X-Api-Resource-Id"), "volc.bigasr.sauc.duration")

        let connectId = req.value(forHTTPHeaderField: "X-Api-Connect-Id")
        XCTAssertNotNil(connectId, "X-Api-Connect-Id must be set")
        XCTAssertFalse(connectId!.isEmpty, "X-Api-Connect-Id must be non-empty")
        // Should be UUID-shaped (8-4-4-4-12 or equivalent non-empty string)
        XCTAssertGreaterThan(connectId!.count, 8)
    }

    // MARK: - Case 2: First frame body bytes match packFirstFrame output

    func testConnect_FirstFrameBodyBytes() async throws {
        mockKeychain.mockKey = String(data: makeValidCredsData(), encoding: .utf8)!
        let gw = makeGateway()

        try await gw.connect(streamId: "stream-frame", params: makeMinimalParams(streamId: "stream-frame"))

        XCTAssertEqual(mockTask.sentFrames.count, 1, "Exactly 1 send call expected")

        // Build the expected first-frame bytes using the same path
        let expectedConfig = ASRConfigPayload(
            audio: ASRAudioConfig(format: "pcm", rate: 16000, channels: 1, codec: "raw"),
            request: ASRRequestConfig(
                modelName: "bigmodel",
                enableITN: true,
                enablePunc: true,
                enableSpeakerInfo: nil
            )
        )
        let expectedBytes = try packFirstFrame(config: expectedConfig, gzip: false)

        XCTAssertEqual(mockTask.sentFrames[0], expectedBytes,
                       "First frame bytes must match packFirstFrame output byte-for-byte")
    }

    // MARK: - Case 3: Keychain missing → throws credentials-missing; task never resumed

    func testConnect_KeychainMissing_ThrowsCredentialsMissing() async throws {
        mockKeychain.mockKey = nil   // no data in keychain
        let gw = makeGateway()

        do {
            try await gw.connect(streamId: "s1", params: makeMinimalParams(streamId: "s1"))
            XCTFail("Expected BridgeError to be thrown")
        } catch let err as BridgeError {
            XCTAssertEqual(err.code, "asr.credentials-missing")
        }

        XCTAssertEqual(mockFactory.capturedRequests.count, 0, "factory.makeTask must never be called")
        XCTAssertFalse(mockTask.resumed, "task.resume() must never be called")
    }

    // MARK: - Case 4: Keychain malformed JSON → throws credentials-malformed

    func testConnect_KeychainMalformedJSON_ThrowsCredentialsMalformed() async throws {
        mockKeychain.mockKey = "not-valid-json{"
        let gw = makeGateway()

        do {
            try await gw.connect(streamId: "s2", params: makeMinimalParams(streamId: "s2"))
            XCTFail("Expected BridgeError to be thrown")
        } catch let err as BridgeError {
            XCTAssertEqual(err.code, "asr.credentials-malformed")
        }

        XCTAssertEqual(mockFactory.capturedRequests.count, 0)
    }

    // MARK: - Case 5: Keychain empty appId → throws credentials-missing

    func testConnect_KeychainEmptyAppId_ThrowsCredentialsMissing() async throws {
        mockKeychain.mockKey = String(data: makeValidCredsData(appId: "", accessToken: "some-token"), encoding: .utf8)!
        let gw = makeGateway()

        do {
            try await gw.connect(streamId: "s3", params: makeMinimalParams(streamId: "s3"))
            XCTFail("Expected BridgeError to be thrown")
        } catch let err as BridgeError {
            XCTAssertEqual(err.code, "asr.credentials-missing")
        }

        XCTAssertEqual(mockFactory.capturedRequests.count, 0)
    }

    // MARK: - Case 6: Host not allowed → throws host-not-allowed; factory never called

    func testConnect_HostNotAllowed_ThrowsHostNotAllowed() async throws {
        mockKeychain.mockKey = String(data: makeValidCredsData(), encoding: .utf8)!
        let gw = makeGateway(endpoint: badHostEndpoint)

        do {
            try await gw.connect(streamId: "s4", params: makeMinimalParams(streamId: "s4"))
            XCTFail("Expected BridgeError to be thrown")
        } catch let err as BridgeError {
            XCTAssertEqual(err.code, "asr.host-not-allowed")
        }

        XCTAssertEqual(mockFactory.capturedRequests.count, 0, "factory must never be called on bad host")
    }

    // MARK: - Case 7: Already connected → second connect throws already-connected

    func testConnect_AlreadyConnected_ThrowsAlreadyConnected() async throws {
        mockKeychain.mockKey = String(data: makeValidCredsData(), encoding: .utf8)!
        let gw = makeGateway()

        try await gw.connect(streamId: "s5", params: makeMinimalParams(streamId: "s5"))

        // Second connect attempt without disconnect
        do {
            try await gw.connect(streamId: "s5b", params: makeMinimalParams(streamId: "s5b"))
            XCTFail("Expected BridgeError to be thrown")
        } catch let err as BridgeError {
            XCTAssertEqual(err.code, "asr.already-connected")
        }

        // factory was only called once (for the first connect)
        XCTAssertEqual(mockFactory.capturedRequests.count, 1)
    }

    // MARK: - Case 8: disconnect clears state; second connect succeeds

    func testDisconnect_ClearsState() async throws {
        mockKeychain.mockKey = String(data: makeValidCredsData(), encoding: .utf8)!
        let gw = makeGateway()
        let params = makeMinimalParams(streamId: "s6")

        try await gw.connect(streamId: "s6", params: params)
        XCTAssertEqual(mockFactory.capturedRequests.count, 1)

        await gw.disconnect()
        XCTAssertTrue(mockTask.cancelCalled, "task.cancel() must be called on disconnect")

        // Second connect with a fresh mock task
        let mockTask2 = MockWebSocketSendable()
        mockFactory.taskToReturn = mockTask2
        try await gw.connect(streamId: "s6b", params: makeMinimalParams(streamId: "s6b"))
        XCTAssertEqual(mockFactory.capturedRequests.count, 2, "Second connect should proceed after disconnect")
        XCTAssertTrue(mockTask2.resumed, "Second task must be resumed")
    }

    // MARK: - Case 9: First frame send fails → state reset; subsequent connect works

    func testConnect_FirstFrameSendFails_CleansUpState() async throws {
        mockKeychain.mockKey = String(data: makeValidCredsData(), encoding: .utf8)!
        let gw = makeGateway()

        struct SendFailure: Error {}
        mockTask.sendError = SendFailure()

        do {
            try await gw.connect(streamId: "s7", params: makeMinimalParams(streamId: "s7"))
            XCTFail("Expected BridgeError to be thrown")
        } catch let err as BridgeError {
            XCTAssertEqual(err.code, "asr.ws-handshake-failed")
        }

        XCTAssertTrue(mockTask.cancelCalled, "Failed task must be cancelled for cleanup")

        // Subsequent connect should not throw already-connected (state was reset)
        let mockTask2 = MockWebSocketSendable()
        mockFactory.taskToReturn = mockTask2
        try await gw.connect(streamId: "s7b", params: makeMinimalParams(streamId: "s7b"))
        XCTAssertEqual(mockFactory.capturedRequests.count, 2)
    }
}
