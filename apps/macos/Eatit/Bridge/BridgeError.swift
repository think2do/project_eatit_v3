import Foundation

/// §C3: handlers MUST NOT return secret material in response.data.
/// §6.2 starter codebook — all error codes are hard-coded strings, never enum-to-string.
struct BridgeError: Codable, Error {
    let code: String     // e.g., "bridge.method-not-found"
    let message: String  // developer-readable English
}
