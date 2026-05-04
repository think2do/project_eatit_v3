import Foundation
import Security

/// macOS Keychain CRUD wrapper.
/// Service name lock: §C1 → "com.eatit.desktop".
/// §C3: read() is INTERNAL-ONLY (Swift LLMGateway/ASRGateway). Never expose via Bridge.
/// Single-app private keychain mode (no kSecAttrAccessGroup).
/// §C2: Access-group entitlement deferred until Apple Dev Portal configured (M1.4).
///      When access group is ready: add `keychain-access-groups` array to Eatit.entitlements
///      and include `kSecAttrAccessGroup` in all query dictionaries.
final class KeychainService {
    static let serviceName = "com.eatit.desktop"

    enum KeychainError: Error, Equatable {
        case unexpectedStatus(OSStatus)
        case dataConversionFailure
    }

    func save(account: String, secret: Data) throws {
        // Try update first; if not found, add.
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.serviceName,
            kSecAttrAccount as String: account,
        ]
        let attributesToUpdate: [String: Any] = [kSecValueData as String: secret]
        let updateStatus = SecItemUpdate(query as CFDictionary, attributesToUpdate as CFDictionary)
        if updateStatus == errSecSuccess { return }
        if updateStatus == errSecItemNotFound {
            var addQuery = query
            addQuery[kSecValueData as String] = secret
            // §A0.4: secret stays in stack; never logged.
            let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
            guard addStatus == errSecSuccess else { throw KeychainError.unexpectedStatus(addStatus) }
            return
        }
        throw KeychainError.unexpectedStatus(updateStatus)
    }

    /// Internal-only. §C3: never expose via Bridge. Swift gateways (LLMGateway/ASRGateway) call this directly.
    func read(account: String) throws -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.serviceName,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw KeychainError.unexpectedStatus(status) }
        guard let data = result as? Data else { throw KeychainError.dataConversionFailure }
        return data
    }

    func delete(account: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.serviceName,
            kSecAttrAccount as String: account,
        ]
        let status = SecItemDelete(query as CFDictionary)
        // errSecItemNotFound is idempotent success — no error
        if status == errSecSuccess || status == errSecItemNotFound { return }
        throw KeychainError.unexpectedStatus(status)
    }

    func exists(account: String) -> Bool {
        do {
            return try read(account: account) != nil
        } catch {
            return false
        }
    }
}
