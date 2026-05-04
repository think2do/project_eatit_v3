import XCTest
import GRDB
@testable import Eatit

final class DatabaseServiceTests: XCTestCase {

    private var tempDir: URL!
    private var dbPath: String!

    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try! FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        dbPath = tempDir.appendingPathComponent("test.db").path
    }

    override func tearDown() {
        // Remove the db file and WAL / SHM sidecar files.
        for suffix in ["", "-wal", "-shm"] {
            let url = tempDir.appendingPathComponent("test.db\(suffix)")
            try? FileManager.default.removeItem(at: url)
        }
        try? FileManager.default.removeItem(at: tempDir)
        tempDir = nil
        dbPath = nil
        super.tearDown()
    }

    // MARK: - init + WAL

    func testInitCreatesDBAndEnablesWAL() async throws {
        let sut = try DatabaseService(databasePath: dbPath)
        // Verify WAL mode is active by querying PRAGMA journal_mode.
        let rows = try await sut.query(sql: "PRAGMA journal_mode", params: [])
        XCTAssertEqual(rows.count, 1)
        // GRDB returns the journal_mode as the value for key "journal_mode".
        // After setting WAL the pragma returns "wal".
        let value = rows[0]["journal_mode"]
        // Encode to JSON string for comparison.
        let encoded = try JSONEncoder().encode(value)
        let json = String(data: encoded, encoding: .utf8)!
        XCTAssertEqual(json, "\"wal\"", "Expected journal_mode to be 'wal', got \(json)")
    }

    // MARK: - Migrations

    func testApplyMigrationsIsIdempotentWithEmptyArray() async throws {
        let sut = try DatabaseService(databasePath: dbPath)
        // Running migrations twice on empty MIGRATIONS array must not increment user_version.
        try sut.applyMigrations()
        try sut.applyMigrations()
        let rows = try await sut.query(sql: "PRAGMA user_version", params: [])
        XCTAssertEqual(rows.count, 1)
        let encoded = try JSONEncoder().encode(rows[0]["user_version"])
        let json = String(data: encoded, encoding: .utf8)!
        XCTAssertEqual(json, "0", "Expected user_version=0 after empty migrations, got \(json)")
    }

    // MARK: - exec

    func testExecCreateTableDoesNotThrow() async throws {
        let sut = try DatabaseService(databasePath: dbPath)
        let result = try await sut.exec(
            sql: "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)",
            params: []
        )
        // CREATE TABLE returns 0 rows affected; just verify no throw.
        XCTAssertEqual(result.rowsAffected, 0)
    }

    func testExecInsertReturnsRowsAffected() async throws {
        let sut = try DatabaseService(databasePath: dbPath)
        _ = try await sut.exec(sql: "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)", params: [])
        let insertResult = try await sut.exec(
            sql: "INSERT INTO t (name) VALUES (?)",
            params: ["x".databaseValue]
        )
        XCTAssertEqual(insertResult.rowsAffected, 1)
    }

    // MARK: - query

    func testQueryReturnsInsertedRow() async throws {
        let sut = try DatabaseService(databasePath: dbPath)
        _ = try await sut.exec(sql: "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)", params: [])
        _ = try await sut.exec(sql: "INSERT INTO t (name) VALUES (?)", params: ["x".databaseValue])
        let rows = try await sut.query(sql: "SELECT id, name FROM t", params: [])
        XCTAssertEqual(rows.count, 1)
        // Verify "name" column value encodes to "x".
        let encoded = try JSONEncoder().encode(rows[0]["name"])
        let json = String(data: encoded, encoding: .utf8)!
        XCTAssertEqual(json, "\"x\"")
    }

    // MARK: - tx atomicity

    func testTxRollsBackOnError() async throws {
        let sut = try DatabaseService(databasePath: dbPath)
        _ = try await sut.exec(sql: "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT NOT NULL)", params: [])

        // Attempt a tx where the second statement violates NOT NULL constraint.
        let statements = [
            DatabaseService.TxStatement(sql: "INSERT INTO t (name) VALUES ('ok')", params: []),
            DatabaseService.TxStatement(sql: "INSERT INTO t (name) VALUES (NULL)", params: []),
        ]
        // The tx should throw; we capture and ignore the error.
        try? await sut.tx(statements: statements)

        // Verify the first statement was also rolled back (atomicity).
        let rows = try await sut.query(sql: "SELECT * FROM t", params: [])
        XCTAssertEqual(rows.count, 0, "Transaction should have rolled back all statements on error")
    }
}
