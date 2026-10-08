import Foundation
import XCTest
import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncBridgeBudgetTests: XCTestCase {
    func testProductionMetadataFactAndSQLiteReplayUseOneConfiguredOwner() async throws {
        try await FolioleFramedSyncPayloadWorker.run {
            try FramedSyncWholeBodyReceiverFixture.withRoot { root in
                let context = FolioleFramedSyncTransferContext(groupID: "group", senderDeviceID: "sender",
                    senderLibraryEpoch: "s", receiverDeviceID: "receiver", receiverLibraryEpoch: "r")
                var fact = Foliole_Sync_V22_FactRecord()
                fact.identity.kind = .nodeVersion; fact.identity.objectType = "node"
                fact.identity.globalID = "node"; fact.identity.factID = "version"
                fact.sharedStateHash = Data(repeating: 1, count: 32)
                var field = Foliole_Sync_V22_CanonicalField(); field.name = "title"; field.value.value = .stringValue("test")
                fact.body.fields = [field]
                let contentID = try FolioleFramedSyncCanonicalManifest.contentID(facts: [fact], blobs: [])
                let transferID = context.deriveTransferID(contentID: contentID)
                var message = Foliole_Sync_V22_ProtocolMessage(); message.payload = .fact(fact)
                let value: [String: Any] = ["content_id": contentID.hex, "manifest_hash": contentID.hex,
                    "transfer_id": transferID.hex, "blobs": [[String: Any]](),
                    "header_message_bytes": try FramedSyncPreparedOutboundFixture.headerBytes(facts: [fact],
                        contentID: contentID, transferID: transferID, groupID: "group")]
                let owner = FolioleFramedSyncPayloadBudget(libraryKey: root.appendingPathComponent("business.db").path, generationID: "test")
                let bridge = BudgetBridge(owner: owner, header: value, fact: try message.serializedData())
                let metadata = try FolioleFramedSyncBridgeFactSource.preparedMetadata(bridge: bridge, selection: [:], owner: owner)
                XCTAssertNil(metadata.0["header_message_bytes"])
                let prepared = try FolioleCompanionFramedSyncPreparedOutbound.decodeMetadata(metadata.0,
                    header: metadata.1, resourceFiles: [:], frozenBodyFile: nil)
                let source = FolioleFramedSyncBridgeFactSource.make(prepared: prepared, selection: [:],
                    bridge: bridge, directory: root, owner: owner)
                let staging = try FolioleFramedSyncOutboundSQLite(database: .init(url: root.appendingPathComponent("sender.db")), owner: owner)
                let attempt = try FolioleFramedSyncTransferWriter.prepare(groupKey: Data(0...31), context: context,
                    prepared: prepared, source: source, staging: staging)
                let wire = try FolioleFramedSyncTransferWriter.replay(attempt, staging: staging)
                let receiverDB = try FolioleFramedSyncTransferDatabase(url: root.appendingPathComponent("receiver.db"))
                let receiver = FolioleFramedSyncTransferReceiver(database: receiverDB, resourceRoot: root, owner: owner)
                XCTAssertEqual(try receiver.receive(wire, groupKey: Data(0...31), context: context).transferID, transferID)
                XCTAssertEqual(try receiverDB.rows("SELECT state FROM framed_sync_ios_transfers").first?[0] as? String, "ready_to_apply")
                XCTAssertEqual(bridge.operations, ["prepare_framed_outbound", "read_framed_outbound_fact"])
            }
        }
    }

    func testReceiptCompletesWhileOutboundPayloadSlotIsHeld() async throws {
        try await FolioleFramedSyncPayloadWorker.run {
            try FramedSyncWholeBodyReceiverFixture.withRoot { root in
                let owner = FolioleFramedSyncPayloadBudget(libraryKey: root.appendingPathComponent("business.db").path, generationID: "test")
                let held = try FolioleFramedSyncPayloadWorker.borrow(owner, direction: .outbound)
                defer { held.release() }
                let transferID = Data(repeating: 1, count: 32), contentID = Data(repeating: 2, count: 32)
                let value: [String: Any] = ["transfer_id": transferID.hex, "content_id": contentID.hex,
                    "applied_state_hash": Data(repeating: 3, count: 32).hex,
                    "receiver_device_id": "receiver", "receiver_library_epoch": "r"]
                let database = try FolioleFramedSyncTransferDatabase(url: root.appendingPathComponent("receipt.db"))
                let bytes = try FolioleFramedSyncReceiptWriter.encode(groupKey: Data(0...31), value: value, database: database)
                let bridge = ReceiptControlBridge(contentID: contentID)
                let context = FolioleFramedSyncTransferContext(groupID: "group", senderDeviceID: "sender",
                    senderLibraryEpoch: "s", receiverDeviceID: "receiver", receiverLibraryEpoch: "r")
                try FolioleCompanionFramedSyncServerOutbound.completeReceipt(InputStream(data: bytes), bridge: bridge,
                    context: context, groupKey: Data(0...31), transferID: transferID, owner: owner)
                XCTAssertEqual(bridge.completed?["transfer_id"] as? String, transferID.hex)
            }
        }
    }

    func testHeaderProbeIdentifiesReceiptWithoutTakingPayloadSlot() throws {
        let reader = FolioleCompanionHttpRequestReader()
        let preamble = try FolioleFramedSyncTransferWriter.makePreamble(transferID: Data(repeating: 1, count: 32),
            attemptID: Data(repeating: 2, count: 16), noncePrefix: Data(repeating: 3, count: 4))
        let header = try FolioleFramedSyncWireHeader(ciphertextBytes: 20, sequence: 0, frameType: .transferReceipt).encode()
        let http = Data("POST /companion/framed-sync HTTP/1.1\r\nContent-Length: 132\r\n\r\n".utf8)
        XCTAssertNil(reader.networkLane)
        XCTAssertLessThanOrEqual(reader.networkReadBytes, 16 * 1024 + 4)
        XCTAssertNil(try reader.append(http + preamble.encoded + header))
        XCTAssertEqual(reader.networkLane, .receipt)
        XCTAssertNotNil(try reader.append(Data(repeating: 0, count: 20)))
    }
}

private final class BudgetBridge: FolioleCompanionSyncGroupDataRequesting {
    let owner: FolioleFramedSyncPayloadBudget
    let header: [String: Any]
    let fact: Data
    var operations = [String]()
    init(owner: FolioleFramedSyncPayloadBudget, header: [String: Any], fact: Data) {
        self.owner = owner; self.header = header; self.fact = fact
    }
    func request(_ operation: String, _ payload: [String: Any]) throws -> [String: Any] {
        let token = try XCTUnwrap(payload["payload_loan"] as? [String: Any])
        let id = try XCTUnwrap(token["loan_id"] as? String)
        XCTAssertEqual(token["library_key"] as? String, owner.libraryKey)
        XCTAssertTrue(owner.validate(loanID: id, slot: .init(direction: .outbound, lane: .payload), capacity: 2_097_152))
        defer { owner.releaseProducer(id, slot: .init(direction: .outbound, lane: .payload), capacity: 2_097_152) }
        operations.append(operation)
        if operation == "prepare_framed_outbound" { return header }
        return ["message_bytes": fact.map(Int.init), "last_fragment": true]
    }
}

private final class ReceiptControlBridge: FolioleCompanionSyncGroupDataRequesting {
    let contentID: Data
    var completed: [String: Any]?
    init(contentID: Data) { self.contentID = contentID }
    func request(_ operation: String, _ payload: [String: Any]) throws -> [String: Any] {
        XCTAssertNil(payload["payload_loan"])
        if operation == "inspect_framed_outbound" {
            XCTAssertEqual(payload["receipt_only"] as? Bool, true)
            return ["content_id": contentID.hex, "resource_storage_keys": [String]()]
        }
        XCTAssertEqual(operation, "complete_framed_outbound")
        completed = payload; return [:]
    }
}
