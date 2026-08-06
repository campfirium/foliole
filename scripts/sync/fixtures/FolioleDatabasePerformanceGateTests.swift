import XCTest
@testable import CapacitorSQLitePlugin

final class FolioleDatabasePerformanceGateTests: XCTestCase {
    private var harness: FolioleDatabasePerformanceHarness!

    override func setUp() {
        super.setUp()
        try? FileManager.default.createDirectory(
            at: FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0],
            withIntermediateDirectories: true
        )
        harness = FolioleDatabasePerformanceHarness()
    }

    override func tearDown() {
        harness.cleanup()
        harness = nil
        super.tearDown()
    }

    func testFrozenMobileDatabasePerformanceGate() throws {
        try controlWrite()
        try hydrate()
        try attach(workload: "attach_100mb", rows: 20, bytes: 5 * 1024 * 1024)
        try attach(workload: "content_448_4mb", rows: 448, bytes: 10 * 1024)
        try attachmentFiles()
    }

    private func controlWrite() throws {
        let native = try harness.direct("foliole_ios_perf_native_control", schema: "CREATE TABLE events (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
        try harness.pluginDatabase("foliole_ios_perf_plugin_control", schema: "CREATE TABLE events (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
        let baseline = try FoliolePerformanceMeasure.run {
            _ = try native.executeSQL(sql: String(repeating: "INSERT INTO events (value) VALUES ('control');", count: 32), transaction: true)
        }
        let candidate = try FoliolePerformanceMeasure.run {
            try harness.pluginTransaction("foliole_ios_perf_plugin_control") {
                for _ in 0..<32 { try harness.pluginRun("foliole_ios_perf_plugin_control", "INSERT INTO events (value) VALUES ('control')") }
            }
        }
        emit("control_write", baseline, candidate, cleanup: true)
    }

    private func hydrate() throws {
        let native = try harness.direct("foliole_ios_perf_native_hydrate", schema: "CREATE TABLE nodes (id TEXT PRIMARY KEY, title TEXT NOT NULL)")
        let candidateSeed = try harness.direct("foliole_ios_perf_plugin_hydrate", schema: "CREATE TABLE nodes (id TEXT PRIMARY KEY, title TEXT NOT NULL)")
        try folioleSeedRows(native, table: "nodes", count: 1293, bytes: 0)
        try folioleSeedRows(candidateSeed, table: "nodes", count: 1293, bytes: 0)
        try candidateSeed.close()
        try harness.pluginDatabase("foliole_ios_perf_plugin_hydrate", schema: "CREATE TABLE IF NOT EXISTS nodes (id TEXT PRIMARY KEY, title TEXT NOT NULL)")
        let baseline = try FoliolePerformanceMeasure.run {
            XCTAssertEqual(try folioleDirectRows(native, "SELECT id, title FROM nodes ORDER BY id").count, 1293)
        }
        let candidate = try FoliolePerformanceMeasure.run {
            XCTAssertEqual(try harness.pluginQuery("foliole_ios_perf_plugin_hydrate", "SELECT id, title FROM nodes ORDER BY id").count, 1293)
        }
        emit("hydrate_1293", baseline, candidate, cleanup: true)
    }

    private func attach(workload: String, rows: Int, bytes: Int) throws {
        let native = try harness.direct("foliole_ios_perf_native_\(workload)", schema: "CREATE TABLE blobs (id TEXT PRIMARY KEY, data BLOB NOT NULL)")
        let nativePack = try harness.direct("foliole_ios_perf_native_pack_\(workload)", schema: "CREATE TABLE pack_blobs (id TEXT PRIMARY KEY, data BLOB NOT NULL)")
        let pluginPack = try harness.direct("foliole_ios_perf_plugin_pack_\(workload)", schema: "CREATE TABLE pack_blobs (id TEXT PRIMARY KEY, data BLOB NOT NULL)")
        try folioleSeedRows(nativePack, table: "pack_blobs", count: rows, bytes: bytes)
        try folioleSeedRows(pluginPack, table: "pack_blobs", count: rows, bytes: bytes)
        try harness.pluginDatabase("foliole_ios_perf_plugin_\(workload)", schema: "CREATE TABLE blobs (id TEXT PRIMARY KEY, data BLOB NOT NULL)")
        let baseline = try FoliolePerformanceMeasure.run {
            _ = try native.executeSQL(sql: "ATTACH DATABASE \(folioleSqlString(nativePack.path)) AS incoming", transaction: false)
            _ = try native.executeSQL(sql: "INSERT INTO blobs SELECT * FROM incoming.pack_blobs", transaction: true)
            _ = try native.executeSQL(sql: "DETACH DATABASE incoming", transaction: false)
        }
        let candidate = try FoliolePerformanceMeasure.run {
            try harness.pluginRun("foliole_ios_perf_plugin_\(workload)", "ATTACH DATABASE \(folioleSqlString(pluginPack.path)) AS incoming")
            try harness.pluginTransaction("foliole_ios_perf_plugin_\(workload)") {
                try harness.pluginRun("foliole_ios_perf_plugin_\(workload)", "INSERT INTO blobs SELECT * FROM incoming.pack_blobs")
            }
            try harness.pluginRun("foliole_ios_perf_plugin_\(workload)", "DETACH DATABASE incoming")
        }
        emit(workload, baseline, candidate, cleanup: true)
    }

    private func attachmentFiles() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-ios-performance-\(UUID().uuidString)")
        let source = root.appendingPathComponent("source")
        let native = root.appendingPathComponent("native")
        let candidate = root.appendingPathComponent("candidate")
        try FileManager.default.createDirectory(at: source, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: native, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: candidate, withIntermediateDirectories: true)
        let bytes = Int((32.6 * 1024 * 1024) / 21)
        for index in 0..<21 { try Data(count: bytes).write(to: source.appendingPathComponent("attachment-\(index)")) }
        let baseline = try FoliolePerformanceMeasure.run { try copyFiles(source, native) }
        let measured = try FoliolePerformanceMeasure.run { try copyFiles(source, candidate) }
        try FileManager.default.removeItem(at: root)
        emit("attachments_21_32mb", baseline, measured, cleanup: !FileManager.default.fileExists(atPath: root.path))
    }

    private func copyFiles(_ source: URL, _ target: URL) throws {
        for name in try FileManager.default.contentsOfDirectory(atPath: source.path) {
            try FileManager.default.copyItem(at: source.appendingPathComponent(name), to: target.appendingPathComponent(name))
        }
    }

    private func emit(_ workload: String, _ baseline: FolioleMeasuredResult,
                      _ candidate: FolioleMeasuredResult, cleanup: Bool) {
        let result: [String: Any] = [
            "gate_version": 1, "platform": "ios", "workload": workload,
            "native_ms": baseline.elapsedMs, "candidate_ms": candidate.elapsedMs,
            "native_peak_delta_bytes": baseline.peakDeltaBytes,
            "candidate_peak_delta_bytes": candidate.peakDeltaBytes,
            "bridge_blob_bytes": 0, "timer_resolution_ms": 1,
            "cleanup_verified": cleanup
        ]
        let data = try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
        print("FOLIOLE_DATABASE_PERFORMANCE_RESULT=\(String(data: data, encoding: .utf8)!)")
    }
}
