import XCTest
@testable import Eatit

final class BridgeRouterTests: XCTestCase {

    private var router: BridgeRouter!

    override func setUp() {
        super.setUp()
        router = BridgeRouter()
    }

    // MARK: - Happy path

    func testEchoHappyPath() async throws {
        struct P: Codable { let msg: String }
        struct R: Codable { let msg: String }
        router.register(method: "bridge.echo") { (p: P) -> R in
            R(msg: p.msg)
        }

        let response = try await invoke(method: "bridge.echo", params: ["msg": "hi"])
        switch response {
        case .success(let id, let data):
            XCTAssertFalse(id.isEmpty)
            let dict = data.value as? [String: Any]
            XCTAssertEqual(dict?["msg"] as? String, "hi")
        case .failure:
            XCTFail("expected success")
        }
    }

    // MARK: - Error cases

    func testMethodNotFound() async throws {
        let response = try await invoke(method: "nonexistent.method", params: [:])
        switch response {
        case .success:
            XCTFail("expected failure")
        case .failure(let id, let error):
            XCTAssertFalse(id.isEmpty)
            XCTAssertEqual(error.code, "bridge.method-not-found")
        }
    }

    func testParamsDecodeFailure() async throws {
        struct P: Codable { let msg: String }
        struct R: Codable { let echoed: String }
        router.register(method: "bridge.echo-strict") { (p: P) -> R in
            R(echoed: p.msg)
        }
        // Send wrong shape — missing required `msg` key
        let response = try await invoke(method: "bridge.echo-strict", params: ["wrong": "field"])
        switch response {
        case .success:
            XCTFail("expected failure")
        case .failure(let id, let error):
            XCTAssertFalse(id.isEmpty)
            // §决策5: DecodingError → bridge.params-invalid
            XCTAssertEqual(error.code, "bridge.params-invalid")
        }
    }

    func testHandlerThrowsBridgeError() async throws {
        struct P: Codable { let msg: String }
        router.register(method: "bridge.throw-test") { (p: P) -> String in
            throw BridgeError(code: "bridge.internal-error", message: "handler threw deliberately")
        }
        let response = try await invoke(method: "bridge.throw-test", params: ["msg": "x"])
        switch response {
        case .success:
            XCTFail("expected failure")
        case .failure(_, let error):
            XCTAssertEqual(error.code, "bridge.internal-error")
        }
    }

    func testMissingIdOrMethod() async throws {
        // Body without 'id' — should return bridge.params-invalid
        let semaphore = DispatchSemaphore(value: 0)
        var captured: BridgeResponse?
        Task {
            await router.handle(body: ["method": "bridge.echo"], reply: { result, _ in
                if let dict = result as? [String: Any],
                   let data = try? JSONSerialization.data(withJSONObject: dict),
                   let resp = try? JSONDecoder().decode(BridgeResponse.self, from: data) {
                    captured = resp
                }
                semaphore.signal()
            })
        }
        _ = semaphore.wait(timeout: .now() + 5)
        guard let response = captured else {
            XCTFail("no reply received")
            return
        }
        switch response {
        case .success:
            XCTFail("expected failure for missing id")
        case .failure(_, let error):
            XCTAssertEqual(error.code, "bridge.params-invalid")
        }
    }

    // MARK: - Schema round-trip

    func testBridgeResponseSuccessRoundTrip() throws {
        let original = BridgeResponse.success(
            id: "00000000-0000-0000-0000-000000000001",
            data: AnyCodable(["msg": "hello"])
        )
        let encoded = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(BridgeResponse.self, from: encoded)
        switch decoded {
        case .success(let id, let data):
            XCTAssertEqual(id, "00000000-0000-0000-0000-000000000001")
            let dict = data.value as? [String: Any]
            XCTAssertEqual(dict?["msg"] as? String, "hello")
        case .failure:
            XCTFail("expected success after round-trip")
        }
    }

    func testBridgeResponseFailureRoundTrip() throws {
        let original = BridgeResponse.failure(
            id: "00000000-0000-0000-0000-000000000002",
            error: BridgeError(code: "bridge.method-not-found", message: "test")
        )
        let encoded = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(BridgeResponse.self, from: encoded)
        switch decoded {
        case .success:
            XCTFail("expected failure after round-trip")
        case .failure(let id, let error):
            XCTAssertEqual(id, "00000000-0000-0000-0000-000000000002")
            XCTAssertEqual(error.code, "bridge.method-not-found")
            XCTAssertEqual(error.message, "test")
        }
    }

    // MARK: - Helper

    private func invoke(method: String, params: [String: Any]) async throws -> BridgeResponse {
        let body: [String: Any] = [
            "id": UUID().uuidString.lowercased(),
            "method": method,
            "params": params
        ]
        let semaphore = DispatchSemaphore(value: 0)
        var captured: BridgeResponse?
        Task {
            await router.handle(body: body, reply: { result, _ in
                if let dict = result as? [String: Any],
                   let data = try? JSONSerialization.data(withJSONObject: dict),
                   let resp = try? JSONDecoder().decode(BridgeResponse.self, from: data) {
                    captured = resp
                }
                semaphore.signal()
            })
        }
        _ = semaphore.wait(timeout: .now() + 5)
        return captured ?? .failure(
            id: "",
            error: BridgeError(code: "test.failed", message: "no reply received within timeout")
        )
    }
}
