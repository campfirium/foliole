import Foundation

enum FolioleCompanionSyncPackFactProvider {
    static func index(snapshot: URL, from: Int, requestedFrontier: Int?,
                      requestedEpoch: String?) throws -> [String: Any] {
        let source = try FolioleCompanionSyncPackSQLite(url: snapshot, create: false)
        let state = try source.namedRows(
            "SELECT high_water, source_epoch FROM sync_state_sequence WHERE singleton_id = 1"
        )
        guard let highWater = state.first?["high_water"] as? Int,
              let epoch = state.first?["source_epoch"] as? String else {
            throw invalid("sync_pack_source_epoch_missing")
        }
        let frontier = requestedFrontier ?? highWater
        guard from >= 0, frontier >= from, frontier <= highWater else {
            throw invalid("sync_pack_frontier_unavailable")
        }
        guard requestedEpoch == nil || requestedEpoch == epoch else {
            throw invalid("sync_pack_source_epoch_changed")
        }
        let to = try source.namedRows("SELECT state_seq FROM sync_object_state " +
            "WHERE state_seq > \(from) AND state_seq <= \(frontier) ORDER BY state_seq LIMIT 1")
            .first?["state_seq"] as? Int ?? frontier
        let file = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-fact-index-\(UUID().uuidString).db")
        defer { try? FileManager.default.removeItem(at: file) }
        let definitions = try FolioleCompanionSyncPackProviderDefinitions.load()
        try definitions.validate()
        try FolioleCompanionSyncPackProvider.createDatabase(file, snapshot, definitions,
            from, to, frontier, epoch, UUID().uuidString.lowercased())
        return try FolioleCompanionSyncPackFactIndex.read(
            FolioleCompanionSyncPackSQLite(url: file, create: false),
            from: from, to: to, frontier: frontier, epoch: epoch
        )
    }

    private static func invalid(_ message: String) -> NSError {
        NSError(domain: message, code: 1)
    }
}
