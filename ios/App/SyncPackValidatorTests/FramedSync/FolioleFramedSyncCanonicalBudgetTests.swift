import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncCanonicalBudgetTests: XCTestCase {
    func testCiphertextIncludesTheFullDecodedFrameAndTag() throws {
        let size = 2 * 1024 * 1024 + 16
        let header = try FolioleFramedSyncWireHeader(ciphertextBytes: size, sequence: 0, frameType: .fact)
        XCTAssertEqual(try FolioleFramedSyncWireHeader(decoding: header.encode()).ciphertextBytes, size)
        XCTAssertThrowsError(try FolioleFramedSyncWireHeader(
            ciphertextBytes: size + 1, sequence: 0, frameType: .fact)) { error in
            XCTAssertEqual((error as? FolioleFramedSyncValidationError)?.code, "wire_frame_limit_exceeded")
        }
    }
}
