import CryptoKit
import Foundation
import XCTest
import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncFrozenBodySpoolTests: XCTestCase {
    func testUnicodeBOMAndNULBytesAreSpooledExactlyThroughOneCompleteRead() throws {
        try withDirectory { directory in
            var body = Data([0xef, 0xbb, 0xbf, 0])
            body.append(Data(String(repeating: "🌿\n\0", count: 100_000).utf8))
            var reads = 0
            let file = try FolioleFramedSyncFrozenBodySpool.write(reference: reference(body), directory: directory) {
                reads += 1
                return body
            }
            XCTAssertEqual(reads, 1)
            XCTAssertEqual(try Data(contentsOf: file), body)
            XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: directory.path), [reference(body).sha256.hex])
        }
    }

    func testEmptyBodyReadsItsFrozenOwnerAndVerifiesTheEmptyHash() throws {
        try withDirectory { directory in
            var reads = 0
            let file = try FolioleFramedSyncFrozenBodySpool.write(reference: reference(Data()), directory: directory) {
                reads += 1
                return Data()
            }
            XCTAssertEqual(reads, 1)
            XCTAssertEqual(try Data(contentsOf: file), Data())
        }
        try withDirectory { directory in
            var invalid = reference(Data())
            invalid.sha256 = Data(repeating: 1, count: 32)
            XCTAssertThrowsError(try FolioleFramedSyncFrozenBodySpool.write(reference: invalid, directory: directory) { Data() })
            XCTAssertTrue(try FileManager.default.contentsOfDirectory(atPath: directory.path).isEmpty)
        }
    }

    func testWrongHashTruncatedOversizedAndThrownReadDeleteOnlyTheirPartial() throws {
        for mode in 0..<4 {
            try withDirectory { directory in
                let retained = directory.appendingPathComponent("retained")
                try Data([9]).write(to: retained)
                let body = Data(repeating: 3, count: 524_289)
                XCTAssertThrowsError(try FolioleFramedSyncFrozenBodySpool.write(reference: reference(body), directory: directory) {
                    if mode == 3 { throw NSError(domain: "body-test", code: 1) }
                    return Data(repeating: mode == 0 ? 4 : 3,
                                count: mode == 1 ? body.count - 1 : mode == 2 ? body.count + 1 : body.count)
                })
                XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: directory.path), ["retained"])
                XCTAssertEqual(try Data(contentsOf: retained), Data([9]))
            }
        }
        try withDirectory { directory in
            var tooLarge = reference(Data())
            tooLarge.byteLength = 1_048_577
            XCTAssertThrowsError(try FolioleFramedSyncFrozenBodySpool.write(reference: tooLarge, directory: directory) {
                XCTFail("Reject before requesting oversized bytes")
                return Data()
            })
        }
    }

    func testPreparedFrozenSourcesResolveFilesOnlyForBodyRoles() throws {
        for role in [Foliole_Sync_V22_BlobRole.nodeBody, .externalDocument] {
            var blob = reference(Data([1, 2, 3]))
            blob.role = role
            let value = try preparedValue(blob, source: ["body_source": "frozen_body"])
            let file = URL(fileURLWithPath: "/frozen-body")
            var resolved = 0
            let prepared = try FolioleCompanionFramedSyncPreparedOutbound.decode(value, frozenBodyFile: { reference in
                XCTAssertEqual(reference, blob)
                resolved += 1
                return file
            })
            guard case .file(let actual) = prepared.blobs[0].source else { return XCTFail("Expected a frozen body file") }
            XCTAssertEqual(actual, file)
            XCTAssertEqual(resolved, 1)
            XCTAssertThrowsError(try FolioleCompanionFramedSyncPreparedOutbound.decode(value))
        }
    }

    func testPreparedFrozenSourceRejectsMixedUnknownOrResourceSourcesBeforeResolver() throws {
        let sources: [[String: Any]] = [
            ["body_source": "frozen_body", "data_text": "body"],
            ["body_source": "frozen_body", "storage_key": "body"],
            ["body_source": "unknown"]
        ]
        for source in sources {
            let value = try preparedValue(reference(Data("body".utf8)), source: source)
            XCTAssertThrowsError(try FolioleCompanionFramedSyncPreparedOutbound.decode(value, frozenBodyFile: { _ in
                XCTFail("Invalid source must not resolve")
                return URL(fileURLWithPath: "/unused")
            }))
        }
        var resource = reference(Data([1]))
        resource.role = .image
        let value = try preparedValue(resource, source: ["body_source": "frozen_body"])
        XCTAssertThrowsError(try FolioleCompanionFramedSyncPreparedOutbound.decode(value, frozenBodyFile: { _ in
            XCTFail("Resource is not a frozen body")
            return URL(fileURLWithPath: "/unused")
        }))
    }

    private func reference(_ body: Data) -> Foliole_Sync_V22_BlobReference {
        var value = Foliole_Sync_V22_BlobReference()
        value.sha256 = Data(SHA256.hash(data: body))
        value.byteLength = UInt64(body.count)
        value.role = .nodeBody
        value.required = true
        return value
    }

    private func preparedValue(_ reference: Foliole_Sync_V22_BlobReference, source: [String: Any]) throws -> [String: Any] {
        var fact = Foliole_Sync_V22_FactRecord()
        fact.identity.kind = .nodeVersion
        fact.identity.objectType = "node"
        fact.identity.globalID = "node"
        fact.identity.factID = "version"
        fact.sharedStateHash = Data(repeating: 1, count: 32)
        fact.body = .init()
        fact.blobs = [reference]
        var blob = source
        blob["sha256"] = reference.sha256.hex
        blob["byte_length"] = String(reference.byteLength)
        blob["role"] = Int(reference.role.rawValue)
        blob["required"] = reference.required
        let digest = Data(repeating: 1, count: 32).hex
        return ["content_id": digest, "manifest_hash": digest, "transfer_id": digest,
                "blobs": [blob], "header_message_bytes": try FramedSyncPreparedOutboundFixture.headerBytes(
                    facts: [fact], contentID: Data(repeating: 1, count: 32), transferID: Data(repeating: 1, count: 32))]
    }

    private func withDirectory(_ operation: (URL) throws -> Void) throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("body-spool-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        try operation(directory)
    }
}
