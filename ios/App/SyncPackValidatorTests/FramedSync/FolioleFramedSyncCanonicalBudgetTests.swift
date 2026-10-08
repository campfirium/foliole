import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncCanonicalBudgetTests: XCTestCase {
    func testBodyDescriptorLimitAppliesBeforeCanonicalHashing() throws {
        for role in [1, 5] {
            var blob = Foliole_Sync_V22_BlobReference()
            blob.sha256 = Data(repeating: 8, count: 32)
            blob.role = try XCTUnwrap(Foliole_Sync_V22_BlobRole(rawValue: role))
            blob.byteLength = 1_048_576
            XCTAssertNoThrow(try FolioleFramedSyncCanonicalManifest.contentID(facts: [], blobs: [blob]))
            blob.byteLength += 1
            XCTAssertThrowsError(try FolioleFramedSyncCanonicalManifest.contentID(facts: [], blobs: [blob])) { error in
                XCTAssertEqual((error as? FolioleFramedSyncValidationError)?.code, "blob_byte_length_limit_exceeded")
            }
        }
    }

    func testIncrementalCanonicalSourceMatchesTheOriginalDigestAndBudget() throws {
        let facts = (0..<80).map { fact(index: $0) }
        let ordered = facts.sorted {
            $0.identity.factID.utf8.lexicographicallyPrecedes($1.identity.factID.utf8)
        }
        var visited = [String]()
        let digest = try FolioleFramedSyncCanonicalManifest.contentID(orderedFactCount: ordered.count, blobs: []) { index in
            visited.append(ordered[index].identity.factID)
            return ordered[index]
        }
        XCTAssertEqual(digest, try FolioleFramedSyncCanonicalManifest.contentID(facts: facts, blobs: []))
        XCTAssertEqual(digest.map { String(format: "%02x", $0) }.joined(),
                       "ea7658d2172436539039daac91f9daef8198ea9bcfaaee0081ec53d12020b0d0")
        XCTAssertEqual(visited, ordered.map { $0.identity.factID })
        XCTAssertThrowsError(try FolioleFramedSyncCanonicalManifest.contentID(orderedFactCount: 2, blobs: []) { index in
            self.fact(index: 1 - index)
        }) { error in
            XCTAssertEqual((error as? FolioleFramedSyncValidationError)?.code, "canonical_fact_source_order_invalid")
        }
    }

    func testCumulativeFactBodiesHaveAnIndependentBound() throws {
        let facts = (0..<80).map { fact(index: $0) }
        XCTAssertEqual(try FolioleFramedSyncCanonicalManifest.contentID(facts: facts, blobs: []).count, 32)
        XCTAssertThrowsError(try FolioleFramedSyncCanonicalManifest.contentID(
            facts: (0..<86).map { fact(index: $0) }, blobs: [])) { error in
            XCTAssertEqual((error as? FolioleFramedSyncValidationError)?.code,
                           "canonical_manifest_limit_exceeded")
        }
    }

    func testCiphertextIncludesTheFullDecodedFrameAndTag() throws {
        let size = 2 * 1024 * 1024 + 16
        let header = try FolioleFramedSyncWireHeader(ciphertextBytes: size, sequence: 0, frameType: .fact)
        XCTAssertEqual(try FolioleFramedSyncWireHeader(decoding: header.encode()).ciphertextBytes, size)
        XCTAssertThrowsError(try FolioleFramedSyncWireHeader(
            ciphertextBytes: size + 1, sequence: 0, frameType: .fact)) { error in
            XCTAssertEqual((error as? FolioleFramedSyncValidationError)?.code, "wire_frame_limit_exceeded")
        }
    }

    private func fact(index: Int) -> Foliole_Sync_V22_FactRecord {
        var fact = Foliole_Sync_V22_FactRecord()
        fact.identity.kind = .nodeVersion
        fact.identity.objectType = "node"
        fact.identity.globalID = "node-1"
        fact.identity.factID = "version-\(index)"
        fact.sharedStateHash = Data(repeating: 7, count: 32)
        var field = Foliole_Sync_V22_CanonicalField()
        field.name = "payload_json"
        field.value.stringValue = String(repeating: "x", count: 96 * 1024)
        fact.body.fields = [field]
        return fact
    }
}
