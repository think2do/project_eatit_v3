import Foundation
import GRDB

// §A0.1: DB lives in sandbox container Application Support; auto-isolated by macOS.
// §E3: callers MUST redact secrets (ARK_API_KEY / volc-asr-credentials / app-encryption-key)
//      before passing as column values. M3 nodes must add redactSecrets() helper before
//      first row insert touches user input.

// MARK: - BridgeDBValue
// Bridge-friendly parameter wrapper: Decodable from JSON, convertible to GRDB DatabaseValue.
// Design choice: handlers use [BridgeDBValue], convert to [DatabaseValue] before calling
// DatabaseService — keeps DatabaseService independent of Bridge types.
// Blob support deferred to first schema that needs it (M3+); current schema is empty.
enum BridgeDBValue: Codable {
    case null
    case int(Int64)
    case double(Double)
    case string(String)
    case bool(Bool)

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
            return
        }
        // Order matters: try Bool before Int to avoid Int(0/1) shadowing Bool.
        if let v = try? container.decode(Bool.self) {
            self = .bool(v)
            return
        }
        if let v = try? container.decode(Int64.self) {
            self = .int(v)
            return
        }
        if let v = try? container.decode(Double.self) {
            self = .double(v)
            return
        }
        if let v = try? container.decode(String.self) {
            self = .string(v)
            return
        }
        throw DecodingError.typeMismatch(
            BridgeDBValue.self,
            .init(codingPath: decoder.codingPath,
                  debugDescription: "Expected null/bool/int/double/string")
        )
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case .int(let v): try container.encode(v)
        case .double(let v): try container.encode(v)
        case .string(let v): try container.encode(v)
        case .bool(let v): try container.encode(v)
        }
    }

    var dbValue: DatabaseValue {
        switch self {
        case .null: return .null
        case .int(let v): return v.databaseValue
        case .double(let v): return v.databaseValue
        case .string(let v): return v.databaseValue
        case .bool(let v): return (v ? Int64(1) : Int64(0)).databaseValue
        }
    }
}

// MARK: - DatabaseValueRepresentation
// Bridge-friendly JSON encoding of a DatabaseValue.
// NULL → encodeNil, Int64 → Int64, Double → Double, String → String, Blob → base64 String.
struct DatabaseValueRepresentation: Encodable {
    let storage: DatabaseValue.Storage

    init(_ dbValue: DatabaseValue) {
        self.storage = dbValue.storage
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch storage {
        case .null:
            try container.encodeNil()
        case .int64(let v):
            try container.encode(v)
        case .double(let v):
            try container.encode(v)
        case .string(let v):
            try container.encode(v)
        case .blob(let v):
            try container.encode(v.base64EncodedString())
        }
    }
}

// MARK: - DatabaseService
final class DatabaseService {
    private let dbQueue: DatabaseQueue

    /// Production init: opens DB in sandbox container Application Support.
    convenience init() throws {
        let containerURL = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ).appendingPathComponent("Eatit", isDirectory: true)
        try FileManager.default.createDirectory(at: containerURL, withIntermediateDirectories: true)
        let dbURL = containerURL.appendingPathComponent("eatit.db")
        try self.init(databasePath: dbURL.path)
    }

    /// Designated init: accepts explicit path; used by XCTest with temp directory.
    init(databasePath: String) throws {
        var config = Configuration()
        config.prepareDatabase { db in
            // §spec: WAL journal mode required; cannot be disabled for test convenience (§K).
            try db.execute(sql: "PRAGMA journal_mode = WAL")
        }
        dbQueue = try DatabaseQueue(path: databasePath, configuration: config)
        try applyMigrations()
    }

    // MARK: - Migrations

    /// Applies pending MIGRATIONS entries, tracking applied version via PRAGMA user_version.
    /// §E2: idempotent — safe to call multiple times; skips already-applied versions.
    /// With empty MIGRATIONS array this is a no-op (M2.3 baseline).
    func applyMigrations() throws {
        try dbQueue.write { db in
            let current = try Int.fetchOne(db, sql: "PRAGMA user_version") ?? 0
            for migration in MIGRATIONS where migration.version > current {
                try db.execute(sql: migration.sql)
                // user_version only accepts literal; string interpolation is safe here
                // because `version` is a compile-time constant Int, not user input.
                try db.execute(sql: "PRAGMA user_version = \(migration.version)")
            }
        }
    }

    // MARK: - Bridge Methods

    struct ExecResult: Codable {
        let rowsAffected: Int
    }

    /// Execute a DML statement (INSERT/UPDATE/DELETE/CREATE/etc).
    /// Returns the number of rows affected.
    func exec(sql: String, params: [DatabaseValue]) async throws -> ExecResult {
        try await dbQueue.write { db in
            try db.execute(sql: sql, arguments: StatementArguments(params))
            return ExecResult(rowsAffected: db.changesCount)
        }
    }

    /// Execute a SELECT statement, returning rows as JSON-friendly dictionaries.
    func query(sql: String, params: [DatabaseValue]) async throws -> [[String: DatabaseValueRepresentation]] {
        try await dbQueue.read { db in
            let rows = try Row.fetchAll(db, sql: sql, arguments: StatementArguments(params))
            return rows.map { row in
                var dict: [String: DatabaseValueRepresentation] = [:]
                for columnName in row.columnNames {
                    let dbVal: DatabaseValue = row[columnName]
                    dict[columnName] = DatabaseValueRepresentation(dbVal)
                }
                return dict
            }
        }
    }

    // TxStatement.params is [DatabaseValue] — conversion from BridgeDBValue happens in
    // the Bridge handler (WebViewController.registerDatabaseHandlers) before calling tx().
    // This keeps DatabaseService independent of Bridge types.
    struct TxStatement: Codable {
        let sql: String
        let params: [DatabaseValue]?

        // Custom Codable because DatabaseValue is not directly Codable.
        // In practice TxStatement is constructed by handler code, not decoded from JSON.
        enum CodingKeys: String, CodingKey { case sql, params }

        init(sql: String, params: [DatabaseValue]?) {
            self.sql = sql
            self.params = params
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            sql = try container.decode(String.self, forKey: .sql)
            // params decoding via BridgeDBValue is handled at handler level;
            // direct decode here is not needed (handler constructs TxStatement explicitly).
            params = nil
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(sql, forKey: .sql)
        }
    }

    /// Execute multiple statements in a single transaction.
    /// If any statement throws, the entire transaction is rolled back.
    func tx(statements: [TxStatement]) async throws {
        try await dbQueue.write { db in
            for stmt in statements {
                try db.execute(
                    sql: stmt.sql,
                    arguments: StatementArguments(stmt.params ?? [])
                )
            }
        }
    }
}
