import XCTest
import GRDB
@testable import Eatit

final class MigrationsTests: XCTestCase {

    private var tempDir: URL!
    private var dbPath: String!

    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try! FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        dbPath = tempDir.appendingPathComponent("migrations_test.db").path
    }

    override func tearDown() {
        for suffix in ["", "-wal", "-shm"] {
            let url = tempDir.appendingPathComponent("migrations_test.db\(suffix)")
            try? FileManager.default.removeItem(at: url)
        }
        try? FileManager.default.removeItem(at: tempDir)
        tempDir = nil
        dbPath = nil
        super.tearDown()
    }

    // MARK: - §E2 Idempotency

    /// Running all migrations twice on a fresh DB must not throw.
    func testMigrationsAreIdempotent() throws {
        let sut = try DatabaseService(databasePath: dbPath)
        // First run already happened in init. Second run must be a no-op per §E2.
        try sut.applyMigrations()
        // If we get here without throwing, idempotency holds.
    }

    /// user_version after full migration matches the highest version number in MIGRATIONS.
    func testUserVersionAfterMigrations() async throws {
        let sut = try DatabaseService(databasePath: dbPath)
        let rows = try await sut.query(sql: "PRAGMA user_version", params: [])
        XCTAssertEqual(rows.count, 1)
        let encoded = try JSONEncoder().encode(rows[0]["user_version"])
        let json = String(data: encoded, encoding: .utf8)!
        let expectedVersion = MIGRATIONS.map(\.version).max() ?? 0
        XCTAssertEqual(json, "\(expectedVersion)",
                       "user_version should equal highest migration version \(expectedVersion)")
    }

    // MARK: - Schema sanity (sqlite_master)

    private func tableNames(_ sut: DatabaseService) async throws -> Set<String> {
        let rows = try await sut.query(
            sql: "SELECT name FROM sqlite_master WHERE type='table'",
            params: []
        )
        return Set(rows.compactMap { row -> String? in
            guard let rep = row["name"] else { return nil }
            let data = try? JSONEncoder().encode(rep)
            let s = data.flatMap { String(data: $0, encoding: .utf8) }
            // Strip surrounding quotes from JSON string.
            return s?.trimmingCharacters(in: CharacterSet(charactersIn: "\""))
        })
    }

    func testExpectedTablesExist() async throws {
        let sut = try DatabaseService(databasePath: dbPath)
        let tables = try await tableNames(sut)
        let expected: Set<String> = [
            "candidate_assets",
            "parse_results",
            "interview_sessions",
            "direction_frameworks",
            "interview_turns",
            "turn_assessments",
            "compressed_turn_summaries",
            "interview_reports",
            "app_settings",
            "meta_reports",
            "research_cache",
            "user_insight_cache",
            "reflection_reports",
        ]
        for table in expected {
            XCTAssertTrue(tables.contains(table), "Expected table '\(table)' not found in schema")
        }
    }

    /// Dropped tables must NOT appear (users, interview_configs, coach_observations).
    func testDroppedTablesAbsent() async throws {
        let sut = try DatabaseService(databasePath: dbPath)
        let tables = try await tableNames(sut)
        for dropped in ["users", "interview_configs", "coach_observations"] {
            XCTAssertFalse(tables.contains(dropped),
                           "Table '\(dropped)' should have been dropped per §6.2 simplification")
        }
    }

    // MARK: - Index existence

    private func indexNames(_ sut: DatabaseService) async throws -> Set<String> {
        let rows = try await sut.query(
            sql: "SELECT name FROM sqlite_master WHERE type='index'",
            params: []
        )
        return Set(rows.compactMap { row -> String? in
            guard let rep = row["name"] else { return nil }
            let data = try? JSONEncoder().encode(rep)
            let s = data.flatMap { String(data: $0, encoding: .utf8) }
            return s?.trimmingCharacters(in: CharacterSet(charactersIn: "\""))
        })
    }

    func testCriticalIndexesExist() async throws {
        let sut = try DatabaseService(databasePath: dbPath)
        let indexes = try await indexNames(sut)
        let critical = [
            "ix_interview_sessions_user_id",
            "ix_interview_sessions_status",
            "ix_interview_turns_interview_session_id",
            "ix_turn_assessments_interview_turn_id",
            "ix_research_cache_expires_at",
            "ix_uic_user_session",
            "ix_rr_session",
        ]
        for idx in critical {
            XCTAssertTrue(indexes.contains(idx), "Expected index '\(idx)' not found")
        }
    }

    // MARK: - Basic round-trip smoke tests

    func testInsertAndQueryInterviewSession() async throws {
        let sut = try DatabaseService(databasePath: dbPath)
        // Insert a candidate_asset first (FK dependency).
        _ = try await sut.exec(
            sql: """
                INSERT INTO candidate_assets (id, user_id, status)
                VALUES (?, 'local', 'ready')
                """,
            params: ["asset-1".databaseValue]
        )
        _ = try await sut.exec(
            sql: """
                INSERT INTO interview_sessions
                    (id, user_id, candidate_asset_id, status, config_snapshot)
                VALUES (?, 'local', ?, 'created', '{}')
                """,
            params: ["session-1".databaseValue, "asset-1".databaseValue]
        )
        let rows = try await sut.query(
            sql: "SELECT id, status FROM interview_sessions WHERE id = ?",
            params: ["session-1".databaseValue]
        )
        XCTAssertEqual(rows.count, 1)
        let encoded = try JSONEncoder().encode(rows[0]["status"])
        let json = String(data: encoded, encoding: .utf8)!
        XCTAssertEqual(json, "\"created\"")
    }

    func testAppSettingsUpsert() async throws {
        let sut = try DatabaseService(databasePath: dbPath)
        _ = try await sut.exec(
            sql: """
                INSERT INTO app_settings (key, value)
                VALUES ('research_opt_in', 'true')
                ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
                """,
            params: []
        )
        _ = try await sut.exec(
            sql: """
                INSERT INTO app_settings (key, value)
                VALUES ('research_opt_in', 'false')
                ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
                """,
            params: []
        )
        let rows = try await sut.query(
            sql: "SELECT value FROM app_settings WHERE key = 'research_opt_in'",
            params: []
        )
        XCTAssertEqual(rows.count, 1)
        let encoded = try JSONEncoder().encode(rows[0]["value"])
        let json = String(data: encoded, encoding: .utf8)!
        XCTAssertEqual(json, "\"false\"", "Upsert should overwrite to 'false'")
    }

    func testInterviewReportsPKIsSessionId() async throws {
        let sut = try DatabaseService(databasePath: dbPath)
        _ = try await sut.exec(
            sql: "INSERT INTO candidate_assets (id, user_id, status) VALUES ('a1', 'local', 'ready')",
            params: []
        )
        _ = try await sut.exec(
            sql: """
                INSERT INTO interview_sessions
                    (id, user_id, candidate_asset_id, status, config_snapshot)
                VALUES ('s1', 'local', 'a1', 'ended', '{}')
                """,
            params: []
        )
        _ = try await sut.exec(
            sql: """
                INSERT INTO interview_reports (session_id, status, payload)
                VALUES ('s1', 'ready', '{}')
                """,
            params: []
        )
        // Upsert by session_id PK must succeed (not create duplicate).
        _ = try await sut.exec(
            sql: """
                INSERT INTO interview_reports (session_id, status, payload)
                VALUES ('s1', 'updated', '{"v":2}')
                ON CONFLICT(session_id) DO UPDATE SET status = excluded.status, payload = excluded.payload
                """,
            params: []
        )
        let rows = try await sut.query(
            sql: "SELECT status FROM interview_reports WHERE session_id = 's1'",
            params: []
        )
        XCTAssertEqual(rows.count, 1)
        let encoded = try JSONEncoder().encode(rows[0]["status"])
        let json = String(data: encoded, encoding: .utf8)!
        XCTAssertEqual(json, "\"updated\"")
    }
}
