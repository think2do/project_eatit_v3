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
}
