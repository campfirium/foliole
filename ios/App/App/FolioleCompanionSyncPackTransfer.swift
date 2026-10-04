import Foundation

enum FolioleCompanionSyncPackTransfer {
    struct ValidatedPack {
        let databaseURL: URL
        let manifest: [String: Any]
    }

    static func downloadDesktopSyncPack(
        url: String,
        headers: [String: String],
        expectedPeerId: String,
        expectedSourcePeerId: String
    ) async throws -> URL {
        try await downloadWithManifest(
            url: url, headers: headers,
            expectedPeerId: expectedPeerId, expectedSourcePeerId: expectedSourcePeerId
        ).databaseURL
    }

    static func downloadWithManifest(
        url: String, headers: [String: String],
        expectedPeerId: String, expectedSourcePeerId: String,
        method: String = "GET", body: String? = nil
    ) async throws -> ValidatedPack {
        guard method == "GET" && body == nil || method == "POST" && body != nil else {
            throw error("sync_pack_request_invalid")
        }
        guard let endpoint = URL(string: url),
              ["http", "https"].contains(endpoint.scheme?.lowercased() ?? "") else {
            throw error("Invalid sync pack URL.")
        }
        var request = URLRequest(url: endpoint)
        request.httpMethod = method
        headers.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
        let signed = try FolioleCompanionSignedClientRequests.claim(
            url: endpoint, method: method, headers: headers, body: body.map { Data($0.utf8) }
        )
        request.httpBody = signed?.body ?? body.map { Data($0.utf8) }

        let (temporaryURL, response) = try await FolioleCompanionDesktopHttpTransport.download(for: request)
        try assertPageFileSize(temporaryURL)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw error("Sync pack download returned an invalid HTTP status.")
        }
        let archiveURL = try moveDownloadToCache(temporaryURL, signed: signed, response: http)
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
    ) throws -> ValidatedPack {
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
            return ValidatedPack(databaseURL: databaseURL, manifest: prepared.manifest)
        } catch {
            try? FileManager.default.removeItem(at: databaseURL)
            throw error
        }
    }

    private static func moveDownloadToCache(
        _ temporaryURL: URL,
        signed: FolioleCompanionSignedClientRequest?,
        response: HTTPURLResponse
    ) throws -> URL {
        let destination = try cacheDirectory().appendingPathComponent("\(UUID().uuidString).syncpack")
        if let signed {
            let decrypted = try signed.decrypt(Data(contentsOf: temporaryURL), response: response).0
            guard decrypted.count <= FolioleCompanionSyncPackEnvelopeValidator.maximumTransferBytes else {
                throw error("sync_pack_transfer_limit_exceeded")
            }
            try decrypted.write(to: destination, options: .atomic)
            try? FileManager.default.removeItem(at: temporaryURL)
        } else {
            try FileManager.default.moveItem(at: temporaryURL, to: destination)
        }
        return destination
    }

    private static func assertPageFileSize(_ url: URL) throws {
        let values = try url.resourceValues(forKeys: [.fileSizeKey])
        guard let size = values.fileSize,
              size <= FolioleCompanionSyncPackEnvelopeValidator.maximumTransferBytes else {
            throw error("sync_pack_transfer_limit_exceeded")
        }
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
