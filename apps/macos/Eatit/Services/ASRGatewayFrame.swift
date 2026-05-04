import Foundation

// Pure function module: SAUC bigmodel binary WebSocket frame pack/unpack.
// Zero network dependency — WS connect is M2.8.dev.b.
// §4.3 byte layout: 4-byte custom header (big-endian).
// gzip via Foundation NSData.compressed(.zlib) — zero SPM dependency (macOS 11+).

// MARK: - Protocol enums

enum ASRMessageType: UInt8 {
    case fullClientRequest = 0x1
    case clientAudioOnlyRequest = 0x2
    case serverFullResponse = 0x9
    case serverErrorResponse = 0xB
}

enum ASRSerialization: UInt8 {
    case none = 0x0
    case json = 0x1
}

enum ASRCompression: UInt8 {
    case none = 0x0
    case gzip = 0x1
}

// MARK: - Frame header helper (for tests + internal use)

struct ASRFrameHeader {
    let version: UInt8        // high 4 bits of byte[0]; locked 0x1
    let headerSize: UInt8     // low 4 bits of byte[0]; locked 0x1 (= 4 bytes)
    let messageType: ASRMessageType
    let flags: UInt8          // low 4 bits of byte[1]
    let serialization: ASRSerialization
    let compression: ASRCompression
    // byte[3] reserved, always 0x00
}

// MARK: - Typed errors

enum ASRFrameError: Error, Equatable {
    case headerTooShort
    case unknownMessageType(UInt8)
    case unknownSerialization(UInt8)
    case unknownCompression(UInt8)
    case payloadDecodeFailed(String)
    case gzipFailed(String)
}

// MARK: - Response discriminated union

enum ASRResponse {
    case result(ASRResultPayload)
    case serverError(ASRServerErrorEnvelope)
}

// MARK: - Frame packing

/// Pack first frame: full-client-request (msgType=0x1) with JSON config payload.
/// gzip=false by default; payload is ~150 bytes, compression overhead > benefit.
/// Header layout per §4.3:
///   byte[0] = 0x11  (ver=1 | hdrSize=1)
///   byte[1] = 0x10  (msgType=0x1 | flags=0x0)
///   byte[2] = 0x11 if gzip else 0x10  (ser=JSON | comp=gzip/none)
///   byte[3] = 0x00  (reserved)
func packFirstFrame(config: ASRConfigPayload, gzip: Bool = false) throws -> Data {
    var payload = try JSONEncoder().encode(config)
    if gzip {
        payload = try gzipCompress(payload)
    }
    var header = Data(count: 4)
    header[0] = (0x1 << 4) | 0x1
    header[1] = (ASRMessageType.fullClientRequest.rawValue << 4) | 0x0
    header[2] = (ASRSerialization.json.rawValue << 4) | (gzip ? ASRCompression.gzip.rawValue : ASRCompression.none.rawValue)
    header[3] = 0x00
    return header + payload
}

/// Pack audio frame: client-audio-only-request (msgType=0x2), raw PCM, no compression.
/// M2.6 lock: PCM chunks are 6400 bytes. last=true sets flags=0x2 (last-no-sequence signal).
/// last-only frames may differ in size (e.g. final partial chunk or zero-length terminator).
func packAudioFrame(pcmChunk: Data, last: Bool = false) -> Data {
    precondition(pcmChunk.count == 6400 || last,
                 "expect 6400-byte PCM chunk (M2.6 lock); only last frame may differ in size")
    var header = Data(count: 4)
    header[0] = (0x1 << 4) | 0x1
    header[1] = (ASRMessageType.clientAudioOnlyRequest.rawValue << 4) | (last ? 0x2 : 0x0)
    header[2] = (ASRSerialization.none.rawValue << 4) | ASRCompression.none.rawValue
    header[3] = 0x00
    return header + pcmChunk
}

// MARK: - Frame unpacking

/// Unpack server response frame. Handles server-full-response (0x9) and server-error-response (0xB).
/// Transparently decompresses gzip if byte[2] low nibble == 0x1.
func unpackResponseFrame(data: Data) throws -> ASRResponse {
    guard data.count >= 4 else { throw ASRFrameError.headerTooShort }

    let h1 = data[1]
    let h2 = data[2]

    let msgTypeRaw = (h1 >> 4) & 0x0F
    guard let msgType = ASRMessageType(rawValue: msgTypeRaw) else {
        throw ASRFrameError.unknownMessageType(msgTypeRaw)
    }

    let serRaw = (h2 >> 4) & 0x0F
    guard ASRSerialization(rawValue: serRaw) != nil else {
        throw ASRFrameError.unknownSerialization(serRaw)
    }

    let compRaw = h2 & 0x0F
    guard ASRCompression(rawValue: compRaw) != nil else {
        throw ASRFrameError.unknownCompression(compRaw)
    }

    var payload = data.subdata(in: 4..<data.count)
    if compRaw == ASRCompression.gzip.rawValue {
        payload = try gzipDecompress(payload)
    }

    switch msgType {
    case .serverFullResponse:
        do {
            let result = try JSONDecoder().decode(ASRResultPayload.self, from: payload)
            return .result(result)
        } catch {
            throw ASRFrameError.payloadDecodeFailed(error.localizedDescription)
        }
    case .serverErrorResponse:
        do {
            let env = try JSONDecoder().decode(ASRServerErrorEnvelope.self, from: payload)
            return .serverError(env)
        } catch {
            throw ASRFrameError.payloadDecodeFailed(error.localizedDescription)
        }
    default:
        throw ASRFrameError.unknownMessageType(msgTypeRaw)
    }
}

// MARK: - gzip helpers (Foundation only; zero SPM)

private func gzipCompress(_ data: Data) throws -> Data {
    do {
        return try (data as NSData).compressed(using: .zlib) as Data
    } catch {
        throw ASRFrameError.gzipFailed("compress: \(error.localizedDescription)")
    }
}

private func gzipDecompress(_ data: Data) throws -> Data {
    do {
        return try (data as NSData).decompressed(using: .zlib) as Data
    } catch {
        throw ASRFrameError.gzipFailed("decompress: \(error.localizedDescription)")
    }
}
