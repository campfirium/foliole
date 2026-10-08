import Capacitor
import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

extension FolioleCompanionSyncPlugin {
    func framedPost(
        endpoint: String, path: String, peer: FolioleFramedSyncHTTPPeer, body: Data, owner: FolioleFramedSyncPayloadBudget,
        requestLoan: FolioleFramedSyncPayloadBudget.Loan
    ) async throws {
        try await withFramedPostResponseFile(
            endpoint: endpoint, path: path, peer: peer, body: body, owner: owner, responseLane: .receipt, requestLoan: requestLoan
        ) { url in
            try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .inbound, lane: .receipt) { _ in
                let size = try FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber
                guard let size, size.intValue <= 1_048_576 + FolioleFramedSyncPreamble.byteCount + FolioleFramedSyncWireHeader.byteCount else {
                    throw self.invalid("framed_sync_receipt_limit_exceeded")
                }
            }
        }
    }

    func withFramedPostResponseFile<T>(
        endpoint: String, path: String, peer: FolioleFramedSyncHTTPPeer, body: Data, owner: FolioleFramedSyncPayloadBudget,
        responseLane: FolioleFramedSyncPayloadBudget.Lane = .payload, requestLoan: FolioleFramedSyncPayloadBudget.Loan? = nil, consume: @escaping (URL) throws -> T
    ) async throws -> T {
        guard let base = URL(string: endpoint), let url = URL(string: path, relativeTo: base) else {
            throw invalid("framed_sync_endpoint_invalid")
        }
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-framed-outbound-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let requestURL = directory.appendingPathComponent("request.bin")
        let responseURL = directory.appendingPathComponent("response.bin")
        try body.write(to: requestURL, options: .atomic)
        _ = try await FolioleFramedSyncHTTPTransport.post(
            endpoint: url.absoluteURL, peer: peer,
            requestBodyURL: requestURL, responseBodyURL: responseURL, owner: owner, responseLane: responseLane, requestLoan: requestLoan
        )
        return try await FolioleFramedSyncPayloadWorker.run { try consume(responseURL) }
    }

    func framedHeaders(
        groupID: String, deviceID: String, workgroupKey: String, path: String, body: Data
    ) -> [String: String] {
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let nonce = UUID().uuidString.lowercased()
        let digest = Data(SHA256.hash(data: body)).hex
        let canonical = ["POST", path, timestamp, nonce, digest].joined(separator: "\n")
        let signature = HMAC<SHA256>.authenticationCode(
            for: Data(canonical.utf8), using: SymmetricKey(data: Data(workgroupKey.utf8))
        ).map { String(format: "%02x", $0) }.joined()
        return ["X-Device-Id": deviceID, "X-Nonce": nonce, "X-Signature": signature,
                "X-Timestamp": timestamp, "X-Sync-Group-Id": groupID,
                "X-Foliole-Body-Sha256": digest]
    }

    func framedHeaders(
        groupID: String, deviceID: String, workgroupKey: String, path: String, bodyURL: URL, owner: FolioleFramedSyncPayloadBudget
    ) throws -> [String: String] {
        let handle = try FileHandle(forReadingFrom: bodyURL)
        defer { try? handle.close() }
        var hasher = SHA256()
        while try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .outbound, { _ in
            guard let chunk = try handle.read(upToCount: 64 * 1024), !chunk.isEmpty else { return false }
            hasher.update(data: chunk); return true
        }) {}
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let nonce = UUID().uuidString.lowercased()
        let digest = Data(hasher.finalize()).hex
        let canonical = ["POST", path, timestamp, nonce, digest].joined(separator: "\n")
        let signature = HMAC<SHA256>.authenticationCode(
            for: Data(canonical.utf8), using: SymmetricKey(data: Data(workgroupKey.utf8))
        ).map { String(format: "%02x", $0) }.joined()
        return ["X-Device-Id": deviceID, "X-Nonce": nonce, "X-Signature": signature,
                "X-Timestamp": timestamp, "X-Sync-Group-Id": groupID,
                "X-Foliole-Body-Sha256": digest]
    }

    func withFramedPostResponseFile<T>(
        endpoint: String, path: String, peer: FolioleFramedSyncHTTPPeer, bodyURL: URL, owner: FolioleFramedSyncPayloadBudget,
        responseLane: FolioleFramedSyncPayloadBudget.Lane = .payload, requestLoan: FolioleFramedSyncPayloadBudget.Loan? = nil, consume: @escaping (URL) throws -> T
    ) async throws -> T {
        guard let base = URL(string: endpoint), let url = URL(string: path, relativeTo: base) else {
            throw invalid("framed_sync_endpoint_invalid")
        }
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-framed-response-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let responseURL = directory.appendingPathComponent("response.bin")
        _ = try await FolioleFramedSyncHTTPTransport.post(endpoint: url.absoluteURL, peer: peer,
            requestBodyURL: bodyURL, responseBodyURL: responseURL, owner: owner, responseLane: responseLane, requestLoan: requestLoan)
        return try await FolioleFramedSyncPayloadWorker.run { try consume(responseURL) }
    }
}
