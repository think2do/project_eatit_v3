import Foundation

// §B9: Swift Codable schema mirrors JS Zod schema — both must be updated in the same commit.
// §C3: handlers MUST NOT return secret material in response.data.
// KeychainService (M2.2) returns { exists: bool }, never the secret itself.

// MARK: - AnyCodable

/// Wraps arbitrary JSON-compatible values for use in Codable contexts.
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) { self.value = value }

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { value = NSNull() }
        else if let v = try? c.decode(Bool.self) { value = v }
        else if let v = try? c.decode(Int.self) { value = v }
        else if let v = try? c.decode(Double.self) { value = v }
        else if let v = try? c.decode(String.self) { value = v }
        else if let v = try? c.decode([AnyCodable].self) { value = v.map(\.value) }
        else if let v = try? c.decode([String: AnyCodable].self) {
            value = v.mapValues(\.value)
        } else {
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "Unsupported type")
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch value {
        case is NSNull: try c.encodeNil()
        case let v as Bool: try c.encode(v)
        case let v as Int: try c.encode(v)
        case let v as Double: try c.encode(v)
        case let v as String: try c.encode(v)
        case let v as [Any]: try c.encode(v.map(AnyCodable.init))
        case let v as [String: Any]: try c.encode(v.mapValues(AnyCodable.init))
        default:
            throw EncodingError.invalidValue(
                value,
                EncodingError.Context(
                    codingPath: encoder.codingPath,
                    debugDescription: "Unsupported value: \(type(of: value))"
                )
            )
        }
    }
}

// MARK: - BridgeRequest

/// JSON shape: { "id": "uuid-v4", "method": "namespace.action", "params": { ... } }
struct BridgeRequest: Codable {
    let id: String
    let method: String
    let params: AnyCodable  // router decodes this into concrete ParamsType per method
}

// MARK: - BridgeResponse

/// Discriminated union on `ok`.
/// Success shape:  { "id": "uuid-v4", "ok": true,  "data":  { ... } }
/// Failure shape:  { "id": "uuid-v4", "ok": false, "error": { "code": "...", "message": "..." } }
enum BridgeResponse: Codable {
    case success(id: String, data: AnyCodable)
    case failure(id: String, error: BridgeError)

    private enum CodingKeys: String, CodingKey { case id, ok, data, error }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let id = try c.decode(String.self, forKey: .id)
        let ok = try c.decode(Bool.self, forKey: .ok)
        if ok {
            let data = try c.decodeIfPresent(AnyCodable.self, forKey: .data) ?? AnyCodable(NSNull())
            self = .success(id: id, data: data)
        } else {
            let error = try c.decode(BridgeError.self, forKey: .error)
            self = .failure(id: id, error: error)
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .success(let id, let data):
            try c.encode(id, forKey: .id)
            try c.encode(true, forKey: .ok)
            try c.encode(data, forKey: .data)
        case .failure(let id, let error):
            try c.encode(id, forKey: .id)
            try c.encode(false, forKey: .ok)
            try c.encode(error, forKey: .error)
        }
    }
}

// MARK: - BridgeEvent

/// Pushed from Swift → JS via evaluateJavaScript("window.eatitBridge.dispatch(...)").
/// JSON shape: { "type": "stream-chunk"|"asr-partial"|"asr-final"|"asr-end",
///              "streamId": "uuid-v4", "payload": { ... } }
struct BridgeEvent: Codable {
    let type: String      // "stream-chunk" | "asr-partial" | "asr-final" | "asr-end"
    let streamId: String
    let payload: AnyCodable
}
