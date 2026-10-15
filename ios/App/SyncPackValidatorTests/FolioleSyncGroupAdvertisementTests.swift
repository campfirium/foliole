import Foundation
import Network
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleSyncGroupAdvertisementTests: XCTestCase {
    func testAdvertisesTheSameDeviceIdentityAsHttpDiscoveryUnderTheSharedTxtKey() throws {
        let identity = "[1,\"group-a\",\"phone-anchor\",\"/Library/CapacitorDatabase/library.db\"]"
        let discovery: [String: Any] = [
            "group_id": "group-a", "group_tag": "tag-a", "group_display_name": "Library",
            "provider_device_id": identity, "provider_device_name": "Phone",
            "provider_platform": "ios-capacitor", "protocol_version": 25,
            "protocol_min_version": 25, "protocol_max_version": 25,
            "runtime_instance_id": "runtime-a"
        ]
        let service = FolioleCompanionSyncGroupAdvertisement.service(discovery)
        let txt = try XCTUnwrap(service.txtRecordObject)
        XCTAssertEqual(txt.getEntry(for: "device_id"), .string(identity))
        XCTAssertEqual(txt.getEntry(for: "group_id"), .string("group-a"))
        XCTAssertEqual(txt.getEntry(for: "group_tag"), .string("tag-a"))
        XCTAssertEqual(txt.getEntry(for: "protocol_version"), .string("25"))
    }
}
