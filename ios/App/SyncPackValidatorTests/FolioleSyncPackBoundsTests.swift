import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleSyncPackBoundsTests: XCTestCase {
    func testCompressedDatabaseCannotExpandPastPageBudget() throws {
        let compressed = try FolioleCompanionZlib.deflate(Data(repeating: 65, count: 5 * 1024 * 1024))
        XCTAssertThrowsError(try FolioleCompanionZlib.inflate(compressed, maxBytes: 4 * 1024 * 1024))
    }
}
