import Foundation

/** Stores one authenticated, bounded archive after native envelope and SQLite validation. */
enum FolioleCompanionSyncPackReceivedArchive {
    struct Result {
        let databaseURL: URL
        let manifest: [String: Any]
    }

    static func store(_ archive: Data, expectedPeerId: String,
                      expectedSourcePeerId: String) throws -> Result {
        guard archive.count <= FolioleCompanionSyncPackEnvelopeValidator.maximumTransferBytes else {
            throw invalid("sync_pack_transfer_limit_exceeded")
        }
        let directory = try cacheDirectory()
        let archiveURL = directory.appendingPathComponent("\(UUID().uuidString).syncpack")
        try archive.write(to: archiveURL, options: .atomic)
        defer { try? FileManager.default.removeItem(at: archiveURL) }
        let contract = try FolioleCompanionContractStore().syncPackContract()
        let prepared = try FolioleCompanionSyncPackEnvelopeValidator.validate(
            archiveURL: archiveURL, contract: contract,
            expectedPeerId: expectedPeerId, expectedSourcePeerId: expectedSourcePeerId)
        let databaseURL = directory.appendingPathComponent("\(UUID().uuidString).db")
        do {
            try prepared.databaseBytes.write(to: databaseURL, options: .atomic)
            try FolioleCompanionSyncPackDatabaseValidator.validate(
                databaseURL: databaseURL, prepared: prepared, contract: contract)
            return Result(databaseURL: databaseURL, manifest: prepared.manifest)
        } catch {
            try? FileManager.default.removeItem(at: databaseURL)
            throw error
        }
    }

    private static func cacheDirectory() throws -> URL {
        guard let root = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else {
            throw invalid("sync_pack_cache_unavailable")
        }
        let directory = root.appendingPathComponent("sync-packs", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    private static func invalid(_ code: String) -> NSError {
        NSError(domain: "FolioleCompanionSyncPackReceivedArchive", code: 1,
                userInfo: [NSLocalizedDescriptionKey: code])
    }
}
