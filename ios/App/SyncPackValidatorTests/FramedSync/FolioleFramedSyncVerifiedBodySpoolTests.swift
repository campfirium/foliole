import CryptoKit
import Foundation
import XCTest
import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncVerifiedBodySpoolTests: XCTestCase {
    func testUnicodeBOMAndNULBytesAreSpooledExactlyWithBoundedRangeReads() throws {
        try withDirectory { directory in
            var body = Data([0xef, 0xbb, 0xbf, 0])
            body.append(Data(String(repeating: "🌿\\\"\n\0", count: 250_000).utf8))
            let reference = reference(body)
            var next: UInt64 = 0
            var reads = 0
            let file = try FolioleFramedSyncVerifiedBodySpool.write(reference: reference, directory: directory) { offset, count in
                XCTAssertEqual(offset, next)
                XCTAssertEqual(count, min(524_288, body.count - Int(offset)))
                let bytes = body.subdata(in: Int(offset)..<(Int(offset) + count))
                next += UInt64(count)
                reads += 1
                return bytes
            }
            XCTAssertGreaterThan(reads, 1)
            XCTAssertEqual(next, reference.byteLength)
            XCTAssertEqual(file.deletingLastPathComponent().standardizedFileURL.path, directory.standardizedFileURL.path)
            XCTAssertEqual(file.lastPathComponent, reference.sha256.hex)
            XCTAssertEqual(try Data(contentsOf: file), body)
            XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: directory.path), [reference.sha256.hex])
        }
    }

    func testEmptyBodyVerifiesEmptyHashWithoutCallingRangeReader() throws {
        try withDirectory { directory in
            let file = try FolioleFramedSyncVerifiedBodySpool.write(reference: reference(Data()), directory: directory) { _, _ in
                XCTFail("Empty body does not need a range")
                return Data()
            }
            XCTAssertEqual(try Data(contentsOf: file), Data())
        }
        try withDirectory { directory in
            var invalid = reference(Data())
            invalid.sha256 = Data(repeating: 1, count: 32)
            XCTAssertThrowsError(try FolioleFramedSyncVerifiedBodySpool.write(reference: invalid, directory: directory) { _, _ in Data() })
            XCTAssertTrue(try FileManager.default.contentsOfDirectory(atPath: directory.path).isEmpty)
        }
    }

    func testWrongHashTruncatedOversizedAndThrownReadDeleteOnlyTheirPartial() throws {
        for mode in 0..<4 {
            try withDirectory { directory in
                let retained = directory.appendingPathComponent("retained")
                try Data([9]).write(to: retained)
                let body = Data(repeating: 3, count: 524_289)
                let value = reference(body)
                var calls = 0
                XCTAssertThrowsError(try FolioleFramedSyncVerifiedBodySpool.write(reference: value, directory: directory) { _, count in
                    calls += 1
                    if calls == 1 { return Data(repeating: 3, count: count) }
                    if mode == 3 { throw NSError(domain: "range-test", code: 1) }
                    return Data(repeating: mode == 0 ? 4 : 3, count: mode == 1 ? count - 1 : mode == 2 ? count + 1 : count)
                })
                XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: directory.path), ["retained"])
                XCTAssertEqual(try Data(contentsOf: retained), Data([9]))
            }
        }
    }

    func testPreparedVerifiedSourcesResolveFilesOnlyForBodyRoles() throws {
        for role in [Foliole_Sync_V22_BlobRole.nodeBody, .externalDocument] {
            var blob = reference(Data([1, 2, 3]))
            blob.role = role
            let value = try preparedValue(blob, source: ["body_source": "verified_chunks"])
            let file = URL(fileURLWithPath: "/verified-body")
            var resolved = 0
            let prepared = try FolioleCompanionFramedSyncPreparedOutbound.decode(value, verifiedBodyFile: { reference in
                XCTAssertEqual(reference, blob)
                resolved += 1
                return file
            })
            guard case .file(let actual) = prepared.blobs[0].source else { return XCTFail("Expected a verified body file") }
            XCTAssertEqual(actual, file)
            XCTAssertEqual(resolved, 1)
            XCTAssertThrowsError(try FolioleCompanionFramedSyncPreparedOutbound.decode(value))
        }
    }

    func testPreparedVerifiedSourceRejectsMixedUnknownOrResourceSourcesBeforeResolver() throws {
        let sources: [[String: Any]] = [
            ["body_source": "verified_chunks", "data_text": "body"],
            ["body_source": "verified_chunks", "storage_key": "body"],
            ["body_source": "unknown"]
        ]
        for source in sources {
            let value = try preparedValue(reference(Data("body".utf8)), source: source)
            XCTAssertThrowsError(try FolioleCompanionFramedSyncPreparedOutbound.decode(value, verifiedBodyFile: { _ in
                XCTFail("Invalid source must not resolve")
                return URL(fileURLWithPath: "/unused")
            }))
        }
        var resource = reference(Data([1]))
        resource.role = .image
        let value = try preparedValue(resource, source: ["body_source": "verified_chunks"])
        XCTAssertThrowsError(try FolioleCompanionFramedSyncPreparedOutbound.decode(value, verifiedBodyFile: { _ in
            XCTFail("Resource is not a verified body")
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
        var message = Foliole_Sync_V22_ProtocolMessage()
        message.payload = .fact(fact)
        let bytes = try FolioleFramedSyncCodec.encode(FolioleFramedSyncCodec.validateOutbound(message, authenticatedFrameType: 3))
        var blob = source
        blob["sha256"] = reference.sha256.hex
        blob["byte_length"] = String(reference.byteLength)
        blob["role"] = Int(reference.role.rawValue)
        blob["required"] = reference.required
        let digest = Data(repeating: 1, count: 32).hex
        return ["content_id": digest, "manifest_hash": digest, "transfer_id": digest,
                "blobs": [blob], "fact_message_bytes_list": [Array(bytes)]]
    }

    private func withDirectory(_ operation: (URL) throws -> Void) throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("body-spool-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        try operation(directory)
    }
}
