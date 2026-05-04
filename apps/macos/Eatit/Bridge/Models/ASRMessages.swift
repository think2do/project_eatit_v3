import Foundation

// §C / §A0.4: pure type layer — NO Keychain access, NO network calls.
// §C3: VolcAsrCreds NOT exposed via Bridge (Keychain JSON shape only, Swift-internal).
// §B9: Bridge method registration begins in M2.8.dev.b; this file is types only.

// MARK: - Keychain credential shape (Swift-internal; NOT a Bridge type)

struct VolcAsrCreds: Codable {
    let appId: String
    let accessToken: String
}

// MARK: - First-frame JSON payload schemas

struct ASRAudioConfig: Codable {
    let format: String   // "pcm"
    let rate: Int        // 16000
    let channels: Int    // 1
    let codec: String    // "raw"
}

struct ASRRequestConfig: Codable {
    let modelName: String
    let enableITN: Bool
    let enablePunc: Bool
    let enableSpeakerInfo: Bool?

    enum CodingKeys: String, CodingKey {
        case modelName = "model_name"
        case enableITN = "enable_itn"
        case enablePunc = "enable_punc"
        case enableSpeakerInfo = "enable_speaker_info"
    }
}

struct ASRConfigPayload: Codable {
    let audio: ASRAudioConfig
    let request: ASRRequestConfig
}

// MARK: - Server response schemas

struct ASRUtterance: Codable {
    let text: String
    let definite: Bool
    let startTime: Int?
    let endTime: Int?

    enum CodingKeys: String, CodingKey {
        case text, definite
        case startTime = "start_time"
        case endTime = "end_time"
    }
}

struct ASRResultInner: Codable {
    let utterances: [ASRUtterance]
    let text: String?
}

struct ASRResultPayload: Codable {
    let result: ASRResultInner
}

struct ASRServerErrorEnvelope: Codable {
    let code: Int
    let message: String
}

// MARK: - Bridge boundary types (camelCase; used in asr.start / asr.status — registered in M2.8.dev.b)

struct ASRStartParams: Codable {
    let streamId: String
    let enableITN: Bool?
    let enablePunc: Bool?
}

struct ASRStatusResult: Codable {
    let connected: Bool
    let streamId: String?
    let retryCount: Int
}
