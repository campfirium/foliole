import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncTransferSequenceTests: XCTestCase {
    private let key = Data(0...31)
    private let context = FolioleFramedSyncTransferContext(groupID: "group", senderDeviceID: "sender",
        senderLibraryEpoch: "s", receiverDeviceID: "receiver", receiverLibraryEpoch: "r")

    func testOriginalTransfersAndReceiptsRetainIndependentAuthenticatedIdentities() async throws {
        let root = try directory(); defer { try? FileManager.default.removeItem(at: root) }
        let first = try transfer("one", root: root), second = try transfer("two", root: root)
        let source = root.appendingPathComponent("request.body")
        try (first.0 + second.0).write(to: source)
        let owner = FolioleFramedSyncPayloadBudget(libraryKey: root.appendingPathComponent("business.db").path, generationID: "g")
        try await FolioleFramedSyncPayloadWorker.run {
            let database = try FolioleFramedSyncTransferDatabase(url: root.appendingPathComponent("receiver.db"))
            let receiver = FolioleFramedSyncTransferReceiver(database: database, resourceRoot: root, owner: owner)
            var ids = [Data](), removed = [URL]()
            try FolioleFramedSyncTransferSequence.readEach(source, owner: owner) { unit in
                XCTAssertFalse(unit.receipt)
                ids.append(try receiver.receive(unit.url, groupKey: self.key, context: self.context).transferID)
                removed.append(unit.url)
            }
            XCTAssertEqual(ids, [first.1, second.1])
            XCTAssertEqual(try database.rows("SELECT 1 FROM framed_sync_ios_transfers WHERE state = 'ready_to_apply'").count, 2)
            XCTAssertTrue(removed.allSatisfy { !FileManager.default.fileExists(atPath: $0.path) })
            let receiptDB = try FolioleFramedSyncTransferDatabase(url: root.appendingPathComponent("receipt.db"))
            let response = root.appendingPathComponent("response.body")
            XCTAssertTrue(FileManager.default.createFile(atPath: response.path, contents: nil))
            let output = try FileHandle(forWritingTo: response); defer { try? output.close() }
            for transfer in [first, second] {
                try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .outbound, lane: .receipt) { _ in
                    let bytes = try FolioleFramedSyncReceiptWriter.encode(groupKey: self.key,
                        value: self.receiptValue(transfer), database: receiptDB)
                    try output.write(contentsOf: bytes)
                }
            }
            try output.synchronize()
            let echo = root.appendingPathComponent("echo.body")
            XCTAssertTrue(FileManager.default.createFile(atPath: echo.path, contents: nil))
            let echoed = try FileHandle(forWritingTo: echo); defer { try? echoed.close() }
            let payloadHeld = try FolioleFramedSyncPayloadWorker.borrow(owner, direction: .outbound)
            defer { payloadHeld.release() }
            var receipts = [Data]()
            try FolioleFramedSyncTransferSequence.readEach(response, owner: owner) { unit in
                XCTAssertTrue(unit.receipt)
                try FolioleFramedSyncTransferSequence.appendReceipt(unit.url, to: echoed, owner: owner)
                let expected = receipts.isEmpty ? first : second
                let input = try XCTUnwrap(InputStream(url: unit.url))
                receipts.append(try FolioleFramedSyncReceiptReader.read(input, groupKey: self.key,
                    transferID: expected.1, contentID: expected.2, receiverDeviceID: self.context.receiverDeviceID,
                    receiverLibraryEpoch: self.context.receiverLibraryEpoch, owner: owner).transferID)
            }
            XCTAssertEqual(receipts, [first.1, second.1])
            try echoed.synchronize()
            XCTAssertEqual(try Data(contentsOf: echo), try Data(contentsOf: response))
        }
        let reopened = try FolioleFramedSyncTransferDatabase(url: root.appendingPathComponent("receiver.db"))
        XCTAssertEqual(try reopened.rows("SELECT 1 FROM framed_sync_ios_transfers WHERE state = 'ready_to_apply'").count, 2)
    }

    func testBadLaterTagOrTruncatedTailPreservesCommittedOriginalPrefix() throws {
        let root = try directory(); defer { try? FileManager.default.removeItem(at: root) }
        let first = try transfer("one", root: root), second = try transfer("two", root: root)
        var bad = second.0; bad[bad.count - 1] ^= 1
        for (index, tail) in [bad, Data(second.0.dropLast()), Data(second.0.prefix(100))].enumerated() {
            let source = root.appendingPathComponent("bad-\(index).body"); try (first.0 + tail).write(to: source)
            let databaseURL = root.appendingPathComponent("receiver-\(index).db")
            do {
                let database = try FolioleFramedSyncTransferDatabase(url: databaseURL)
                let receiver = FolioleFramedSyncTransferReceiver(database: database, resourceRoot: root)
                var completed = 0
                XCTAssertThrowsError(try FolioleFramedSyncTransferSequence.readEach(source) { unit in
                    _ = try receiver.receive(unit.url, groupKey: key, context: context); completed += 1
                })
                XCTAssertEqual(completed, 1)
            }
            let reopened = try FolioleFramedSyncTransferDatabase(url: databaseURL)
            XCTAssertEqual(try reopened.rows("SELECT transfer_id FROM framed_sync_ios_transfers WHERE state = 'ready_to_apply'").first?[0] as? Data, first.1)
            XCTAssertEqual(try reopened.rows("SELECT 1 FROM framed_sync_ios_transfers WHERE transfer_id = ? AND state = 'ready_to_apply'", [second.1]).count, 0)
        }
    }

    func testBatchLimitsRejectBeforeCopyingOffendingBodyAndKeepLargeSingleUnit() throws {
        let root = try directory(); defer { try? FileManager.default.removeItem(at: root) }
        let first = try transfer("one", root: root).0
        let large = try structuralUnit(preamble: first.prefix(96), bytes: 2_097_152, receipt: false)
        XCTAssertEqual(try scan(large, root: root), 1)
        XCTAssertThrowsError(try scan(large + first, root: root))
        let receipt = try structuralUnit(preamble: first.prefix(96), bytes: 600_000, receipt: true)
        XCTAssertEqual(try scan(receipt + receipt, root: root), 2)
        XCTAssertThrowsError(try scan(receipt + first, root: root))
        XCTAssertThrowsError(try scan(first + receipt, root: root))
        XCTAssertThrowsError(try scan(receipt + receipt + receipt + receipt, root: root))
        let empty = try structuralUnit(preamble: first.prefix(96), bytes: 0, receipt: true)
        XCTAssertEqual(try scan(Data(repeatingUnits: empty, count: 128), root: root), 128)
        XCTAssertThrowsError(try scan(Data(repeatingUnits: empty, count: 129), root: root))
        var gzip = first; gzip[13] = 1
        XCTAssertEqual(try scan(gzip, root: root), 1)
        XCTAssertThrowsError(try scan(gzip + first, root: root))
        XCTAssertThrowsError(try scan(first + gzip, root: root))
        var hugeHeader = try FolioleFramedSyncWireHeader(ciphertextBytes: 16, sequence: 0, frameType: .transferHeader).encode()
        hugeHeader.replaceSubrange(0..<4, with: Data([0x7f, 0xff, 0xff, 0xff]))
        XCTAssertThrowsError(try scan(Data(first.prefix(96)) + hugeHeader, root: root))
        XCTAssertThrowsError(try scan(Data(first.prefix(96)), root: root))
        XCTAssertThrowsError(try scan(Data(), root: root))
    }

    func testCapturedOwnerRetirementStopsNextUnitAndCleansTemporaryRange() async throws {
        let root = try directory(); defer { try? FileManager.default.removeItem(at: root) }
        let first = try transfer("one", root: root).0
        let source = root.appendingPathComponent("retiring.body"); try (first + first).write(to: source)
        let owner = FolioleFramedSyncPayloadBudget(libraryKey: root.appendingPathComponent("business.db").path, generationID: "old")
        try await FolioleFramedSyncPayloadWorker.run {
            var count = 0, copied: URL?
            XCTAssertThrowsError(try FolioleFramedSyncTransferSequence.readEach(source, owner: owner) { unit in
                count += 1; copied = unit.url; owner.retire({})
            })
            XCTAssertEqual(count, 1)
            XCTAssertFalse(FileManager.default.fileExists(atPath: try XCTUnwrap(copied).path))
        }
    }

    func testMagicInsidePayloadIsNeverUsedAsAUnitBoundary() throws {
        let root = try directory(); defer { try? FileManager.default.removeItem(at: root) }
        let first = try transfer("one", root: root).0
        var unit = try structuralUnit(preamble: first.prefix(96), bytes: 120, receipt: false)
        unit.replaceSubrange(112..<120, with: Data("FOLSYNC2".utf8))
        XCTAssertEqual(try scan(unit + first, root: root), 2)
    }

    private func directory() throws -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-sequence-test-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true); return root
    }
    private func transfer(_ id: String, root: URL) throws -> (Data, Data, Data) {
        var fact = Foliole_Sync_V22_FactRecord()
        fact.identity.kind = .nodeVersion; fact.identity.objectType = "node"
        fact.identity.globalID = "node-1"; fact.identity.factID = id; fact.sharedStateHash = Data(repeating: 7, count: 32)
        var field = Foliole_Sync_V22_CanonicalField(); field.name = "title"; field.value.value = .stringValue(id)
        fact.body.fields = [field]
        let content = try FolioleFramedSyncCanonicalManifest.contentID(facts: [fact], blobs: [])
        let staging = try FolioleFramedSyncOutboundSQLite(database: .init(url: root.appendingPathComponent("sender-\(id).db")))
        let attempt = try FolioleFramedSyncTransferWriter.prepare(groupKey: key, context: context, facts: [fact], blobs: [], staging: staging)
        let output = OutputStream.toMemory()
        try FolioleFramedSyncTransferWriter.replay(attempt, staging: staging, output: output)
        return (try XCTUnwrap(output.property(forKey: .dataWrittenToMemoryStreamKey) as? Data), attempt.transferID, content)
    }
    private func receiptValue(_ transfer: (Data, Data, Data)) -> [String: Any] {
        ["transfer_id": transfer.1.hex, "content_id": transfer.2.hex, "applied_state_hash": Data(repeating: 9, count: 32).hex,
         "receiver_device_id": context.receiverDeviceID, "receiver_library_epoch": context.receiverLibraryEpoch]
    }
    private func scan(_ bytes: Data, root: URL) throws -> Int {
        let source = root.appendingPathComponent("structure.body"); try bytes.write(to: source)
        var count = 0
        try FolioleFramedSyncTransferSequence.readEach(source) { _ in count += 1 }; return count
    }
    private func structuralUnit(preamble: Data.SubSequence, bytes: Int, receipt: Bool) throws -> Data {
        var wire = Data(preamble)
        wire.append(try FolioleFramedSyncWireHeader(ciphertextBytes: bytes + 16, sequence: 0,
            frameType: receipt ? .transferReceipt : .transferHeader).encode())
        wire.append(Data(repeating: 0, count: bytes + 16))
        if !receipt {
            wire.append(try FolioleFramedSyncWireHeader(ciphertextBytes: 16, sequence: 1, frameType: .transferTrailer).encode())
            wire.append(Data(repeating: 0, count: 16))
        }
        return wire
    }
}

private extension Data {
    init(repeatingUnits unit: Data, count: Int) {
        self.init()
        for _ in 0..<count { append(unit) }
    }
}
