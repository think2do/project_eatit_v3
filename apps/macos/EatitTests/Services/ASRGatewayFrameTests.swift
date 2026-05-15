import XCTest
@testable import Eatit

// ASRGatewayFrame unit tests for Doubao Seed ASR 2.0 wire format.
// Wire form for both client send + server receive:
//   [4-byte header][optional 4-byte BE u32 sequence (server)][4-byte BE u32 size][payload]
// All test frames are constructed manually as byte literals or via pack functions.
// Zero network dependency.

final class ASRGatewayFrameTests: XCTestCase {

    // MARK: - Fixtures

    private func defaultAudioConfig() -> ASRAudioConfig {
        ASRAudioConfig(format: "pcm", codec: "raw", rate: 16000, bits: 16, channel: 1)
    }

    private func defaultRequestConfig() -> ASRRequestConfig {
        ASRRequestConfig(
            modelName: "bigmodel",
            enableITN: true,
            enablePunc: true,
            enableDDC: false,
            enableNonstream: false,
            resultType: "full",
            showUtterances: true
        )
    }

    private func defaultUserConfig() -> ASRUserConfig {
        ASRUserConfig(uid: "eatit-test")
    }

    private func defaultConfigPayload() -> ASRConfigPayload {
        ASRConfigPayload(
            user: defaultUserConfig(),
            audio: defaultAudioConfig(),
            request: defaultRequestConfig()
        )
    }

    // MARK: - packFirstFrame (Seed ASR 2.0 wire: header + u32 BE size + JSON)

    func testPackFirstFrame_HappyPath() throws {
        let data = try packFirstFrame(config: defaultConfigPayload())

        // 4-byte header
        XCTAssertGreaterThanOrEqual(data.count, 8)
        XCTAssertEqual(data[0], 0x11, "byte[0]: ver=1 | hdrSize=1")
        XCTAssertEqual(data[1], 0x10, "byte[1]: msgType=0x1 (full client request) | flags=0x0")
        XCTAssertEqual(data[2], 0x10, "byte[2]: ser=JSON(0x1) | comp=none(0x0) = 0x10")
        XCTAssertEqual(data[3], 0x00, "byte[3]: reserved")

        // 4-byte BE u32 payload size, followed by raw JSON bytes
        let sizeBE = (UInt32(data[4]) << 24) | (UInt32(data[5]) << 16)
                   | (UInt32(data[6]) << 8)  |  UInt32(data[7])
        XCTAssertEqual(Int(sizeBE), data.count - 8, "u32 BE size must match remaining bytes")

        // Payload (after 4 header + 4 size = 8 bytes) decodes back to ASRConfigPayload
        let jsonData = data.subdata(in: 8..<data.count)
        let decoded = try JSONDecoder().decode(ASRConfigPayload.self, from: jsonData)
        XCTAssertEqual(decoded.user.uid, "eatit-test")
        XCTAssertEqual(decoded.audio.format, "pcm")
        XCTAssertEqual(decoded.audio.rate, 16000)
        XCTAssertEqual(decoded.audio.bits, 16)
        XCTAssertEqual(decoded.audio.channel, 1)
        XCTAssertEqual(decoded.audio.codec, "raw")
        XCTAssertEqual(decoded.request.modelName, "bigmodel")
        XCTAssertTrue(decoded.request.enableITN)
        XCTAssertTrue(decoded.request.enablePunc)
        XCTAssertFalse(decoded.request.enableDDC)
        XCTAssertFalse(decoded.request.enableNonstream)
        XCTAssertEqual(decoded.request.resultType, "full")
        XCTAssertTrue(decoded.request.showUtterances)
    }

    // MARK: - packAudioFrame
    // Wire form: [4-byte header][4-byte BE u32 size][PCM bytes].

    func testPackAudioFrame_6400Bytes_HeaderBytesCorrect() {
        let pcm = Data(repeating: 0xAB, count: 6400)
        let data = packAudioFrame(pcmChunk: pcm, last: false)

        XCTAssertEqual(data.count, 4 + 4 + 6400, "header(4) + size prefix(4) + PCM(6400)")
        XCTAssertEqual(data[0], 0x11, "byte[0]: ver=1 | hdrSize=1")
        XCTAssertEqual(data[1], 0x20, "byte[1]: msgType=0x2 | flags=0x0")
        XCTAssertEqual(data[2], 0x00, "byte[2]: ser=none | comp=none")
        XCTAssertEqual(data[3], 0x00, "byte[3]: reserved")

        // u32 BE size prefix at bytes 4..8 must equal 6400
        let sizeBE = (UInt32(data[4]) << 24) | (UInt32(data[5]) << 16)
                   | (UInt32(data[6]) << 8)  |  UInt32(data[7])
        XCTAssertEqual(sizeBE, 6400)

        // PCM payload preserved byte-for-byte after the size prefix
        let payload = data.subdata(in: 8..<data.count)
        XCTAssertEqual(payload, pcm)
    }

    func testPackAudioFrame_LastFlag_FlagsIs0x2() {
        // last=true with empty PCM is allowed (terminator frame)
        let pcm = Data()
        let data = packAudioFrame(pcmChunk: pcm, last: true)

        XCTAssertEqual(data[1], 0x22, "byte[1]: msgType=0x2 | flags=0x2 (last-packet)")
        // Even an empty terminator carries the 4-byte size prefix (= 0).
        XCTAssertEqual(data.count, 8)
    }

    func testPackAudioFrame_LastFlag_WithFullChunk() {
        let pcm = Data(repeating: 0xFF, count: 6400)
        let data = packAudioFrame(pcmChunk: pcm, last: true)

        XCTAssertEqual(data[1], 0x22)
        XCTAssertEqual(data.count, 4 + 4 + 6400)
    }

    // MARK: - unpackResponseFrame: server-full-response
    // Server frames also carry a u32 BE size between header and payload.

    func testUnpackResponseFrame_ServerFullResponse_PartialUtterance() throws {
        let json = """
        {"result":{"utterances":[{"text":"hello","definite":false}],"text":null}}
        """
        let data = makeFullResponseFrame(jsonString: json)
        let response = try unpackResponseFrame(data: data)
        guard case .result(let payload) = response else {
            XCTFail("expected .result"); return
        }
        let utterances = payload.result?.utterances ?? []
        XCTAssertEqual(utterances.count, 1)
        XCTAssertEqual(utterances[0].text, "hello")
        XCTAssertEqual(utterances[0].definite, false)
    }

    func testUnpackResponseFrame_ServerFullResponse_FinalUtterance() throws {
        let json = """
        {"result":{"utterances":[{"text":"world","definite":true,"start_time":100,"end_time":500}]}}
        """
        let data = makeFullResponseFrame(jsonString: json)
        let response = try unpackResponseFrame(data: data)
        guard case .result(let payload) = response else {
            XCTFail("expected .result"); return
        }
        let utterances = payload.result?.utterances ?? []
        let utt = utterances[0]
        XCTAssertEqual(utt.definite, true)
        XCTAssertEqual(utt.startTime, 100)
        XCTAssertEqual(utt.endTime, 500)
    }

    // MARK: - unpackResponseFrame: server-error-response
    // Body is binary `[u32 BE code][u32 BE msg_size][UTF-8 bytes]` — NOT JSON.

    func testUnpackResponseFrame_ServerErrorResponse_HappyPath() throws {
        let data = makeErrorFrame(code: 4001, message: "authentication failed")
        let response = try unpackResponseFrame(data: data)
        guard case .serverError(let env) = response else {
            XCTFail("expected .serverError"); return
        }
        XCTAssertEqual(env.code, 4001)
        XCTAssertEqual(env.message, "authentication failed")
    }

    func testUnpackResponseFrame_ServerErrorResponse_UnicodeMessage() throws {
        let data = makeErrorFrame(code: 4003, message: "鉴权失败:resource_id 错误")
        let response = try unpackResponseFrame(data: data)
        guard case .serverError(let env) = response else {
            XCTFail("expected .serverError"); return
        }
        XCTAssertEqual(env.code, 4003)
        XCTAssertEqual(env.message, "鉴权失败:resource_id 错误")
    }

    // MARK: - unpackResponseFrame: error paths

    func testUnpackResponseFrame_HeaderTooShort() {
        let data = Data([0x11, 0x90, 0x11])  // only 3 bytes
        XCTAssertThrowsError(try unpackResponseFrame(data: data)) { error in
            XCTAssertEqual(error as? ASRFrameError, ASRFrameError.headerTooShort)
        }
    }

    func testUnpackResponseFrame_UnknownMessageType() {
        // msgType 0x5 is not defined
        let data = makeFullResponseFrame(jsonString: "{}", msgTypeByte: 0x50)
        XCTAssertThrowsError(try unpackResponseFrame(data: data)) { error in
            XCTAssertEqual(error as? ASRFrameError, ASRFrameError.unknownMessageType(0x5))
        }
    }

    func testUnpackResponseFrame_PayloadDecodeFailed() {
        // Valid header (server-full-response) but payload is not decodable JSON
        let data = makeFullResponseFrame(jsonString: "not valid json")
        XCTAssertThrowsError(try unpackResponseFrame(data: data)) { error in
            guard case ASRFrameError.payloadDecodeFailed = error else {
                XCTFail("expected payloadDecodeFailed, got \(error)"); return
            }
        }
    }

    // MARK: - unpackResponseFrame: gzip payload (server-side only)

    func testUnpackResponseFrame_GzipPayload_DecompressesCorrectly() throws {
        let json = """
        {"result":{"utterances":[{"text":"gzip test","definite":true}]}}
        """
        let jsonData = json.data(using: .utf8)!
        let compressed = try (jsonData as NSData).compressed(using: .zlib) as Data

        // Header byte[2]=0x11 (JSON+gzip flag)
        var frame = Data([0x11, 0x90, 0x11, 0x00])
        frame.append(beU32(UInt32(compressed.count)))
        frame.append(compressed)

        let response = try unpackResponseFrame(data: frame)
        guard case .result(let payload) = response else {
            XCTFail("expected .result"); return
        }
        let utterances = payload.result?.utterances ?? []
        XCTAssertEqual(utterances[0].text, "gzip test")
        XCTAssertEqual(utterances[0].definite, true)
    }

    // MARK: - CodingKey snake_case round-trips

    func testCodableSnakeCaseRoundTrip_ASRRequestConfig() throws {
        let config = ASRRequestConfig(
            modelName: "bigmodel",
            enableITN: true,
            enablePunc: false,
            enableDDC: false,
            enableNonstream: false,
            resultType: "full",
            showUtterances: true
        )
        let data = try JSONEncoder().encode(config)
        let jsonString = String(data: data, encoding: .utf8)!

        XCTAssertTrue(jsonString.contains("\"model_name\""))
        XCTAssertTrue(jsonString.contains("\"enable_itn\""))
        XCTAssertTrue(jsonString.contains("\"enable_punc\""))
        XCTAssertTrue(jsonString.contains("\"enable_ddc\""))
        XCTAssertTrue(jsonString.contains("\"enable_nonstream\""))
        XCTAssertTrue(jsonString.contains("\"result_type\""))
        XCTAssertTrue(jsonString.contains("\"show_utterances\""))

        let decoded = try JSONDecoder().decode(ASRRequestConfig.self, from: data)
        XCTAssertEqual(decoded.modelName, "bigmodel")
        XCTAssertTrue(decoded.enableITN)
        XCTAssertFalse(decoded.enablePunc)
        XCTAssertFalse(decoded.enableDDC)
        XCTAssertFalse(decoded.enableNonstream)
        XCTAssertEqual(decoded.resultType, "full")
        XCTAssertTrue(decoded.showUtterances)
    }

    func testCodableSnakeCaseRoundTrip_ASRUtterance() throws {
        let utt = ASRUtterance(text: "hello world", definite: true, startTime: 200, endTime: 800)
        let data = try JSONEncoder().encode(utt)
        let jsonString = String(data: data, encoding: .utf8)!

        XCTAssertTrue(jsonString.contains("\"start_time\""))
        XCTAssertTrue(jsonString.contains("\"end_time\""))

        let decoded = try JSONDecoder().decode(ASRUtterance.self, from: data)
        XCTAssertEqual(decoded.text, "hello world")
        XCTAssertEqual(decoded.definite, true)
        XCTAssertEqual(decoded.startTime, 200)
        XCTAssertEqual(decoded.endTime, 800)
    }

    func testASRServerErrorEnvelope_Codable() throws {
        let json = """
        {"code":5000,"message":"internal server error"}
        """
        let envelope = try JSONDecoder().decode(ASRServerErrorEnvelope.self, from: json.data(using: .utf8)!)
        XCTAssertEqual(envelope.code, 5000)
        XCTAssertEqual(envelope.message, "internal server error")
    }
}

// MARK: - Test helpers

/// Build a server-full-response frame: header(4) + u32 BE size(4) + UTF-8 JSON.
/// `msgTypeByte` defaults to 0x90 (server-full-response, flags=0).
private func makeFullResponseFrame(jsonString: String, msgTypeByte: UInt8 = 0x90) -> Data {
    let payload = jsonString.data(using: .utf8) ?? Data()
    var frame = Data([0x11, msgTypeByte, 0x10, 0x00])
    frame.append(beU32(UInt32(payload.count)))
    frame.append(payload)
    return frame
}

/// Build a server-error-response (msgType=0xF) frame. Body: u32 BE code + u32 BE
/// msg_size + UTF-8 message bytes.  Header byte[2] is 0x00 (no serialization, no
/// compression) — error frames are length-prefixed binary, not JSON.
private func makeErrorFrame(code: UInt32, message: String) -> Data {
    let msgBytes = message.data(using: .utf8) ?? Data()
    var frame = Data([0x11, 0xF0, 0x00, 0x00])
    frame.append(beU32(code))
    frame.append(beU32(UInt32(msgBytes.count)))
    frame.append(msgBytes)
    return frame
}

private func beU32(_ value: UInt32) -> Data {
    var out = Data(count: 4)
    out[0] = UInt8((value >> 24) & 0xFF)
    out[1] = UInt8((value >> 16) & 0xFF)
    out[2] = UInt8((value >> 8) & 0xFF)
    out[3] = UInt8(value & 0xFF)
    return out
}
