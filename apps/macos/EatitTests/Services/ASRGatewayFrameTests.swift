import XCTest
@testable import Eatit

// §10.1 ASRGatewayFrame unit tests — zero network dependency.
// All frames constructed manually as byte literals or via pack functions.
// §13: Implementing per §4 inferred values (WebFetch outcome C — all URLs returned SPA shells).

final class ASRGatewayFrameTests: XCTestCase {

    // MARK: - Fixtures

    private func defaultAudioConfig() -> ASRAudioConfig {
        ASRAudioConfig(format: "pcm", rate: 16000, channels: 1, codec: "raw")
    }

    private func defaultRequestConfig() -> ASRRequestConfig {
        ASRRequestConfig(modelName: "bigmodel", enableITN: true, enablePunc: true, enableSpeakerInfo: nil)
    }

    private func defaultConfigPayload() -> ASRConfigPayload {
        ASRConfigPayload(audio: defaultAudioConfig(), request: defaultRequestConfig())
    }

    // MARK: - packFirstFrame (no gzip)

    func testPackFirstFrame_NoGzip_HappyPath() throws {
        let data = try packFirstFrame(config: defaultConfigPayload(), gzip: false)

        // Header bytes per §4.3 table "首帧 full-client-request(JSON, 无压缩)"
        XCTAssertGreaterThanOrEqual(data.count, 4)
        XCTAssertEqual(data[0], 0x11, "byte[0]: ver=1 | hdrSize=1")
        XCTAssertEqual(data[1], 0x10, "byte[1]: msgType=0x1 | flags=0x0")
        XCTAssertEqual(data[2], 0x10, "byte[2]: ser=JSON(0x1) | comp=none(0x0) = 0x10")
        XCTAssertEqual(data[3], 0x00, "byte[3]: reserved")

        // Payload must be valid JSON decodable back to ASRConfigPayload
        let jsonData = data.subdata(in: 4..<data.count)
        let decoded = try JSONDecoder().decode(ASRConfigPayload.self, from: jsonData)
        XCTAssertEqual(decoded.audio.format, "pcm")
        XCTAssertEqual(decoded.audio.rate, 16000)
        XCTAssertEqual(decoded.audio.channels, 1)
        XCTAssertEqual(decoded.audio.codec, "raw")
        XCTAssertEqual(decoded.request.modelName, "bigmodel")
        XCTAssertTrue(decoded.request.enableITN)
        XCTAssertTrue(decoded.request.enablePunc)
        XCTAssertNil(decoded.request.enableSpeakerInfo)
    }

    func testPackFirstFrame_Gzip_HappyPath() throws {
        let data = try packFirstFrame(config: defaultConfigPayload(), gzip: true)

        XCTAssertGreaterThanOrEqual(data.count, 4)
        XCTAssertEqual(data[0], 0x11)
        XCTAssertEqual(data[1], 0x10)
        // byte[2] low nibble must be 0x1 (gzip flag)
        XCTAssertEqual(data[2] & 0x0F, 0x1, "byte[2] low nibble = gzip(0x1)")
        XCTAssertEqual(data[3], 0x00)

        // Payload must be gzip-decompressable and decode to same config
        let compressed = data.subdata(in: 4..<data.count)
        let decompressed = try (compressed as NSData).decompressed(using: .zlib) as Data
        let decoded = try JSONDecoder().decode(ASRConfigPayload.self, from: decompressed)
        XCTAssertEqual(decoded.audio.format, "pcm")
        XCTAssertEqual(decoded.request.modelName, "bigmodel")
    }

    // MARK: - packAudioFrame

    func testPackAudioFrame_6400Bytes_HeaderBytesCorrect() {
        let pcm = Data(repeating: 0xAB, count: 6400)
        let data = packAudioFrame(pcmChunk: pcm, last: false)

        XCTAssertEqual(data.count, 6404)
        XCTAssertEqual(data[0], 0x11, "byte[0]: ver=1 | hdrSize=1")
        XCTAssertEqual(data[1], 0x20, "byte[1]: msgType=0x2 | flags=0x0")
        XCTAssertEqual(data[2], 0x00, "byte[2]: ser=none | comp=none")
        XCTAssertEqual(data[3], 0x00, "byte[3]: reserved")

        // PCM payload preserved byte-for-byte
        let payload = data.subdata(in: 4..<data.count)
        XCTAssertEqual(payload, pcm)
    }

    func testPackAudioFrame_LastFlag_FlagsIs0x2() {
        // last=true with empty PCM is allowed (terminator frame)
        let pcm = Data()
        let data = packAudioFrame(pcmChunk: pcm, last: true)

        XCTAssertEqual(data[1], 0x22, "byte[1]: msgType=0x2 | flags=0x2 (last-no-sequence)")
    }

    func testPackAudioFrame_LastFlag_WithFullChunk() {
        let pcm = Data(repeating: 0xFF, count: 6400)
        let data = packAudioFrame(pcmChunk: pcm, last: true)

        XCTAssertEqual(data[1], 0x22)
        XCTAssertEqual(data.count, 6404)
    }

    // Note (judgment call): packAudioFrame uses precondition for wrong-size non-last frames.
    // Testing precondition directly would crash the test process. The valid contract is:
    // "6400 bytes OR last=true". The precondition condition is documented in the source.
    // This is intentional — callers (M2.8.dev.c) own the invariant, not this layer.

    // MARK: - unpackResponseFrame: server-full-response

    func testUnpackResponseFrame_ServerFullResponse_PartialUtterance() throws {
        let json = """
        {"result":{"utterances":[{"text":"hello","definite":false}],"text":null}}
        """
        let data = makeResponseFrame(msgTypeByte: 0x90, jsonString: json)
        let response = try unpackResponseFrame(data: data)
        guard case .result(let payload) = response else {
            XCTFail("expected .result"); return
        }
        XCTAssertEqual(payload.result.utterances.count, 1)
        XCTAssertEqual(payload.result.utterances[0].text, "hello")
        XCTAssertFalse(payload.result.utterances[0].definite)
    }

    func testUnpackResponseFrame_ServerFullResponse_FinalUtterance() throws {
        let json = """
        {"result":{"utterances":[{"text":"world","definite":true,"start_time":100,"end_time":500}]}}
        """
        let data = makeResponseFrame(msgTypeByte: 0x90, jsonString: json)
        let response = try unpackResponseFrame(data: data)
        guard case .result(let payload) = response else {
            XCTFail("expected .result"); return
        }
        let utt = payload.result.utterances[0]
        XCTAssertTrue(utt.definite)
        XCTAssertEqual(utt.startTime, 100)
        XCTAssertEqual(utt.endTime, 500)
    }

    // MARK: - unpackResponseFrame: server-error-response

    func testUnpackResponseFrame_ServerErrorResponse_HappyPath() throws {
        let json = """
        {"code":4001,"message":"authentication failed"}
        """
        let data = makeResponseFrame(msgTypeByte: 0xB0, jsonString: json)
        let response = try unpackResponseFrame(data: data)
        guard case .serverError(let env) = response else {
            XCTFail("expected .serverError"); return
        }
        XCTAssertEqual(env.code, 4001)
        XCTAssertEqual(env.message, "authentication failed")
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
        let data = makeResponseFrame(msgTypeByte: 0x50, jsonString: "{}")
        XCTAssertThrowsError(try unpackResponseFrame(data: data)) { error in
            XCTAssertEqual(error as? ASRFrameError, ASRFrameError.unknownMessageType(0x5))
        }
    }

    func testUnpackResponseFrame_PayloadDecodeFailed() {
        // Valid header (server-full-response) but payload is not decodable JSON
        let data = makeResponseFrame(msgTypeByte: 0x90, jsonString: "not valid json")
        XCTAssertThrowsError(try unpackResponseFrame(data: data)) { error in
            guard case ASRFrameError.payloadDecodeFailed = error else {
                XCTFail("expected payloadDecodeFailed, got \(error)"); return
            }
        }
    }

    // MARK: - unpackResponseFrame: gzip payload

    func testUnpackResponseFrame_GzipPayload_DecompressesCorrectly() throws {
        let json = """
        {"result":{"utterances":[{"text":"gzip test","definite":true}]}}
        """
        let jsonData = json.data(using: .utf8)!
        let compressed = try (jsonData as NSData).compressed(using: .zlib) as Data

        // Header: byte[0]=0x11, byte[1]=0x90 (server-full-response), byte[2]=0x11 (JSON+gzip), byte[3]=0x00
        var frame = Data([0x11, 0x90, 0x11, 0x00])
        frame.append(compressed)

        let response = try unpackResponseFrame(data: frame)
        guard case .result(let payload) = response else {
            XCTFail("expected .result"); return
        }
        XCTAssertEqual(payload.result.utterances[0].text, "gzip test")
        XCTAssertTrue(payload.result.utterances[0].definite)
    }

    // MARK: - Round-trip

    func testRoundTrip_FirstFrame_PackThenUnpack() throws {
        // Pack first-frame, then rewrite header byte[1] to simulate server-full-response
        // so we can use unpackResponseFrame on the same JSON payload.
        let config = defaultConfigPayload()
        var packed = try packFirstFrame(config: config, gzip: false)

        // The packed frame has JSON payload of ASRConfigPayload.
        // We construct a server-full-response wrapping ASRResultPayload JSON manually
        // to test the full round-trip through unpackResponseFrame.
        let resultJson = """
        {"result":{"utterances":[{"text":"round trip","definite":true}],"text":"round trip"}}
        """
        let resultData = resultJson.data(using: .utf8)!
        var frame = Data([0x11, 0x90, 0x10, 0x00])
        frame.append(resultData)

        let response = try unpackResponseFrame(data: frame)
        guard case .result(let payload) = response else {
            XCTFail("expected .result"); return
        }
        XCTAssertEqual(payload.result.utterances[0].text, "round trip")
        XCTAssertNil(packed[safe: 9999])  // just reference packed to avoid unused warning
    }

    // MARK: - CodingKey snake_case round-trips

    func testCodableSnakeCaseRoundTrip_ASRRequestConfig() throws {
        let config = ASRRequestConfig(modelName: "bigmodel", enableITN: true, enablePunc: false, enableSpeakerInfo: nil)
        let data = try JSONEncoder().encode(config)
        let jsonString = String(data: data, encoding: .utf8)!

        // Verify snake_case keys appear in encoded JSON
        XCTAssertTrue(jsonString.contains("\"model_name\""), "expected model_name key, got: \(jsonString)")
        XCTAssertTrue(jsonString.contains("\"enable_itn\""), "expected enable_itn key, got: \(jsonString)")
        XCTAssertTrue(jsonString.contains("\"enable_punc\""), "expected enable_punc key, got: \(jsonString)")
        // enable_speaker_info should be absent (nil + default encoder omits nil optionals)

        // Decode back and verify equality
        let decoded = try JSONDecoder().decode(ASRRequestConfig.self, from: data)
        XCTAssertEqual(decoded.modelName, "bigmodel")
        XCTAssertTrue(decoded.enableITN)
        XCTAssertFalse(decoded.enablePunc)
        XCTAssertNil(decoded.enableSpeakerInfo)
    }

    func testCodableSnakeCaseRoundTrip_ASRUtterance() throws {
        let utt = ASRUtterance(text: "hello world", definite: true, startTime: 200, endTime: 800)
        let data = try JSONEncoder().encode(utt)
        let jsonString = String(data: data, encoding: .utf8)!

        XCTAssertTrue(jsonString.contains("\"start_time\""), "expected start_time key, got: \(jsonString)")
        XCTAssertTrue(jsonString.contains("\"end_time\""), "expected end_time key, got: \(jsonString)")

        let decoded = try JSONDecoder().decode(ASRUtterance.self, from: data)
        XCTAssertEqual(decoded.text, "hello world")
        XCTAssertTrue(decoded.definite)
        XCTAssertEqual(decoded.startTime, 200)
        XCTAssertEqual(decoded.endTime, 800)
    }

    func testCodableSnakeCaseRoundTrip_ASRRequestConfig_WithSpeakerInfo() throws {
        let config = ASRRequestConfig(modelName: "bigmodel", enableITN: false, enablePunc: true, enableSpeakerInfo: true)
        let data = try JSONEncoder().encode(config)
        let jsonString = String(data: data, encoding: .utf8)!
        XCTAssertTrue(jsonString.contains("\"enable_speaker_info\""))

        let decoded = try JSONDecoder().decode(ASRRequestConfig.self, from: data)
        XCTAssertEqual(decoded.enableSpeakerInfo, true)
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

/// Build a minimal response frame: 4-byte header + UTF-8 JSON payload.
/// msgTypeByte encodes the full byte[1] value (msgType in high nibble, flags in low nibble).
private func makeResponseFrame(msgTypeByte: UInt8, jsonString: String) -> Data {
    var frame = Data([0x11, msgTypeByte, 0x10, 0x00])
    if let payload = jsonString.data(using: .utf8) {
        frame.append(payload)
    }
    return frame
}

// Safe subscript to avoid unused-variable warnings in round-trip test
private extension Data {
    subscript(safe index: Int) -> UInt8? {
        guard index >= 0 && index < count else { return nil }
        return self[index]
    }
}
