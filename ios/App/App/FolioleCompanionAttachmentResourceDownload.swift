import CryptoKit
import Foundation

struct FolioleCompanionAttachmentDownloadRequest {
    let attachmentId: String
    let contentHash: String
    let headers: [String: String]
    let url: String
}

struct FolioleCompanionDownloadedAttachment {
    let attachmentId: String
    let contentHash: String
    let temporaryURL: URL
}

enum FolioleCompanionAttachmentResourceDownloader {
    static func download(
        _ requests: [FolioleCompanionAttachmentDownloadRequest],
        temporaryRoot: URL,
        hashPattern: String
    ) async throws -> (downloaded: [FolioleCompanionDownloadedAttachment], failedIds: [String]) {
        let expression = try NSRegularExpression(pattern: hashPattern)
        var downloaded: [FolioleCompanionDownloadedAttachment] = []
        var failedIds: [String] = []
        try FileManager.default.createDirectory(at: temporaryRoot, withIntermediateDirectories: true)
        for request in requests {
            do {
                downloaded.append(try await downloadOne(request, temporaryRoot: temporaryRoot, expression: expression))
            } catch {
                failedIds.append(request.attachmentId)
            }
        }
        return (downloaded, failedIds)
    }

    private static func downloadOne(
        _ request: FolioleCompanionAttachmentDownloadRequest,
        temporaryRoot: URL,
        expression: NSRegularExpression
    ) async throws -> FolioleCompanionDownloadedAttachment {
        guard !request.attachmentId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              matches(request.contentHash, expression: expression),
              let endpoint = URL(string: request.url),
              ["http", "https"].contains(endpoint.scheme?.lowercased() ?? "") else {
            throw invalid("Attachment download request is invalid.")
        }
        var urlRequest = URLRequest(url: endpoint)
        urlRequest.httpMethod = "GET"
        urlRequest.timeoutInterval = 60
        request.headers.forEach { urlRequest.setValue($0.value, forHTTPHeaderField: $0.key) }
        let (sourceURL, response) = try await FolioleCompanionDesktopHttpTransport.download(for: urlRequest)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw invalid("Desktop attachment response failed.")
        }
        let outputURL = temporaryRoot.appendingPathComponent(UUID().uuidString, isDirectory: true)
            .appendingPathComponent(request.contentHash)
        try FileManager.default.createDirectory(at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try FileManager.default.moveItem(at: sourceURL, to: outputURL)
        guard try digestHex(outputURL) == request.contentHash else {
            try? FileManager.default.removeItem(at: outputURL)
            throw invalid("Attachment resource hash mismatch.")
        }
        return FolioleCompanionDownloadedAttachment(
            attachmentId: request.attachmentId,
            contentHash: request.contentHash,
            temporaryURL: outputURL
        )
    }

    static func digestHex(_ url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var digest = SHA256()
        while let chunk = try handle.read(upToCount: 1_048_576), !chunk.isEmpty { digest.update(data: chunk) }
        return digest.finalize().map { String(format: "%02x", $0) }.joined()
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
