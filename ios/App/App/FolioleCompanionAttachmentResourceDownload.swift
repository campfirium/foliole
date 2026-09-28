import CryptoKit
import Foundation

struct FolioleCompanionAttachmentDownloadRequest {
    let attachmentId: String
    let contentHash: String
    let mimeType: String
    let storageKey: String
    let headers: [String: String]
    let url: String
}

struct FolioleCompanionDownloadedAttachment {
    let attachmentId: String
    let contentHash: String
    let mimeType: String
    let storageKey: String
    let temporaryURL: URL
}

enum FolioleCompanionAttachmentResourceDownloader {
    private static let rangeBytes = 1_048_576
    private static let maxEnvelopeBytes = 1_500_000

    static func download(
        _ requests: [FolioleCompanionAttachmentDownloadRequest],
        temporaryRoot: URL,
        hashPattern: String
    ) async throws -> (downloaded: [FolioleCompanionDownloadedAttachment], failedIds: [String], errors: [String: String]) {
        let expression = try NSRegularExpression(pattern: hashPattern)
        var downloaded: [FolioleCompanionDownloadedAttachment] = []
        var failedIds: [String] = []
        var errors: [String: String] = [:]
        try FileManager.default.createDirectory(at: temporaryRoot, withIntermediateDirectories: true)
        for request in requests {
            do {
                downloaded.append(try await downloadOne(request, temporaryRoot: temporaryRoot, expression: expression))
            } catch {
                failedIds.append(request.attachmentId)
                errors[request.attachmentId] = resourceFailure(error)
            }
        }
        return (downloaded, failedIds, errors)
    }

    private static func downloadOne(
        _ request: FolioleCompanionAttachmentDownloadRequest,
        temporaryRoot: URL,
        expression: NSRegularExpression
    ) async throws -> FolioleCompanionDownloadedAttachment {
        guard !request.attachmentId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              matches(request.contentHash, expression: expression),
              FolioleCompanionCanonicalAttachmentKey.matches(
                contentHash: request.contentHash, mimeType: request.mimeType, storageKey: request.storageKey
              ),
              let endpoint = URL(string: request.url),
              ["http", "https"].contains(endpoint.scheme?.lowercased() ?? "") else {
            throw invalid("Attachment download request is invalid.")
        }
        guard let signed = try FolioleCompanionSignedClientRequests.claim(
            url: endpoint, method: "GET", headers: request.headers, body: nil
        ), let deviceId = request.headers.first(where: { $0.key.lowercased() == "x-device-id" })?.value
        else { throw invalid("workgroup_client_request_not_prepared") }
        let partialURL = temporaryRoot.appendingPathComponent("\(request.contentHash).unverified")
        let first = try await receiveRange(endpoint, signed: signed, deviceId: deviceId, offset: 0)
        let total = first.total
        var offset = try preparePartial(partialURL, first: first.bytes, total: total)
        if total == 0 && !FileManager.default.fileExists(atPath: partialURL.path) {
            guard FileManager.default.createFile(atPath: partialURL.path, contents: Data()) else {
                throw invalid("protocol_error")
            }
        }
        while offset < total {
            let segment = offset == 0 ? first : try await receiveRange(
                endpoint, signed: signed, deviceId: deviceId, offset: offset
            )
            guard segment.total == total else { throw invalid("protocol_error") }
            try append(segment.bytes, to: partialURL, at: offset)
            offset += segment.bytes.count
        }
        guard try digestHex(partialURL) == request.contentHash else {
            try? FileManager.default.removeItem(at: partialURL)
            throw invalid("Attachment resource hash mismatch.")
        }
        let outputURL = temporaryRoot.appendingPathComponent(UUID().uuidString, isDirectory: true)
            .appendingPathComponent(request.contentHash)
        try FileManager.default.createDirectory(at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try FileManager.default.moveItem(at: partialURL, to: outputURL)
        return FolioleCompanionDownloadedAttachment(
            attachmentId: request.attachmentId,
            contentHash: request.contentHash,
            mimeType: request.mimeType,
            storageKey: request.storageKey,
            temporaryURL: outputURL
        )
    }

    private static func receiveRange(
        _ endpoint: URL, signed: FolioleCompanionSignedClientRequest,
        deviceId: String, offset: Int
    ) async throws -> (bytes: Data, total: Int) {
        guard var parts = URLComponents(url: endpoint, resolvingAgainstBaseURL: false) else {
            throw invalid("protocol_error")
        }
        let existing = parts.queryItems ?? []
        parts.queryItems = existing + [
            URLQueryItem(name: "offset", value: String(offset)),
            URLQueryItem(name: "length", value: String(rangeBytes))
        ]
        guard let url = parts.url else { throw invalid("protocol_error") }
        let signedRange = signed.signedRange(url, deviceId: deviceId)
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 60
        signedRange.headers.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
        let (source, response) = try await FolioleCompanionDesktopHttpTransport.download(for: request)
        defer { try? FileManager.default.removeItem(at: source) }
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              let value = http.value(forHTTPHeaderField: "X-Foliole-Resource-Total-Bytes"),
              let total = Int(value), (total > offset || total == 0 && offset == 0),
              ((try source.resourceValues(forKeys: [.fileSizeKey])).fileSize ?? Int.max) <= maxEnvelopeBytes
        else { throw invalid("protocol_error") }
        let bytes = try autoreleasepool {
            try signedRange.context.decrypt(Data(contentsOf: source), response: http).0
        }
        guard bytes.count == min(rangeBytes, total - offset) else { throw invalid("protocol_error") }
        return (bytes, total)
    }

    private static func preparePartial(_ url: URL, first: Data, total: Int) throws -> Int {
        guard FileManager.default.fileExists(atPath: url.path) else { return 0 }
        let file = try FileHandle(forUpdating: url)
        defer { try? file.close() }
        let oldSize = Int(try file.seekToEnd())
        let complete = oldSize == total ? total : oldSize / rangeBytes * rangeBytes
        if complete > total { try file.truncate(atOffset: 0); return 0 }
        try file.truncate(atOffset: UInt64(complete))
        if complete > 0 {
            try file.seek(toOffset: 0)
            if try file.read(upToCount: first.count) != first {
                try file.truncate(atOffset: 0)
                return 0
            }
        }
        return complete
    }

    private static func append(_ bytes: Data, to url: URL, at offset: Int) throws {
        if !FileManager.default.fileExists(atPath: url.path) {
            guard FileManager.default.createFile(atPath: url.path, contents: nil) else {
                throw invalid("protocol_error")
            }
        }
        let file = try FileHandle(forWritingTo: url)
        defer { try? file.close() }
        guard try file.seekToEnd() == UInt64(offset) else { throw invalid("protocol_error") }
        try file.write(contentsOf: bytes)
        try file.synchronize()
    }

    static func digestHex(_ url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var digest = SHA256()
        while let chunk = try handle.read(upToCount: 1_048_576), !chunk.isEmpty { digest.update(data: chunk) }
        return digest.finalize().map { String(format: "%02x", $0) }.joined()
    }

    private static func resourceFailure(_ error: Error) -> String {
        let message = error.localizedDescription
        if ["missing_file", "authentication_failed", "protocol_error"].contains(message) { return message }
        if message.contains("hash mismatch") { return "checksum_mismatch" }
        if message.contains("aead") || message.contains("signature") { return "authentication_failed" }
        if (error as NSError).domain == NSURLErrorDomain { return "network_error" }
        return "protocol_error"
    }

    private static func matches(_ value: String, expression: NSRegularExpression) -> Bool {
        let range = NSRange(value.startIndex..<value.endIndex, in: value)
        return expression.firstMatch(in: value, range: range)?.range == range
    }

    private static func invalid(_ message: String) -> NSError {
        NSError(domain: "FolioleAttachmentResourceDownload", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}

actor FolioleCompanionAttachmentResourceSessions {
    struct Batch {
        let downloaded: [FolioleCompanionDownloadedAttachment]
        let failedIds: [String]
    }

    private var batches: [String: Batch] = [:]
    private var committedIds: [String: [String]] = [:]
    private var stagedCreatedURLs: [String: [URL]] = [:]
    private var stagedManifests: [String: [[String: Any]]] = [:]

    func create(downloaded: [FolioleCompanionDownloadedAttachment], failedIds: [String]) -> String {
        let token = UUID().uuidString
        batches[token] = Batch(downloaded: downloaded, failedIds: failedIds)
        return token
    }

    func load(_ token: String) -> Batch? { batches[token] }
    func committed(_ token: String) -> [String]? { committedIds[token] }
    func staged(_ token: String) -> [[String: Any]]? { stagedManifests[token] }
    func markStaged(_ token: String, result: FolioleCompanionAttachmentFileStage.Result) {
        stagedCreatedURLs[token] = result.createdURLs
        stagedManifests[token] = result.manifest
    }
    func finish(_ token: String, committed: Bool) {
        if !committed { FolioleCompanionAttachmentFileStage.discard(stagedCreatedURLs[token] ?? []) }
        batches[token] = nil
        stagedCreatedURLs[token] = nil
        stagedManifests[token] = nil
    }
    func markCommitted(_ token: String, ids: [String]) {
        committedIds[token] = ids
        batches[token] = nil
    }
}
