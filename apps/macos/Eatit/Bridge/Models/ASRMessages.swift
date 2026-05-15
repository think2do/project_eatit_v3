import Foundation

// §C / §A0.4: pure type layer — NO Keychain access, NO network calls.
// §C3: VolcAsrCreds NOT exposed via Bridge (Keychain JSON shape only, Swift-internal).
// §B9: Bridge method registration begins in M2.8.dev.b; this file is types only.

// MARK: - Keychain credential shape (Swift-internal; NOT a Bridge type)

struct VolcAsrCreds: Codable {
    /// 新版控制台单 key 鉴权 (https://console.volcengine.com/speech/new/setting/apikeys)。
    /// WS 升级头里走 `X-Api-Key: <apiKey>`,旧版 X-Api-App-Key + X-Api-Access-Key
    /// 已合并为这一项。同一把 key 同时驱动 ASR 与 TTS。
    let apiKey: String
    /// 可选 — 覆盖 ASRGateway 内置的 `volc.bigasr.sauc.duration` 默认值。
    /// Seed ASR 2.0 等新服务的 resource id 由用户从火山控制台自填,
    /// 避免每出新服务都要 Swift 重 build。空字符串视同未设置。
    let resourceId: String?
    /// 可选 — 覆盖默认 endpoint 路径(`/api/v3/sauc/bigmodel_async`)。
    /// 仅接受 path,host 仍由 §A0.3 白名单 (`openspeech.bytedance.com`) 守住。
    /// 例:`/api/v3/sauc/bigmodel`(老 SAUC)/ `/api/v3/sauc/bigmodel_async`(2.0)。
    let endpointPath: String?
}

// MARK: - First-frame JSON payload schemas
//
// Aligned with Doubao Seed ASR Streaming 2.0 wire format (verified via
// koe-asr/src/doubao.rs https://github.com/missuo/koe). Payload shape:
//   {
//     "user":    { "uid": "<free-form app marker>" },
//     "audio":   { "format": "pcm", "codec": "raw",
//                  "rate": 16000, "bits": 16, "channel": 1 },
//     "request": { "model_name": "bigmodel",
//                  "enable_itn": Bool, "enable_punc": Bool,
//                  "enable_ddc": Bool, "enable_nonstream": Bool,
//                  "result_type": "full", "show_utterances": Bool }
//   }
//
// Differences vs the older SAUC bigmodel layout we previously shipped:
//   - `audio.channel` is SINGULAR — old `channels` (plural) is rejected.
//   - `audio.bits` is now required (PCM bit depth, 16 for 16-bit LE).
//   - Top-level `user` block is required; `uid` is a free-form app id.
//   - `request.result_type` + `show_utterances` are required to receive
//     partial transcripts; without them server may emit no partials.
//   - Legacy `enable_speaker_info` is dropped — Seed ASR 2.0 doesn't take it.

struct ASRUserConfig: Codable {
    let uid: String
}

struct ASRAudioConfig: Codable {
    let format: String   // "pcm"
    let codec: String    // "raw"
    let rate: Int        // 16000
    let bits: Int        // 16
    let channel: Int     // 1
}

struct ASRRequestConfig: Codable {
    let modelName: String
    let enableITN: Bool
    let enablePunc: Bool
    let enableDDC: Bool
    let enableNonstream: Bool
    let resultType: String
    let showUtterances: Bool

    enum CodingKeys: String, CodingKey {
        case modelName       = "model_name"
        case enableITN       = "enable_itn"
        case enablePunc      = "enable_punc"
        case enableDDC       = "enable_ddc"
        case enableNonstream = "enable_nonstream"
        case resultType      = "result_type"
        case showUtterances  = "show_utterances"
    }
}

struct ASRConfigPayload: Codable {
    let user: ASRUserConfig
    let audio: ASRAudioConfig
    let request: ASRRequestConfig
}

// MARK: - Server response schemas

// All fields are optional because Seed ASR 2.0 emits frames at multiple
// granularities — empty interim heartbeats, summary-only finals without an
// `utterances` array, partial utterances without `definite`, etc.  Strict
// requireds caused JSONDecoder to throw "data couldn't be read because it
// is missing" mid-stream and surface as `asr.frame-unpack-failed`.
//
// Defaults at the consumer site (dispatchUtterances):
//   - `definite` absent → treat as false (partial)
//   - `text` absent → skip the utterance (no UI update)
//   - `utterances` absent but `result.text` present → synthesise a single
//     definite utterance from the summary text (final-only delivery shape).
struct ASRUtterance: Codable {
    let text: String?
    let definite: Bool?
    let startTime: Int?
    let endTime: Int?

    enum CodingKeys: String, CodingKey {
        case text, definite
        case startTime = "start_time"
        case endTime = "end_time"
    }
}

struct ASRResultInner: Codable {
    let utterances: [ASRUtterance]?
    let text: String?
}

struct ASRResultPayload: Codable {
    let result: ASRResultInner?
    // Other top-level fields the server may emit (audio_info / is_last /
    // log_id …) are intentionally ignored — Codable's default decoder
    // skips unknown keys, no need to model them.
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
