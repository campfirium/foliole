import Foundation
import XCTest
import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleAttachmentBatchAuthorizationTests: XCTestCase {
    private typealias Fixture = AttachmentBatchWireFixture
    private func read(_ bytes: Data, permission: FolioleAttachmentBatchAuthorization, chunk: Int = 65536,
                      consume: @escaping (FolioleAttachmentBatchAuthorization.Event, Foliole_Sync_V22_RequestAttachment) throws -> Void) throws -> Int {
        let decoder = FolioleRequestSyncAttachmentBatchDecoder(groupKey: Fixture.groupKey, context: try Fixture.context(),
            permission: permission, check: {}, consume: consume)
        for offset in stride(from: 0, to: bytes.count, by: chunk) {
            try decoder.append(Data(bytes[offset..<min(bytes.count, offset + chunk)]))
        }
        try decoder.finish()
        return decoder.peakBufferedBytes
    }
    func testAuthenticates128SmallFilesInOneBoundedBatchWithArbitraryFragmentBoundaries() throws {
        var blocks = 0, ends = 0
        let peak = try read(Fixture.wire(Fixture.messages(128)), permission: Fixture.permission(128), chunk: 65537) { event, value in
            if event == .block { blocks += 1; XCTAssertEqual(value.data.count, 128 * 1024) }
            if event == .fileEnd { ends += 1 }
        }
        XCTAssertEqual(blocks, 128); XCTAssertEqual(ends, 128)
        XCTAssertLessThanOrEqual(peak, 524288 + 24584 + 16)
    }
    func testRejectsCorruptionAndMissingFileEndBeforeTheFileConsumerCanSealIt() throws {
        var corrupted = try Fixture.wire(Fixture.messages(1)); corrupted[120] ^= 1
        XCTAssertThrowsError(try read(corrupted, permission: Fixture.permission(1), chunk: 17) { _, _ in XCTFail() })
        var missing = Fixture.messages(2); missing.remove(at: 2)
        XCTAssertThrowsError(try read(Fixture.wire(missing), permission: Fixture.permission(2)) { event, _ in
            XCTAssertNotEqual(event, .fileEnd)
        })
    }
    func testRetainsIndependentFileEndsEvenWhenTheBatchEndIsMissing() throws {
        var messages = Fixture.messages(2); messages.removeLast()
        var ends = 0
        XCTAssertThrowsError(try read(Fixture.wire(messages), permission: Fixture.permission(2), chunk: 17) { event, _ in
            if event == .fileEnd { ends += 1 }
        })
        XCTAssertEqual(ends, 2)
    }
    func testThe129thSmallFileCannotExceedTheActualPayloadBudget() throws {
        var blocks = 0
        XCTAssertThrowsError(try read(Fixture.wire(Fixture.messages(129)), permission: Fixture.permission(129)) { event, _ in
            if event == .block { blocks += 1 }
        })
        XCTAssertEqual(blocks, 128)
    }
    func testAnOverlongPartialOnlyRestartsThatEntryAndTheNextEmptyFileCanComplete() throws {
        let permission = try FolioleAttachmentBatchAuthorization(requestID: Data(repeating: 0, count: 16), entries: [
            .init(key: Fixture.key(0), start: 1048576, knownLength: 0, partialLength: 1200000),
            .init(key: Fixture.key(1), start: 0, knownLength: 0, partialLength: 0)])
        let values = [Fixture.value(Fixture.key(0), "restart", 131072, 1048576),
            Fixture.value(Fixture.key(1), "description"), Fixture.value(Fixture.key(1), "file_end"), Fixture.value("", "batch_end")]
        var events = [FolioleAttachmentBatchAuthorization.Event]()
        _ = try read(Fixture.wire(values), permission: permission, chunk: 1) { event, _ in events.append(event) }
        XCTAssertEqual(events, [.restart, .description, .fileEnd, .batchEnd])
    }
    func testRejectsTwoExtensionAliasesForTheSameCanonicalPartial() throws {
        XCTAssertThrowsError(try FolioleAttachmentBatchAuthorization(requestID: Data(repeating: 0, count: 16), entries: [
            .init(key: Fixture.key(0), start: 0, knownLength: 0, partialLength: 0),
            .init(key: Fixture.key(0).replacingOccurrences(of: ".png", with: ".pdf"), start: 0, knownLength: 0, partialLength: 0)]))
    }
}
