import Foundation

// §B9 dual-end contract: Swift Codable + JS Zod schemas updated in the same commit.
// §C / §A0.4: This file has NO Keychain access, NO network calls — pure type layer.
// AnyCodable is defined in BridgeMessage.swift and shared across the same compilation target.

// MARK: - ToolCall (referenced by ChatMessage)

struct ToolCall: Codable, Equatable {
    let id: String
    let type: String  // "function"
    let function: FunctionCall

    struct FunctionCall: Codable, Equatable {
        let name: String
        let arguments: String  // JSON-encoded args string per OpenAI compat
    }
}

// MARK: - ChatMessage

struct ChatMessage: Codable, Equatable {
    let role: String  // "system" / "user" / "assistant" / "tool"
    let content: String?  // nullable: assistant tool-call leg may have null content
    let name: String?
    let toolCallId: String?
    let toolCalls: [ToolCall]?

    enum CodingKeys: String, CodingKey {
        case role, content, name
        case toolCallId = "tool_call_id"
        case toolCalls = "tool_calls"
    }
}

// MARK: - ResponseFormat

struct ResponseFormat: Codable, Equatable {
    let type: String  // "text" / "json_object"
}

// MARK: - ToolDef

struct ToolDef: Codable, Equatable {
    let type: String  // "function"
    let function: FunctionDef

    struct FunctionDef: Codable, Equatable {
        let name: String
        let description: String?
        let parameters: AnyCodable  // JSONSchema; AnyCodable from BridgeMessage.swift

        static func == (lhs: ToolDef.FunctionDef, rhs: ToolDef.FunctionDef) -> Bool {
            guard lhs.name == rhs.name, lhs.description == rhs.description else { return false }
            // AnyCodable.value is Any — compare via JSON round-trip
            guard let lData = try? JSONEncoder().encode(lhs.parameters),
                  let rData = try? JSONEncoder().encode(rhs.parameters) else { return false }
            return lData == rData
        }
    }
}

// MARK: - ToolChoiceCodable

/// "auto" / "none" string OR explicit function selection: { type: "function", function: { name } }
enum ToolChoiceCodable: Codable, Equatable {
    case auto
    case none
    case function(name: String)

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let s = try? c.decode(String.self) {
            switch s {
            case "auto": self = .auto
            case "none": self = .none
            default:
                throw DecodingError.dataCorruptedError(
                    in: c, debugDescription: "unrecognized tool_choice string '\(s)'"
                )
            }
            return
        }
        // Object form: {"type": "function", "function": {"name": "..."}}
        struct Outer: Decodable { let type: String; let function: Inner }
        struct Inner: Decodable { let name: String }
        let outer = try Outer(from: decoder)
        guard outer.type == "function" else {
            throw DecodingError.dataCorruptedError(
                in: c, debugDescription: "tool_choice.type must be 'function'"
            )
        }
        self = .function(name: outer.function.name)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .auto: try c.encode("auto")
        case .none: try c.encode("none")
        case .function(let name):
            struct Outer: Encodable {
                let type = "function"
                let function: Inner
            }
            struct Inner: Encodable { let name: String }
            try c.encode(Outer(function: Inner(name: name)))
        }
    }
}

// MARK: - ChatCompletionRequest

struct ChatCompletionRequest: Codable, Equatable {
    let model: String
    let messages: [ChatMessage]
    let stream: Bool
    let temperature: Double?
    let topP: Double?
    let maxTokens: Int?
    let stop: [String]?
    let tools: [ToolDef]?
    let toolChoice: ToolChoiceCodable?
    let responseFormat: ResponseFormat?

    enum CodingKeys: String, CodingKey {
        case model, messages, stream, temperature, stop, tools
        case topP = "top_p"
        case maxTokens = "max_tokens"
        case toolChoice = "tool_choice"
        case responseFormat = "response_format"
    }
}

// MARK: - Usage

struct Usage: Codable, Equatable {
    let promptTokens: Int
    let completionTokens: Int
    let totalTokens: Int

    enum CodingKeys: String, CodingKey {
        case promptTokens = "prompt_tokens"
        case completionTokens = "completion_tokens"
        case totalTokens = "total_tokens"
    }
}

// MARK: - ChatChoice

struct ChatChoice: Codable, Equatable {
    let index: Int
    let message: ChatMessage
    let finishReason: String?

    enum CodingKeys: String, CodingKey {
        case index, message
        case finishReason = "finish_reason"
    }
}

// MARK: - ChatCompletionResponse

struct ChatCompletionResponse: Codable, Equatable {
    let id: String
    let object: String
    let created: Int
    let model: String
    let choices: [ChatChoice]
    let usage: Usage?
}

// MARK: - SSE chunk types

struct ToolCallDelta: Codable, Equatable {
    let index: Int?
    let id: String?
    let type: String?
    let function: FunctionDelta?

    struct FunctionDelta: Codable, Equatable {
        let name: String?
        let arguments: String?
    }
}

struct ChatChunkDelta: Codable, Equatable {
    let role: String?
    let content: String?
    let toolCalls: [ToolCallDelta]?

    enum CodingKeys: String, CodingKey {
        case role, content
        case toolCalls = "tool_calls"
    }
}

struct ChatChunkChoice: Codable, Equatable {
    let index: Int
    let delta: ChatChunkDelta
    let finishReason: String?

    enum CodingKeys: String, CodingKey {
        case index, delta
        case finishReason = "finish_reason"
    }
}

struct ChatChunk: Codable, Equatable {
    let id: String
    let choices: [ChatChunkChoice]
    let usage: Usage?
}
