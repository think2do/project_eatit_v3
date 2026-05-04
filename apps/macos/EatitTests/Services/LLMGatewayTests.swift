import XCTest
@testable import Eatit

// MARK: - MockURLProtocol

/// URLProtocol subclass that intercepts all requests during tests.
/// Use MockURLProtocol.requestHandler to inject fake responses.
/// Call count is tracked in MockURLProtocol.callCount for zero-network assertions.
final class MockURLProtocol: URLProtocol {
    static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?
    static var callCount: Int = 0

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        MockURLProtocol.callCount += 1
        guard let handler = MockURLProtocol.requestHandler else {
            fatalError("MockURLProtocol.requestHandler not set")
        }
        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

// MARK: - MockKeychainReading

/// Implements KeychainReading protocol for tests — no real Keychain access.
final class MockKeychainReading: KeychainReading {
    var mockKey: String?

    func read(account: String) throws -> Data? {
        guard let key = mockKey else { return nil }
        return key.data(using: .utf8)
    }
}

// MARK: - MockBridgeEventDispatching (Option C protocol seam — §B9)

/// Captures dispatchEvent calls for assertion in chatStream tests.
/// Uses NSLock for thread safety (dispatchEvent may be called from arbitrary Tasks).
final class MockBridgeEventDispatching: BridgeEventDispatching {
    struct CapturedEvent {
        let type: String
        let streamId: String
        let payload: Any
    }
    private let lock = NSLock()
    private var _events: [CapturedEvent] = []

    var events: [CapturedEvent] {
        lock.lock(); defer { lock.unlock() }
        return _events
    }

    func dispatchEvent(type: String, streamId: String, payload: Any) {
        lock.lock()
        _events.append(CapturedEvent(type: type, streamId: streamId, payload: payload))
        lock.unlock()
    }

    /// Wait (polling with short sleeps) until eventCount events are captured or timeout expires.
    func waitForEvents(count: Int, timeout: TimeInterval = 2.0) async {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if events.count >= count { return }
            try? await Task.sleep(nanoseconds: 10_000_000)  // 10ms
        }
    }
}

// MARK: - File-scope helpers

private func makeMockSession() -> URLSession {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [MockURLProtocol.self]
    return URLSession(configuration: config)
}

private func makeHTTPResponse(status: Int, url: URL) -> HTTPURLResponse {
    HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!
}

private func validResponseData() -> Data {
    let json = """
    {
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "created": 1700000000,
        "model": "doubao-seed-1-6-250615",
        "choices": [
            {
                "index": 0,
                "message": { "role": "assistant", "content": "Hello, world!" },
                "finish_reason": "stop"
            }
        ],
        "usage": { "prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15 }
    }
    """
    return json.data(using: .utf8)!
}

private func minimalRequest() -> ChatCompletionRequest {
    ChatCompletionRequest(
        model: "doubao-seed-1-6-250615",
        messages: [ChatMessage(role: "user", content: "hi", name: nil, toolCallId: nil, toolCalls: nil)],
        stream: false,
        temperature: nil,
        topP: nil,
        maxTokens: nil,
        stop: nil,
        tools: nil,
        toolChoice: nil,
        responseFormat: nil
    )
}

// MARK: - LLMGatewayTests

final class LLMGatewayTests: XCTestCase {

    private var mockKeychain: MockKeychainReading!
    private let testURL = URL(string: "https://ark.cn-beijing.volces.com/api/v3/chat/completions")!

    override func setUp() {
        super.setUp()
        MockURLProtocol.callCount = 0
        MockURLProtocol.requestHandler = nil
        mockKeychain = MockKeychainReading()
        mockKeychain.mockKey = "test-api-key-value"
    }

    override func tearDown() {
        MockURLProtocol.requestHandler = nil
        MockURLProtocol.callCount = 0
        mockKeychain = nil
        super.tearDown()
    }

    // MARK: - §10.1 Case 1: Happy path 200 + valid JSON

    func testChatHappyPath_200_Json() async throws {
        let url = testURL
        MockURLProtocol.requestHandler = { _ in
            (makeHTTPResponse(status: 200, url: url), validResponseData())
        }
        let sut = LLMGateway(keychain: mockKeychain, session: makeMockSession(), endpoint: testURL)
        let result = try await sut.chat(minimalRequest())
        XCTAssertEqual(result.choices.count, 1)
        XCTAssertEqual(result.choices.first?.message.content, "Hello, world!")
        XCTAssertEqual(result.choices.first?.finishReason, "stop")
        XCTAssertEqual(result.usage?.totalTokens, 15)
    }

    // MARK: - §10.1 Case 2: 429 retry → success on 3rd attempt

    func testChat_429_RetrySuccess() async throws {
        let url = testURL
        var attempt = 0
        MockURLProtocol.requestHandler = { _ in
            attempt += 1
            if attempt <= 2 {
                return (makeHTTPResponse(status: 429, url: url),
                        Data("{\"error\":{\"code\":\"rate_limit\",\"message\":\"too many\"}}".utf8))
            }
            return (makeHTTPResponse(status: 200, url: url), validResponseData())
        }
        let sut = LLMGateway(keychain: mockKeychain, session: makeMockSession(), endpoint: testURL)
        let start = Date()
        let result = try await sut.chat(minimalRequest())
        let elapsed = Date().timeIntervalSince(start)
        // 2 retries with backoff 0.5s + 1.0s = 1.5s minimum; allow ±200ms tolerance
        XCTAssertGreaterThanOrEqual(elapsed, 1.2, "expected at least ~1.5s backoff, got \(elapsed)s")
        XCTAssertEqual(result.choices.first?.message.content, "Hello, world!")
        XCTAssertEqual(MockURLProtocol.callCount, 3)
    }

    // MARK: - §10.1 Case 3: 500 ×4 → retry exhausted

    func testChat_500x4_RetryExhausted() async throws {
        let url = testURL
        MockURLProtocol.requestHandler = { _ in
            (makeHTTPResponse(status: 500, url: url),
             Data("{\"error\":{\"code\":\"internal\",\"message\":\"server error\"}}".utf8))
        }
        let sut = LLMGateway(keychain: mockKeychain, session: makeMockSession(), endpoint: testURL)
        do {
            _ = try await sut.chat(minimalRequest())
            XCTFail("expected retry exhausted error")
        } catch let err as BridgeError {
            XCTAssertEqual(err.code, "llm.http-5xx-retry-exhausted")
        }
        // 4 total attempts: 1 initial + 3 retries
        XCTAssertEqual(MockURLProtocol.callCount, 4)
    }

    // MARK: - §10.1 Case 4: 401 → no retry, immediate error

    func testChat_401_NoRetry() async throws {
        let url = testURL
        MockURLProtocol.requestHandler = { _ in
            (makeHTTPResponse(status: 401, url: url),
             Data("{\"error\":{\"code\":\"invalid_api_key\",\"message\":\"auth failed\"}}".utf8))
        }
        let sut = LLMGateway(keychain: mockKeychain, session: makeMockSession(), endpoint: testURL)
        do {
            _ = try await sut.chat(minimalRequest())
            XCTFail("expected api-key-invalid error")
        } catch let err as BridgeError {
            XCTAssertEqual(err.code, "llm.api-key-invalid")
        }
        // 401 must NOT retry — only 1 network hit
        XCTAssertEqual(MockURLProtocol.callCount, 1)
    }

    // MARK: - §10.1 Case 5: API key missing → zero network

    func testChat_ApiKeyMissing() async throws {
        mockKeychain.mockKey = nil  // Keychain returns nil → api-key-missing before any network
        let sut = LLMGateway(keychain: mockKeychain, session: makeMockSession(), endpoint: testURL)
        do {
            _ = try await sut.chat(minimalRequest())
            XCTFail("expected api-key-missing error")
        } catch let err as BridgeError {
            XCTAssertEqual(err.code, "llm.api-key-missing")
        }
        // No network request should have been made
        XCTAssertEqual(MockURLProtocol.callCount, 0)
    }

    // MARK: - §10.1 Case 6: Host not allowed → zero network

    func testChat_HostNotAllowed() async throws {
        let evilEndpoint = URL(string: "https://evil.example.com/api/chat")!
        let sut = LLMGateway(keychain: mockKeychain, session: makeMockSession(), endpoint: evilEndpoint)
        do {
            _ = try await sut.chat(minimalRequest())
            XCTFail("expected host-not-allowed error")
        } catch let err as BridgeError {
            XCTAssertEqual(err.code, "llm.host-not-allowed")
        }
        // No network request should have been made (host check before URLSession)
        XCTAssertEqual(MockURLProtocol.callCount, 0)
    }

    // MARK: - §10.1 Case 7: 200 + invalid JSON → decode-failed

    func testChat_DecodeFailed() async throws {
        let url = testURL
        MockURLProtocol.requestHandler = { _ in
            (makeHTTPResponse(status: 200, url: url),
             Data("not valid json at all!!!".utf8))
        }
        let sut = LLMGateway(keychain: mockKeychain, session: makeMockSession(), endpoint: testURL)
        do {
            _ = try await sut.chat(minimalRequest())
            XCTFail("expected decode-failed error")
        } catch let err as BridgeError {
            XCTAssertEqual(err.code, "llm.decode-failed")
        }
    }

    // MARK: - §10.1 Case 8: chatStream happy path — 5 chunks + [DONE]

    func testChatStream_HappyPath_5Chunks() async throws {
        let url = testURL
        // Build SSE body with 5 content chunks + [DONE].
        // Each ARK SSE frame: "data: <json>\n\n"
        let words = ["Hello", " ", "world", "!", " Done"]
        var sseBody = ""
        for (i, word) in words.enumerated() {
            let json = """
            {"id":"chunk-\(i)","choices":[{"index":0,"delta":{"content":"\(word)"},"finish_reason":null}]}
            """
            sseBody += "data: \(json)\n\n"
        }
        sseBody += "data: [DONE]\n\n"

        MockURLProtocol.requestHandler = { _ in
            (makeHTTPResponse(status: 200, url: url), Data(sseBody.utf8))
        }
        let sut = LLMGateway(keychain: mockKeychain, session: makeMockSession(), endpoint: testURL)
        let dispatcher = MockBridgeEventDispatching()
        let streamId = "test-stream-happy"

        await sut.chatStream(minimalRequest(), streamId: streamId, dispatcher: dispatcher)

        // Expect 5 stream-chunk events + 1 stream-end
        let events = dispatcher.events
        XCTAssertEqual(events.count, 6, "expected 5 stream-chunk + 1 stream-end, got \(events.count)")
        let chunks = events.filter { $0.type == "stream-chunk" }
        XCTAssertEqual(chunks.count, 5)
        let ends = events.filter { $0.type == "stream-end" }
        XCTAssertEqual(ends.count, 1)
        if let endPayload = ends.first?.payload as? [String: String] {
            XCTAssertEqual(endPayload["finishReason"], "stop")
        } else {
            XCTFail("stream-end payload not a [String:String]")
        }
        // Verify chunk contents in order
        let contents = chunks.compactMap { ($0.payload as? [String: String])?["content"] }
        XCTAssertEqual(contents, words)
        // All events on our streamId
        XCTAssertTrue(events.allSatisfy { $0.streamId == streamId })
    }

    // MARK: - §10.1 Case 9: chatStream network interrupt → stream-end eof
    // Judgment call (architect §10.1 row 9 "OR"): stream-end with finishReason "eof" chosen,
    // consistent with §6.2 EOF-without-[DONE] code path.

    func testChatStream_NetworkInterrupt() async throws {
        let url = testURL
        // 2 valid chunks; body ends abruptly (no [DONE]).
        let sseBody = """
        data: {"id":"c0","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n\
        data: {"id":"c1","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\n
        """
        MockURLProtocol.requestHandler = { _ in
            (makeHTTPResponse(status: 200, url: url), Data(sseBody.utf8))
        }
        let sut = LLMGateway(keychain: mockKeychain, session: makeMockSession(), endpoint: testURL)
        let dispatcher = MockBridgeEventDispatching()
        let streamId = "test-stream-interrupt"

        await sut.chatStream(minimalRequest(), streamId: streamId, dispatcher: dispatcher)

        let events = dispatcher.events
        let chunks = events.filter { $0.type == "stream-chunk" }
        let ends = events.filter { $0.type == "stream-end" }
        XCTAssertEqual(chunks.count, 2, "expected 2 stream-chunk events")
        XCTAssertEqual(ends.count, 1, "expected 1 stream-end event (eof)")
        if let endPayload = ends.first?.payload as? [String: String] {
            XCTAssertEqual(endPayload["finishReason"], "eof")
        } else {
            XCTFail("stream-end payload not a [String:String]")
        }
    }

    // MARK: - §10.1 Case 10: chatStream cancel → stream-error llm.stream-cancelled

    func testChatStream_Cancel() async throws {
        let url = testURL
        // Return a minimal SSE body; the task is cancelled before reading starts.
        let sseBody = "data: [DONE]\n\n"
        MockURLProtocol.requestHandler = { _ in
            (makeHTTPResponse(status: 200, url: url), Data(sseBody.utf8))
        }
        let sut = LLMGateway(keychain: mockKeychain, session: makeMockSession(), endpoint: testURL)
        let dispatcher = MockBridgeEventDispatching()
        let streamId = "test-stream-cancel"

        // Start task then immediately cancel it.
        let task = Task {
            await sut.chatStream(minimalRequest(), streamId: streamId, dispatcher: dispatcher)
        }
        task.cancel()
        await task.value

        // After cancellation, exactly 1 stream-error with llm.stream-cancelled.
        let events = dispatcher.events
        let errors = events.filter { $0.type == "stream-error" }
        XCTAssertEqual(errors.count, 1, "expected 1 stream-error event after cancel")
        if let errPayload = errors.first?.payload as? [String: String] {
            XCTAssertEqual(errPayload["code"], "llm.stream-cancelled")
        } else {
            XCTFail("stream-error payload not a [String:String]")
        }
        // No stream-end or stream-chunk should have been emitted.
        XCTAssertTrue(events.filter { $0.type == "stream-end" }.isEmpty)
    }

    // MARK: - §10.1 Case 11: chatStream HTTP 500 → stream-error llm.http-5xx-retry-exhausted

    func testChatStream_HTTPError() async throws {
        let url = testURL
        MockURLProtocol.requestHandler = { _ in
            (makeHTTPResponse(status: 500, url: url),
             Data("{\"error\":{\"code\":\"internal\",\"message\":\"server error\"}}".utf8))
        }
        let sut = LLMGateway(keychain: mockKeychain, session: makeMockSession(), endpoint: testURL)
        let dispatcher = MockBridgeEventDispatching()
        let streamId = "test-stream-http-error"

        await sut.chatStream(minimalRequest(), streamId: streamId, dispatcher: dispatcher)

        let events = dispatcher.events
        XCTAssertEqual(events.count, 1, "expected exactly 1 stream-error event")
        let errors = events.filter { $0.type == "stream-error" }
        XCTAssertEqual(errors.count, 1)
        if let errPayload = errors.first?.payload as? [String: String] {
            XCTAssertEqual(errPayload["code"], "llm.http-5xx-retry-exhausted")
        } else {
            XCTFail("stream-error payload not a [String:String]")
        }
    }
}
