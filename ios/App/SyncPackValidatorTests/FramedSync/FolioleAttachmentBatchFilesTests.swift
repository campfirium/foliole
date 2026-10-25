import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleAttachmentBatchFilesTests: XCTestCase {
    func testOneAuthenticatedResponsePublishes128SmallFilesWithoutPadding() throws {
        let fixture = try AttachmentBatchFileFixture(count: 128); defer { fixture.close() }
        let decoder = try fixture.decoder { event, value in
            try fixture.receiver.accept(event, value)
            if event == .fileEnd { try fixture.finish(fixture.queue.read()[0]) }
        }
        let wire = try AttachmentBatchWireFixture.wire(fixture.messages)
        for offset in stride(from: 0, to: wire.count, by: 7777) { try decoder.append(wire.subdata(in: offset..<min(wire.count, offset + 7777))) }
        try decoder.finish(); try fixture.receiver.close()
        XCTAssertEqual(fixture.receiver.bytes, 16 * 1024 * 1024); XCTAssertEqual(fixture.receiver.blocks, 128)
        XCTAssertEqual(try fixture.receiver.result().count, 128); XCTAssertEqual(fixture.capacity.used, 0)
        for index in 0..<128 {
            XCTAssertEqual(try Data(contentsOf: fixture.files.root.appendingPathComponent(fixture.entries[index].key)), fixture.contents[index])
        }
        XCTAssertLessThanOrEqual(decoder.peakBufferedBytes, 524288 + 24584 + 16)
    }
    func testHashCanBlockWhileLaterFilesWriteAndFourCompletionsBackpressureTheFifth() throws {
        let hashing = expectation(description: "first actual hash read")
        let four = expectation(description: "four real files sealed")
        let dataDone = expectation(description: "data exited")
        let consumed = expectation(description: "six completions settled")
        let release = DispatchSemaphore(value: 0)
        let consumer = DispatchQueue(label: "attachment-test-consumer")
        var active: AttachmentBatchFileFixture?
        var handled = Set<Int>(), blocked = false
        let fixture = try AttachmentBatchFileFixture(count: 6, changed: {
            consumer.async {
                guard let fixture = active else { return }
                do {
                    for fact in fixture.queue.read() where !handled.contains(fact.sequence) {
                        handled.insert(fact.sequence); try fixture.finish(fact)
                        if handled.count == 6 { consumed.fulfill() }
                    }
                } catch { XCTFail("Completion failed: \(error)") }
            }
        }, progress: {
            if blocked { return }; blocked = true; hashing.fulfill()
            XCTAssertEqual(release.wait(timeout: .now() + 5), .success)
        })
        active = fixture
        defer { release.signal(); active = nil; fixture.close() }
        let decoder = try fixture.decoder { event, value in
            try fixture.receiver.accept(event, value)
            if event == .fileEnd, value.storageKey == fixture.entries[3].key { four.fulfill() }
        }
        let wire = try AttachmentBatchWireFixture.wire(fixture.messages)
        DispatchQueue.global().async {
            do { try decoder.append(wire); try decoder.finish(); try fixture.receiver.close() }
            catch { XCTFail("Transfer failed: \(error)") }
            dataDone.fulfill()
        }
        wait(for: [hashing, four], timeout: 3)
        XCTAssertEqual(fixture.capacity.used, 4)
        let fourth = try fixture.files.storage.resolve(fixture.entries[3].key, partial: true)
        XCTAssertEqual(try Data(contentsOf: fourth).count, 131072)
        XCTAssertFalse(FileManager.default.fileExists(atPath: try fixture.files.storage.resolve(fixture.entries[4].key, partial: true).path))
        release.signal(); wait(for: [dataDone, consumed], timeout: 5)
        XCTAssertEqual(fixture.capacity.used, 0); XCTAssertEqual(try fixture.receiver.result().count, 6)
    }
    func testMissingBatchEndKeepsIndependentlyPublishedFiles() throws {
        let fixture = try AttachmentBatchFileFixture(count: 2); defer { fixture.close() }
        fixture.messages.removeLast()
        let decoder = try fixture.decoder { event, value in
            try fixture.receiver.accept(event, value)
            if event == .fileEnd { try fixture.finish(fixture.queue.read()[0]) }
        }
        try decoder.append(AttachmentBatchWireFixture.wire(fixture.messages))
        XCTAssertThrowsError(try decoder.finish()); XCTAssertThrowsError(try fixture.receiver.result())
        for index in 0..<2 { XCTAssertEqual(try Data(contentsOf: fixture.files.root.appendingPathComponent(fixture.entries[index].key)), fixture.contents[index]) }
        XCTAssertEqual(fixture.capacity.used, 0)
    }
    func testSealedOwnershipSurvivesClaimAckLossUntilPublicationAndSqlSettlement() throws {
        let fixture = try AttachmentBatchFileFixture(count: 1); defer { fixture.close() }
        let decoder = try fixture.decoder(); try decoder.append(AttachmentBatchWireFixture.wire(fixture.messages)); try decoder.finish()
        let fact = try XCTUnwrap(fixture.queue.read().first)
        XCTAssertFalse(fact.claimed)
        try fixture.queue.claim([fact.sequence]); try fixture.queue.claim([fact.sequence])
        XCTAssertThrowsError(try fixture.files.storage.batchReceive(key: fact.key.replacingOccurrences(of: ".png", with: ".jpg"), offset: 0, partialLength: fact.length, check: {}))
        XCTAssertEqual(fixture.capacity.used, 1); XCTAssertTrue(try fixture.finalizer.verify(fact.sequence))
        try fixture.finalizer.publish(fact.sequence); try fixture.finalizer.publish(fact.sequence)
        XCTAssertEqual(fixture.capacity.used, 1)
        try fixture.receiver.settle(fact.sequence, published: true); try fixture.receiver.settle(fact.sequence, published: true)
        XCTAssertEqual(fixture.capacity.used, 0); XCTAssertTrue(fixture.queue.read().isEmpty)
    }
    func testLostUnclaimedHandoffExpiresEvenWhileAnotherClaimedHashMakesProgress() throws {
        var now: TimeInterval = 0
        let capacity = FolioleAttachmentCompletionCapacity(now: { now })
        let a = FolioleAttachmentCompletionQueue(capacity: capacity, changed: {})
        let b = FolioleAttachmentCompletionQueue(capacity: capacity, changed: {})
        let first = try a.reserve(); try first.seal(key: "a", length: 1, closeWriter: {}, ownership: {})
        try a.claim([first.sequence])
        let lost = try b.reserve(); try lost.seal(key: "b", length: 1, closeWriter: {}, ownership: {})
        now = 59; capacity.touchHash(); now = 60
        XCTAssertFalse(a.expire()); XCTAssertTrue(b.expire())
        try b.releaseAfterExit(includeClaimed: true); try a.settle(first.sequence, published: true)
        XCTAssertEqual(capacity.used, 0)
    }
}
