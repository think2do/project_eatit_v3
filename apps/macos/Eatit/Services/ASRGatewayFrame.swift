import Foundation

// Doubao Seed ASR 2.0 binary WebSocket frame pack/unpack.
// Reference impl: https://github.com/missuo/koe (koe-asr/src/doubao.rs).
//
// Wire layout per `bigmodel_async`:
//
//   [4-byte header]
//   [optional 4-byte BE u32 sequence] — only when flags bit 0 (has_sequence) set
//   [4-byte BE u32 payload_size]
//   [payload bytes]
//
// Header (4 bytes, big-endian):
//   byte[0] = (version << 4) | header_size   — locked to 0x11 (ver=1, hdr=1*4)
//   byte[1] = (msg_type << 4) | flags        — flags bit 1 = LAST_PACKET
//   byte[2] = (serialization << 4) | compression
//   byte[3] = 0x00 (reserved)
//
// Differences vs the older SAUC bigmodel:
//   - Wire layout now has a u32 length prefix between header and payload
//     (old format had payload immediately after header).
//   - Server error frames use msg_type = 0xF (binary
//     `[u32 code][u32 msg_size][UTF-8]`), not 0xB JSON envelope.
//
// Compression caveat: Foundation's `.zlib` algorithm is RAW DEFLATE
// (RFC 1951) — not real gzip (RFC 1952, which adds a 10-byte magic
// header + 8-byte CRC/size trailer).  The current send path therefore
// goes uncompressed (compression flag = 0, raw bytes).  If Volc rejects
// uncompressed frames, layer real gzip wrapping on top — Foundation
// alone can't produce it.

// MARK: - Protocol enums

enum ASRMessageType: UInt8 {
    case fullClientRequest = 0x1
    case clientAudioOnlyRequest = 0x2
    case serverFullResponse = 0x9
    // 0xF (0b1111) is what Doubao Seed ASR 2.0 uses for error frames —
    // confirmed via koe-asr/src/doubao.rs `MSG_ERROR: u8 = 0b1111`.
    // Older SAUC bigmodel docs called the error code 0xB; that value is
    // never emitted by the 2.0 endpoint.
    case serverErrorResponse = 0xF
}

enum ASRSerialization: UInt8 {
    case none = 0x0
    case json = 0x1
}

enum ASRCompression: UInt8 {
    case none = 0x0
    case gzip = 0x1
}

// Flag bits in byte[1] low nibble.
private let FLAG_HAS_SEQUENCE: UInt8 = 0x1
private let FLAG_LAST_PACKET:  UInt8 = 0x2

// MARK: - Frame header helper (for tests + internal use)

struct ASRFrameHeader {
    let version: UInt8
    let headerSize: UInt8
    let messageType: ASRMessageType
    let flags: UInt8
    let serialization: ASRSerialization
    let compression: ASRCompression
}

// MARK: - Typed errors

enum ASRFrameError: Error, Equatable {
    case headerTooShort
    case unknownMessageType(UInt8)
    case unknownSerialization(UInt8)
    case unknownCompression(UInt8)
    case payloadDecodeFailed(String)
    case gzipFailed(String)
    case payloadTruncated(String)
}

// MARK: - Response discriminated union

enum ASRResponse {
    case result(ASRResultPayload)
    case serverError(ASRServerErrorEnvelope)
}

// MARK: - Frame packing

/// Pack first frame: full-client-request (msgType=0x1) with JSON config payload.
/// Wire form: `[4-byte header][4-byte BE u32 payload_len][JSON bytes]`.
/// `gzip` arg retained for API compatibility but ignored — see file header
/// comment for why we don't compress today.
func packFirstFrame(config: ASRConfigPayload, gzip: Bool = false) throws -> Data {
    _ = gzip
    let payload = try JSONEncoder().encode(config)
    var header = Data(count: 4)
    header[0] = (0x1 << 4) | 0x1
    header[1] = (ASRMessageType.fullClientRequest.rawValue << 4) | 0x0
    header[2] = (ASRSerialization.json.rawValue << 4) | ASRCompression.none.rawValue
    header[3] = 0x00
    return header + sizePrefixed(payload)
}

/// Pack audio frame: client-audio-only-request (msgType=0x2), raw PCM.
/// Wire form: `[4-byte header][4-byte BE u32 payload_len][PCM bytes]`.
/// last=true sets the LAST_PACKET flag bit.
func packAudioFrame(pcmChunk: Data, last: Bool = false) -> Data {
    precondition(pcmChunk.count == 6400 || last,
                 "expect 6400-byte PCM chunk (M2.6 lock); only last frame may differ in size")
    var header = Data(count: 4)
    header[0] = (0x1 << 4) | 0x1
    header[1] = (ASRMessageType.clientAudioOnlyRequest.rawValue << 4) | (last ? FLAG_LAST_PACKET : 0x0)
    header[2] = (ASRSerialization.none.rawValue << 4) | ASRCompression.none.rawValue
    header[3] = 0x00
    return header + sizePrefixed(pcmChunk)
}

/// Big-endian u32 length prefix (Volc Seed ASR 2.0 wire requirement).
private func sizePrefixed(_ payload: Data) -> Data {
    var out = Data(capacity: 4 + payload.count)
    let len = UInt32(payload.count).bigEndian
    withUnsafeBytes(of: len) { out.append(contentsOf: $0) }
    out.append(payload)
    return out
}

// MARK: - Frame unpacking

/// Unpack server response frame. Handles server-full-response (0x9) and
/// server-error-response (0xF). Body layout:
///   - 0x9: optional sequence (4 bytes BE u32, flags bit 0)
///          + size (u32 BE) + JSON-or-gzipped-JSON payload
///   - 0xF: error_code (u32 BE) + msg_size (u32 BE) + UTF-8 message bytes
func unpackResponseFrame(data: Data) throws -> ASRResponse {
    guard data.count >= 4 else { throw ASRFrameError.headerTooShort }

    let h0 = data[0]
    let h1 = data[1]
    let h2 = data[2]
    let headerBytes = Int(h0 & 0x0F) * 4   // typically 4

    let msgTypeRaw = (h1 >> 4) & 0x0F
    guard let msgType = ASRMessageType(rawValue: msgTypeRaw) else {
        throw ASRFrameError.unknownMessageType(msgTypeRaw)
    }

    let flags = h1 & 0x0F
    let serRaw  = (h2 >> 4) & 0x0F
    let compRaw = h2 & 0x0F

    guard ASRSerialization(rawValue: serRaw) != nil else {
        throw ASRFrameError.unknownSerialization(serRaw)
    }
    guard ASRCompression(rawValue: compRaw) != nil else {
        throw ASRFrameError.unknownCompression(compRaw)
    }

    var offset = headerBytes

    switch msgType {
    case .serverFullResponse:
        // Optional 4-byte sequence id when flags bit 0 set.
        if (flags & FLAG_HAS_SEQUENCE) != 0 {
            guard data.count >= offset + 4 else {
                throw ASRFrameError.payloadTruncated("missing sequence")
            }
            offset += 4
        }
        // 4-byte BE u32 payload size.
        guard let payloadSize = readBE32(data, at: offset) else {
            throw ASRFrameError.payloadTruncated("missing payload size")
        }
        offset += 4
        guard data.count >= offset + Int(payloadSize) else {
            throw ASRFrameError.payloadTruncated("incomplete payload")
        }
        var payload = data.subdata(in: offset..<offset + Int(payloadSize))
        if compRaw == ASRCompression.gzip.rawValue {
            payload = try gzipDecompress(payload)
        }
        do {
            let result = try JSONDecoder().decode(ASRResultPayload.self, from: payload)
            return .result(result)
        } catch {
            throw ASRFrameError.payloadDecodeFailed(error.localizedDescription)
        }

    case .serverErrorResponse:
        guard let codeU32 = readBE32(data, at: offset) else {
            throw ASRFrameError.payloadTruncated("missing error code")
        }
        offset += 4
        guard let msgSize = readBE32(data, at: offset) else {
            throw ASRFrameError.payloadTruncated("missing error msg size")
        }
        offset += 4
        let msgEnd = offset + Int(msgSize)
        guard data.count >= msgEnd else {
            throw ASRFrameError.payloadTruncated("incomplete error message")
        }
        let msgBytes = data.subdata(in: offset..<msgEnd)
        let msg = String(data: msgBytes, encoding: .utf8) ?? ""
        return .serverError(ASRServerErrorEnvelope(code: Int(codeU32), message: msg))

    default:
        throw ASRFrameError.unknownMessageType(msgTypeRaw)
    }
}

private func readBE32(_ data: Data, at offset: Int) -> UInt32? {
    guard data.count >= offset + 4 else { return nil }
    let b0 = UInt32(data[offset])
    let b1 = UInt32(data[offset + 1])
    let b2 = UInt32(data[offset + 2])
    let b3 = UInt32(data[offset + 3])
    return (b0 << 24) | (b1 << 16) | (b2 << 8) | b3
}

// MARK: - gzip helpers (Foundation only; raw DEFLATE — see file header).
// Kept for the receive-side happy-path; current send path is uncompressed.

private func gzipDecompress(_ data: Data) throws -> Data {
    do {
        return try (data as NSData).decompressed(using: .zlib) as Data
    } catch {
        throw ASRFrameError.gzipFailed("decompress: \(error.localizedDescription)")
    }
}
