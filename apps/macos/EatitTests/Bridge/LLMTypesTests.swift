import XCTest
@testable import Eatit

// §B9 dual-end contract: mirrors llmTypes.test.ts Vitest suite.
// §C / §A0.4: Pure Codable round-trip tests — no Keychain, no network, no AVFoundation.
final class LLMTypesTests: XCTestCase {

    private func encode<T: Encodable>(_ value: T) throws -> Data {
        try JSONEncoder().encode(value)
    }

    private func decode<T: Decodable>(_ type: T.Type, _ data: Data) throws -> T {
        try JSONDecoder().decode(type, from: data)
    }

    // MARK: - ChatMessage

    func testChatMessageUserRoundTrip() throws {
        let original = ChatMessage(
            role: "user", content: "hello", name: nil, toolCallId: nil, toolCalls: nil
        )
        let data = try encode(original)
        let decoded = try decode(ChatMessage.self, data)
        XCTAssertEqual(decoded, original)
    }

    func testChatMessageAssistantNullContentToolCallRoundTrip() throws {
        let toolCall = ToolCall(
            id: "x",
            type: "function",
            function: ToolCall.FunctionCall(name: "f", arguments: "{}")
        )
        let original = ChatMessage(
            role: "assistant", content: nil, name: nil, toolCallId: nil, toolCalls: [toolCall]
        )
        let data = try encode(original)
        let decoded = try decode(ChatMessage.self, data)
        XCTAssertEqual(decoded, original)
        XCTAssertNil(decoded.content)
        XCTAssertEqual(decoded.toolCalls?.count, 1)
    }

    func testChatMessageJSONUsesSnakeCaseToolCallId() throws {
        let m = ChatMessage(
            role: "tool", content: "result", name: nil, toolCallId: "call_xyz", toolCalls: nil
        )
        let json = try JSONSerialization.jsonObject(with: try encode(m)) as? [String: Any]
        XCTAssertNotNil(json?["tool_call_id"], "Expected snake_case 'tool_call_id' key in JSON")
        XCTAssertNil(json?["toolCallId"], "Swift property name must NOT leak to JSON")
        XCTAssertEqual(json?["tool_call_id"] as? String, "call_xyz")
    }

    func testChatMessageAllRolesAccepted() throws {
        for role in ["system", "user", "assistant", "tool"] {
            let m = ChatMessage(role: role, content: "x", name: nil, toolCallId: nil, toolCalls: nil)
            let data = try encode(m)
            let decoded = try decode(ChatMessage.self, data)
            XCTAssertEqual(decoded.role, role)
        }
    }

    // MARK: - ChatCompletionRequest

    func testChatCompletionRequestSnakeCaseRoundTrip() throws {
        let req = ChatCompletionRequest(
            model: "doubao-seed-1-6-250615",
            messages: [ChatMessage(role: "user", content: "hi", name: nil, toolCallId: nil, toolCalls: nil)],
            stream: false,
            temperature: 0.7,
            topP: 0.9,
            maxTokens: 256,
            stop: nil, tools: nil, toolChoice: nil, responseFormat: nil
        )
        let data = try encode(req)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        XCTAssertEqual(json?["top_p"] as? Double, 0.9, "Must serialize as snake_case top_p, not topP")
        XCTAssertEqual(json?["max_tokens"] as? Int, 256)
        XCTAssertNil(json?["topP"], "camelCase property must NOT leak to JSON")
        XCTAssertNil(json?["maxTokens"], "camelCase property must NOT leak to JSON")
        let decoded = try decode(ChatCompletionRequest.self, data)
        XCTAssertEqual(decoded, req)
    }

    func testCanonicalFixtureDecodes() throws {
        // Parity fixture used by both Swift + JS sides (same JSON decoded independently).
        let json = """
        {
          "model": "doubao-seed-1-6-250615",
          "messages": [{"role":"system","content":"You are a helper"},{"role":"user","content":"hi"}],
          "stream": false,
          "temperature": 0.7,
          "top_p": 0.9,
          "max_tokens": 100
        }
        """
        let req = try decode(ChatCompletionRequest.self, Data(json.utf8))
        XCTAssertEqual(req.model, "doubao-seed-1-6-250615")
        XCTAssertEqual(req.messages.count, 2)
        XCTAssertEqual(req.messages[0].role, "system")
        XCTAssertEqual(req.messages[1].content, "hi")
        XCTAssertEqual(req.topP, 0.9)
        XCTAssertEqual(req.maxTokens, 100)
    }

    // MARK: - ToolChoiceCodable

    func testToolChoiceAutoRoundTrip() throws {
        let original = ToolChoiceCodable.auto
        let data = try encode(original)
        let jsonString = String(data: data, encoding: .utf8)
        XCTAssertEqual(jsonString, "\"auto\"")
        let decoded = try decode(ToolChoiceCodable.self, data)
        XCTAssertEqual(decoded, .auto)
    }

    func testToolChoiceNoneRoundTrip() throws {
        let original = ToolChoiceCodable.none
        let data = try encode(original)
        let jsonString = String(data: data, encoding: .utf8)
        XCTAssertEqual(jsonString, "\"none\"")
        let decoded = try decode(ToolChoiceCodable.self, data)
        XCTAssertEqual(decoded, .none)
    }

    func testToolChoiceFunctionRoundTrip() throws {
        let original = ToolChoiceCodable.function(name: "search")
        let data = try encode(original)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        XCTAssertEqual(json?["type"] as? String, "function")
        let functionDict = json?["function"] as? [String: Any]
        XCTAssertEqual(functionDict?["name"] as? String, "search")
        let decoded = try decode(ToolChoiceCodable.self, data)
        XCTAssertEqual(decoded, .function(name: "search"))
    }

    // MARK: - ChatChunk (SSE)

    func testChatChunkSSERoundTrip() throws {
        let chunk = ChatChunk(
            id: "abc",
            choices: [ChatChunkChoice(
                index: 0,
                delta: ChatChunkDelta(role: nil, content: "Hello", toolCalls: nil),
                finishReason: nil
            )],
            usage: nil
        )
        let data = try encode(chunk)
        let decoded = try decode(ChatChunk.self, data)
        XCTAssertEqual(decoded, chunk)
        XCTAssertEqual(decoded.choices[0].delta.content, "Hello")
    }

    func testChatChunkUsageOptional() throws {
        let json = """
        {"id":"x","choices":[{"index":0,"delta":{"content":"y"}}]}
        """
        let chunk = try decode(ChatChunk.self, Data(json.utf8))
        XCTAssertNil(chunk.usage)
        XCTAssertEqual(chunk.choices[0].delta.content, "y")
    }

    func testChatChunkFinishReasonSnakeCase() throws {
        let choice = ChatChunkChoice(
            index: 0,
            delta: ChatChunkDelta(role: nil, content: nil, toolCalls: nil),
            finishReason: "stop"
        )
        let chunk = ChatChunk(id: "z", choices: [choice], usage: nil)
        let data = try encode(chunk)
        let jsonObj = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let choices = jsonObj?["choices"] as? [[String: Any]]
        XCTAssertNotNil(choices?[0]["finish_reason"], "Must use snake_case finish_reason in JSON")
        XCTAssertNil(choices?[0]["finishReason"], "camelCase finishReason must NOT leak to JSON")
    }

    // MARK: - ChatCompletionResponse

    func testChatCompletionResponseUsageRoundTrip() throws {
        let resp = ChatCompletionResponse(
            id: "id1",
            object: "chat.completion",
            created: 1700000000,
            model: "doubao-seed-1-6-250615",
            choices: [ChatChoice(
                index: 0,
                message: ChatMessage(
                    role: "assistant", content: "ok", name: nil, toolCallId: nil, toolCalls: nil
                ),
                finishReason: "stop"
            )],
            usage: Usage(promptTokens: 10, completionTokens: 5, totalTokens: 15)
        )
        let data = try encode(resp)
        let jsonObj = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let usageDict = jsonObj?["usage"] as? [String: Any]
        XCTAssertEqual(usageDict?["total_tokens"] as? Int, 15)
        XCTAssertNotNil(usageDict?["prompt_tokens"], "Must use snake_case prompt_tokens")
        XCTAssertNil(usageDict?["promptTokens"], "camelCase must NOT leak to JSON")
        let decoded = try decode(ChatCompletionResponse.self, data)
        XCTAssertEqual(decoded, resp)
        XCTAssertEqual(decoded.usage?.totalTokens, 15)
    }

    // MARK: - ToolCallDelta (SSE partial)

    func testToolCallDeltaAllFieldsOptional() throws {
        let emptyJson = "{}"
        let empty = try decode(ToolCallDelta.self, Data(emptyJson.utf8))
        XCTAssertNil(empty.index)
        XCTAssertNil(empty.id)
        XCTAssertNil(empty.type)
        XCTAssertNil(empty.function)
    }

    func testToolCallDeltaPartialRoundTrip() throws {
        let partial = ToolCallDelta(
            index: 0,
            id: "call_abc",
            type: "function",
            function: ToolCallDelta.FunctionDelta(name: "f", arguments: nil)
        )
        let data = try encode(partial)
        let decoded = try decode(ToolCallDelta.self, data)
        XCTAssertEqual(decoded, partial)
        XCTAssertEqual(decoded.id, "call_abc")
        XCTAssertNil(decoded.function?.arguments)
    }

    // MARK: - ToolCall (full)

    func testToolCallRoundTrip() throws {
        let toolCall = ToolCall(
            id: "call_123",
            type: "function",
            function: ToolCall.FunctionCall(name: "search", arguments: "{\"q\":\"pizza\"}")
        )
        let data = try encode(toolCall)
        let decoded = try decode(ToolCall.self, data)
        XCTAssertEqual(decoded, toolCall)
        XCTAssertEqual(decoded.function.arguments, "{\"q\":\"pizza\"}")
    }
}
