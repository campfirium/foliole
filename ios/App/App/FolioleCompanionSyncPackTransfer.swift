import Foundation

enum FolioleCompanionSyncPackTransfer {
    static func downloadDesktopSyncPack(
        url: String,
        headers: [String: String],
        expectedPeerId: String,
        expectedSourcePeerId: String
    ) async throws -> URL {
        guard let endpoint = URL(string: url),
              ["http", "https"].contains(endpoint.scheme?.lowercased() ?? "") else {
            throw error("Invalid sync pack URL.")
        }
        var request = URLRequest(url: endpoint)
        request.httpMethod = "GET"
        headers.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }

        let (temporaryURL, response) = try await FolioleCompanionDesktopHttpTransport.download(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw error("Sync pack download returned an invalid HTTP status.")
        }
        let archiveURL = try moveDownloadToCache(temporaryURL)
        defer { try? FileManager.default.removeItem(at: archiveURL) }
        do {
            return try validateAndStore(
                archiveURL,
                expectedPeerId: expectedPeerId,
                expectedSourcePeerId: expectedSourcePeerId
            )
        } catch {
            throw acceptanceArchiveFailure(error, archiveURL: archiveURL)
        }
    }

    static func deleteDownloadedSyncPack(path: String) throws -> Bool {
        let fileManager = FileManager.default
        let directory = try cacheDirectory(fileManager: fileManager).standardizedFileURL
        let file = URL(fileURLWithPath: path).standardizedFileURL
        guard file.deletingLastPathComponent() == directory, file.pathExtension == "db" else {
            throw error("pack_path is outside the sync pack cache.")
        }
        guard fileManager.fileExists(atPath: file.path) else { return true }
        try fileManager.removeItem(at: file)
        return true
    }

    private static func validateAndStore(
        _ archiveURL: URL,
        expectedPeerId: String,
        expectedSourcePeerId: String
    ) throws -> URL {
        let store = try FolioleCompanionContractStore()
        let contract = try store.syncPackContract()
        let prepared = try FolioleCompanionSyncPackEnvelopeValidator.validate(
            archiveURL: archiveURL,
            contract: contract,
            expectedPeerId: expectedPeerId,
            expectedSourcePeerId: expectedSourcePeerId
        )
        let databaseURL = try cacheDirectory().appendingPathComponent("\(UUID().uuidString).db")
        do {
            try prepared.databaseBytes.write(to: databaseURL, options: .atomic)
            try FolioleCompanionSyncPackDatabaseValidator.validate(
                databaseURL: databaseURL,
                prepared: prepared,
                contract: contract
            )
            return databaseURL
        } catch {
            try? FileManager.default.removeItem(at: databaseURL)
            throw error
        }
    }

    private static func moveDownloadToCache(_ temporaryURL: URL) throws -> URL {
        let destination = try cacheDirectory().appendingPathComponent("\(UUID().uuidString).syncpack")
        try FileManager.default.moveItem(at: temporaryURL, to: destination)
        return destination
    }

    private static func cacheDirectory(fileManager: FileManager = .default) throws -> URL {
        guard let root = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first else {
            throw error("Sync pack cache is unavailable.")
        }
        let directory = root.appendingPathComponent("sync-packs", isDirectory: true)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    private static func error(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionSyncPackTransfer", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }

    private static func acceptanceArchiveFailure(_ error: Error, archiveURL: URL) -> Error {
#if FOLIOLE_IOS_BRIDGE_ACCEPTANCE && targetEnvironment(simulator)
        let data = try? Data(contentsOf: archiveURL)
        let tail = data?.suffix(22).map { String(format: "%02x", $0) }.joined() ?? "unreadable"
        return NSError(
            domain: "FolioleCompanionSyncPackAcceptance",
            code: 1,
            userInfo: [
                NSLocalizedDescriptionKey: "archive_bytes=\(data?.count ?? -1) archive_tail=\(tail)",
                NSUnderlyingErrorKey: error
            ]
        )
#else
        return error
#endif
    }
}
