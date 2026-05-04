import XCTest
@testable import Eatit

final class KeychainServiceTests: XCTestCase {

    private var sut: KeychainService!
    private var testAccount: String!

    override func setUp() {
        super.setUp()
        sut = KeychainService()
        // Random UUID account to avoid polluting real keychain entries
        testAccount = "test-\(UUID().uuidString)"
    }

    override func tearDown() {
        // Clean up test entries — ignore errors (may not exist)
        try? sut.delete(account: testAccount)
        sut = nil
        testAccount = nil
        super.tearDown()
    }

    func testSaveAndRead() throws {
        let secret = "hello-world".data(using: .utf8)!
        try sut.save(account: testAccount, secret: secret)
        let result = try sut.read(account: testAccount)
        XCTAssertEqual(result, secret)
    }

    func testSaveOverwritesExistingEntry() throws {
        let original = "original-secret".data(using: .utf8)!
        let updated = "updated-secret".data(using: .utf8)!
        try sut.save(account: testAccount, secret: original)
        try sut.save(account: testAccount, secret: updated)
        let result = try sut.read(account: testAccount)
        XCTAssertEqual(result, updated)
    }

    func testDeleteExistingEntry() throws {
        let secret = "to-be-deleted".data(using: .utf8)!
        try sut.save(account: testAccount, secret: secret)
        XCTAssertTrue(sut.exists(account: testAccount))
        try sut.delete(account: testAccount)
        XCTAssertFalse(sut.exists(account: testAccount))
    }

    func testDeleteNonExistentEntryIsIdempotent() throws {
        // Should not throw even when entry does not exist
        XCTAssertNoThrow(try sut.delete(account: testAccount))
        // Call twice to confirm idempotency
        XCTAssertNoThrow(try sut.delete(account: testAccount))
    }

    func testExistsReturnsFalseWhenMissing() {
        XCTAssertFalse(sut.exists(account: testAccount))
    }

    func testExistsReturnsTrueAfterSave() throws {
        let secret = "exists-check".data(using: .utf8)!
        XCTAssertFalse(sut.exists(account: testAccount))
        try sut.save(account: testAccount, secret: secret)
        XCTAssertTrue(sut.exists(account: testAccount))
    }

    func testSecondInstanceReadsDataWrittenByFirstInstance() throws {
        // Simulates interface isolation across service instances (proxy for "survives restart").
        // Two separate KeychainService instances share the same underlying keychain store.
        let writer = KeychainService()
        let secret = "cross-instance".data(using: .utf8)!
        try writer.save(account: testAccount, secret: secret)

        let reader = KeychainService()
        let result = try reader.read(account: testAccount)
        XCTAssertEqual(result, secret)
    }
}
