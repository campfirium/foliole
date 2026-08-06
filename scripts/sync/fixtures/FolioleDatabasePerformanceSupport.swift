import Foundation
import MachO
@testable import CapacitorSQLitePlugin

struct FolioleMeasuredResult {
    let elapsedMs: Int
    let peakDeltaBytes: UInt64
}

enum FoliolePerformanceMeasure {
    static func run(_ operation: () throws -> Void) rethrows -> FolioleMeasuredResult {
        let initial = residentBytes()
        let peak = LockedPeak(initial)
        let running = LockedFlag(true)
        let group = DispatchGroup()
        group.enter()
        DispatchQueue.global(qos: .userInitiated).async {
            while running.value {
                peak.record(residentBytes())
                usleep(5_000)
            }
            peak.record(residentBytes())
            group.leave()
        }
        let started = DispatchTime.now().uptimeNanoseconds
        defer {
            running.value = false
            group.wait()
        }
        try operation()
        let elapsed = DispatchTime.now().uptimeNanoseconds - started
        return FolioleMeasuredResult(
            elapsedMs: Int(elapsed / 1_000_000),
            peakDeltaBytes: peak.value > initial ? peak.value - initial : 0
        )
    }

    private static func residentBytes() -> UInt64 {
        var info = mach_task_basic_info()
        var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size) / 4
        let status = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
            }
        }
        return status == KERN_SUCCESS ? UInt64(info.resident_size) : 0
    }
}

private final class LockedPeak {
    private let lock = NSLock()
    private var stored: UInt64
    init(_ value: UInt64) { stored = value }
    func record(_ value: UInt64) { lock.lock(); stored = max(stored, value); lock.unlock() }
    var value: UInt64 { lock.lock(); defer { lock.unlock() }; return stored }
}

private final class LockedFlag {
    private let lock = NSLock()
    private var stored: Bool
    init(_ value: Bool) { stored = value }
    var value: Bool {
        get { lock.lock(); defer { lock.unlock() }; return stored }
        set { lock.lock(); stored = newValue; lock.unlock() }
    }
}

final class FolioleDatabasePerformanceHarness {
    private let location = "Documents"
    private let plugin: CapacitorSQLite
    private let suffix = UUID().uuidString.replacingOccurrences(of: "-", with: "")
    private var directDatabases: [Database] = []
    private var pluginNames: [String] = []

    init() {
        var config = SqliteConfig()
        config.iosIsEncryption = 0
        plugin = CapacitorSQLite(config: config)
    }

    func direct(_ name: String, schema: String) throws -> Database {
        let databaseName = resolved(name)
        let database = try Database(
            databaseLocation: location, databaseName: "\(databaseName)SQLite.db",
            encrypted: false, isEncryption: false, account: "foliole-performance",
            mode: "no-encryption", version: 1, readonly: false
        )
        try database.open()
        _ = try database.executeSQL(sql: schema, transaction: false)
        directDatabases.append(database)
        return database
    }

    func pluginDatabase(_ name: String, schema: String) throws {
        let databaseName = resolved(name)
        try plugin.createConnection(databaseName, encrypted: false, mode: "no-encryption", version: 1, vUpgDict: [:], readonly: false)
        try plugin.open(databaseName, readonly: false)
        _ = try plugin.execute(databaseName, statements: schema, transaction: false, readonly: false)
        pluginNames.append(databaseName)
    }

    func pluginRun(_ name: String, _ sql: String) throws {
        _ = try plugin.run(resolved(name), statement: sql, values: [], transaction: false, readonly: false, returnMode: "no")
    }

    func pluginQuery(_ name: String, _ sql: String) throws -> [[String: Any]] {
        try plugin.query(resolved(name), statement: sql, values: [], readonly: false)
            .filter { $0["ios_columns"] == nil }
    }

    func pluginTransaction(_ name: String, operation: () throws -> Void) throws {
        let databaseName = resolved(name)
        _ = try plugin.beginTransaction(databaseName)
        do { try operation(); _ = try plugin.commitTransaction(databaseName) }
        catch { _ = try? plugin.rollbackTransaction(databaseName); throw error }
    }

    func cleanup() {
        for name in pluginNames {
            try? plugin.close(name, readonly: false)
            try? plugin.deleteDatabase(name, readonly: false)
            try? plugin.closeConnection(name, readonly: false)
        }
        for database in directDatabases {
            let name = database.dbName
            try? database.close()
            try? UtilsFile.deleteFile(fileName: name, databaseLocation: location)
        }
        pluginNames.removeAll()
        directDatabases.removeAll()
    }

    private func resolved(_ name: String) -> String { "\(name)_\(suffix)" }
}

func folioleSeedRows(_ database: Database, table: String, count: Int, bytes: Int) throws {
    _ = try database.executeSQL(sql: "BEGIN TRANSACTION", transaction: false)
    do {
        for index in 0..<count {
            let value = bytes == 0 ? "'Node \(index)'" : "zeroblob(\(bytes))"
            _ = try database.executeSQL(
                sql: "INSERT INTO \(table) VALUES ('row-\(index)', \(value))",
                transaction: false
            )
        }
        _ = try database.executeSQL(sql: "COMMIT", transaction: false)
    } catch {
        _ = try? database.executeSQL(sql: "ROLLBACK", transaction: false)
        throw error
    }
}

func folioleDirectRows(_ database: Database, _ sql: String) throws -> [[String: Any]] {
    try database.selectSQL(sql: sql, values: []).filter { $0["ios_columns"] == nil }
}

func folioleSqlString(_ value: String) -> String {
    "'\(value.replacingOccurrences(of: "'", with: "''"))'"
}
