import Foundation

final class FolioleCompanionSyncGroupSnapshot {
    private let bridge: FolioleCompanionSyncGroupDataRequesting
    private let lock = NSLock()
    private var snapshots: [String: URL] = [:]
    private var closed = false

    init(bridge: FolioleCompanionSyncGroupDataRequesting) { self.bridge = bridge }

    func refresh<T>(_ peer: String, work: (URL) throws -> T) throws -> T {
        try lock.withLock {
            try ensureOpen()
            let next = FileManager.default.temporaryDirectory
                .appendingPathComponent("cache/foliole-provider-source-\(UUID().uuidString).db")
            try FileManager.default.createDirectory(at: next.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? FileManager.default.removeItem(at: next)
            let result = try bridge.request("create_snapshot", ["target_path": next.path])
            guard result["snapshot_path"] as? String == next.path,
                  FileManager.default.fileExists(atPath: next.path) else { throw Self.invalid("sync_group_snapshot_missing") }
            do {
                let value = try work(next)
                if let previous = snapshots.updateValue(next, forKey: peer) { try? FileManager.default.removeItem(at: previous) }
                return value
            } catch {
                try? FileManager.default.removeItem(at: next)
                throw error
            }
        }
    }

    func read<T>(_ peer: String, work: (URL) throws -> T) throws -> T {
        try lock.withLock {
            try ensureOpen()
            guard let snapshot = snapshots[peer], FileManager.default.fileExists(atPath: snapshot.path) else {
                throw Self.invalid("sync_group_snapshot_missing")
            }
            return try work(snapshot)
        }
    }

    func close() {
        lock.withLock {
            closed = true
            snapshots.values.forEach { try? FileManager.default.removeItem(at: $0) }
            snapshots.removeAll()
        }
    }

    private func ensureOpen() throws {
        if closed { throw Self.invalid("sync_group_snapshot_store_closed") }
    }

    private static func invalid(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionSyncGroupSnapshot", code: 1,
                userInfo: [NSLocalizedDescriptionKey: message])
    }
}
