import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleResourceProviderTests: XCTestCase {
    func testAttachmentStorageExhaustionHasSpecificFailure() {
        let error = NSError(domain: NSCocoaErrorDomain, code: CocoaError.fileWriteOutOfSpace.rawValue)
        XCTAssertEqual(FolioleCompanionAttachmentResourceDownloader.resourceFailure(error), "disk_full")
    }
}
