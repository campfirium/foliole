import CryptoKit
import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncResourceOutboundTests: XCTestCase {
    func testPreparedResourceUsesStorageKeyInsteadOfInlineText() throws {
        let resource = Data([1, 2, 3])
        let fact = makeFact(resource)
        var message = Foliole_Sync_V22_ProtocolMessage(); message.payload = .fact(fact)
        let bytes = try FolioleFramedSyncCodec.encode(try FolioleFramedSyncCodec.validateOutbound(
            message, authenticatedFrameType: FolioleFramedSyncFrameType.fact.rawValue
        ))
        let hash = Data(SHA256.hash(data: resource)).map { String(format: "%02x", $0) }.joined()
        let key = hash + ".png"
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: file) }
        try resource.write(to: file)
        let identity = Data(repeating: 9, count: 32).map { String(format: "%02x", $0) }.joined()
        let value: [String: Any] = [
            "blobs": [["byte_length": "3", "required": true, "role": 2,
                       "sha256": hash, "storage_key": key]],
            "content_id": identity, "fact_message_bytes_list": [Array(bytes)],
            "manifest_hash": identity, "transfer_id": identity
        ]

        let prepared = try FolioleCompanionFramedSyncPreparedOutbound.decode(
            value, resourceFiles: [key: file]
        )
        guard case .file(let decoded) = prepared.blobs[0].source else {
            return XCTFail("Expected a file-backed resource")
        }
        XCTAssertEqual(decoded, file)
        XCTAssertThrowsError(try FolioleCompanionFramedSyncPreparedOutbound.decode(value))
    }

    func testLargeResourceStreamsFromFileAndReplaysWithoutSQLitePayloads() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-ios-resource-outbound-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let resource = Data((0..<(512 * 1024 + 37)).map { UInt8($0 % 251) })
        let resourceURL = directory.appendingPathComponent("resource.png")
        try resource.write(to: resourceURL)
        let fact = makeFact(resource)
        let database = try FolioleFramedSyncTransferDatabase(
            url: directory.appendingPathComponent("outbound.db")
        )
        let staging = try FolioleFramedSyncOutboundSQLite(database: database)
        let key = Data(SHA256.hash(data: resource))
        let attempt = try FolioleFramedSyncTransferWriter.prepare(
            groupKey: Data(repeating: 0, count: 32), context: context(), facts: [fact],
            blobs: [.init(reference: fact.blobs[0], source: .file(resourceURL))], staging: staging
        )
        let requestURL = directory.appendingPathComponent("request.bin")
        try replay(attempt, staging: staging, to: requestURL)
        let replayURL = directory.appendingPathComponent("replay.bin")
        let reopened = try FolioleFramedSyncOutboundSQLite(
            database: try .init(url: directory.appendingPathComponent("outbound.db"))
        )
        try replay(attempt, staging: reopened, to: replayURL)

        XCTAssertEqual(try Data(contentsOf: requestURL), try Data(contentsOf: replayURL))
        XCTAssertEqual(try database.rows("SELECT COUNT(*) FROM framed_sync_ios_outbound_frames")
            .first?[0] as? Int, 0)
        let rows = try database.rows("""
            SELECT ciphertext_length, length(ciphertext_sha256), length(plaintext_sha256)
            FROM framed_sync_ios_outbound_file_frames ORDER BY length(sequence), sequence
            """)
        XCTAssertTrue(rows.allSatisfy { ($0[0] as? Int ?? 0) <= 512 * 1024 + 256 })
        XCTAssertTrue(rows.allSatisfy { $0[1] as? Int == 32 && $0[2] as? Int == 32 })
        XCTAssertEqual(try reconstructedBlob(requestURL, hash: key), resource)
    }

    private func replay(
        _ attempt: FolioleFramedSyncOutboundAttempt,
        staging: FolioleFramedSyncOutboundStaging, to url: URL
    ) throws {
        let output = try XCTUnwrap(OutputStream(url: url, append: false))
        try FolioleFramedSyncTransferWriter.replay(attempt, staging: staging, output: output)
    }

    private func reconstructedBlob(_ url: URL, hash: Data) throws -> Data {
        let input = try XCTUnwrap(InputStream(url: url))
        let reader = FolioleFramedSyncStreamReader(input: input)
        let preamble = try reader.nextPreamble()
        var sequence: UInt64 = 0, result = Data()
        while let frame = try reader.nextFrame() {
            let plaintext = try FolioleFramedSyncFrameCrypto.decrypt(
                groupKey: Data(repeating: 0, count: 32), preamble: preamble,
                frame: frame, expectedSequence: sequence
            )
            let message = try FolioleFramedSyncCodec.decode(
                plaintext, authenticatedFrameType: frame.header.frameType.rawValue
            )
            if case .blobChunk(let chunk) = message.payload, chunk.blobHash == hash {
                XCTAssertEqual(chunk.offset, UInt64(result.count))
                XCTAssertLessThanOrEqual(chunk.data.count, 512 * 1024)
                result.append(chunk.data)
            }
            sequence += 1
        }
        return result
    }

    private func makeFact(_ resource: Data) -> Foliole_Sync_V22_FactRecord {
        var blob = Foliole_Sync_V22_BlobReference()
        blob.sha256 = Data(SHA256.hash(data: resource)); blob.byteLength = UInt64(resource.count)
        blob.role = .image; blob.required = true
        var identity = Foliole_Sync_V22_FactIdentity()
        identity.kind = .nodeVersion; identity.objectType = "node"
        identity.globalID = "node-1"; identity.factID = "version-1"
        var fact = Foliole_Sync_V22_FactRecord()
        fact.identity = identity; fact.sharedStateHash = Data(repeating: 1, count: 32)
        fact.body = .init(); fact.blobs = [blob]
        return fact
    }

    private func context() -> FolioleFramedSyncTransferContext {
        .init(groupID: "group", senderDeviceID: "sender", senderLibraryEpoch: "sender-epoch",
              receiverDeviceID: "receiver", receiverLibraryEpoch: "receiver-epoch")
    }
}
