import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncResourceRequestTests: XCTestCase {
    private var identity: [String: Any] {
        ["demand_id": "demand-a", "global_id": "node-a", "version_id": "version-a",
         "body_hash": "body-a", "storage_key": "image-a.png",
         "shared_state_hash": String(repeating: "ab", count: 32)]
    }

    func testPreservesIndependentResourceDemandIdentity() throws {
        let values = try FolioleCompanionFramedSyncResourceRequest.read([identity])
        XCTAssertEqual(values.count, 1)
        let value = try XCTUnwrap(values.first)
        XCTAssertEqual(value.demandID, "demand-a")
        XCTAssertEqual(value.globalID, "node-a")
        XCTAssertEqual(value.versionID, "version-a")
        XCTAssertEqual(value.bodyHash, "body-a")
        XCTAssertEqual(value.storageKey, "image-a.png")
        XCTAssertEqual(value.sharedStateHash, Data(repeating: 0xab, count: 32))
        XCTAssertTrue(try FolioleCompanionFramedSyncResourceRequest.read(nil).isEmpty)
    }

    func testRejectsMalformedDemandWithoutDroppingIt() throws {
        for key in identity.keys {
            var row = identity
            row[key] = ""
            XCTAssertThrowsError(try FolioleCompanionFramedSyncResourceRequest.read([row]))
        }
        for hash in [String(repeating: "AB", count: 32), String(repeating: "a", count: 63),
                     String(repeating: "g", count: 64)] {
            var row = identity
            row["shared_state_hash"] = hash
            XCTAssertThrowsError(try FolioleCompanionFramedSyncResourceRequest.read([row]))
        }
        XCTAssertThrowsError(try FolioleCompanionFramedSyncResourceRequest.read("invalid"))
        XCTAssertThrowsError(try FolioleCompanionFramedSyncResourceRequest.read([42]))
    }
}
