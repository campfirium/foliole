import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncCanonicalBudgetTests: XCTestCase {
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
