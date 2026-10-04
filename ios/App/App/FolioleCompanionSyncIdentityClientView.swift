import Foundation

/** Owns fixed local source snapshots used by the companion as a sync client. */
final class FolioleCompanionSyncIdentityClientView {
    private let lock = NSLock()
    private var views: [String: String] = [:]

    func create(bridge: FolioleCompanionSyncGroupDataRequesting) throws -> [String: Any] {
        let viewId = UUID().uuidString.lowercased()
        let snapshot = FileManager.default.temporaryDirectory
            .appendingPathComponent("cache/foliole-provider-source-\(viewId).db")
        try FileManager.default.createDirectory(at: snapshot.deletingLastPathComponent(),
                                                withIntermediateDirectories: true)
        do {
            let result = try bridge.request("create_snapshot", [
                "target_path": snapshot.path, "identity_index": true
            ])
            guard result["snapshot_path"] as? String == snapshot.path,
                  FileManager.default.fileExists(atPath: snapshot.path) else {
                throw invalid("sync_identity_source_view_unavailable")
            }
            lock.withLock { views[snapshot.path] = viewId }
            return ["snapshot_path": snapshot.path, "source_view_id": viewId]
        } catch {
            try? FileManager.default.removeItem(at: snapshot)
            throw error
        }
    }

    func build(path: String, page: [String: Any],
               bridge: FolioleCompanionSyncGroupDataRequesting) throws -> [String: Any] {
        guard let viewId = lock.withLock({ views[path] }),
              FileManager.default.fileExists(atPath: path),
              let targetId = page["target_peer_id"] as? String else {
            throw invalid("sync_identity_source_view_unavailable")
        }
        _ = try bridge.request("prepare_identity_pack", [
            "snapshot_path": path, "source_view_id": viewId,
            "authenticated_device_id": targetId, "page": page
        ])
        let archive = try FolioleCompanionSyncIdentityPackBuilder.build(
            snapshot: URL(fileURLWithPath: path), page: page)
        let encoded = archive.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        return ["archive_base64url": encoded]
    }

    func close(path: String) throws -> [String: Any] {
        guard lock.withLock({ views.removeValue(forKey: path) }) != nil else {
            throw invalid("sync_identity_source_view_unavailable")
        }
        if FileManager.default.fileExists(atPath: path) {
            try FileManager.default.removeItem(atPath: path)
        }
        return ["deleted": true]
    }

    func closeAll() {
        let paths = lock.withLock { let current = Array(views.keys); views.removeAll(); return current }
        paths.forEach { try? FileManager.default.removeItem(atPath: $0) }
    }

    private func invalid(_ code: String) -> NSError {
        NSError(domain: "FolioleCompanionSyncIdentityClientView", code: 1,
                userInfo: [NSLocalizedDescriptionKey: code])
    }
}
