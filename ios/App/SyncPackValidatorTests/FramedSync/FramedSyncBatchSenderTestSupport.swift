import CryptoKit
import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FramedSyncBatchSenderFixture: FolioleCompanionSyncGroupDataRequesting {
    enum Response { case normal, omitLast, duplicateFirst, corruptLast }
    let root: URL
    let owner: FolioleFramedSyncPayloadBudget
    let request: FolioleFramedSyncOutboundRequest
    let staging: FolioleFramedSyncOutboundSQLite
    var flags = [String: Bool](), sizes = [String: Int](), errors = [String: String]()
    var response = Response.normal
    var groups = [[String]](), sequences = [Bool](), completed = [String]()
    var prepared = [String](), replayed = [String](), remotelyCommitted = Set<String>()
    private var identities = [String: (String, Data)]()

    init() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-batch-sender-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        owner = .init(libraryKey: root.appendingPathComponent("business.db").path, generationID: "g")
        request = .init(endpoint: "http://127.0.0.1", context: .init(groupID: "group", senderDeviceID: "sender",
            senderLibraryEpoch: "s", receiverDeviceID: "receiver", receiverLibraryEpoch: "r"),
            workgroupKey: Data(0...31).base64EncodedString(), groupKey: Data(0...31))
        staging = try .init(database: .init(url: root.appendingPathComponent("sender.db")), owner: owner)
    }
    func cleanup() { try? FileManager.default.removeItem(at: root) }
    func send(_ ids: [String]) async throws -> [[String: Any]] {
        let bridge = FolioleFramedSyncOwnedBridge(bridge: self, owner: owner)
        let sender = FolioleFramedSyncOutboundBatchSender(request: request, owner: owner, bridge: bridge,
            staging: staging, directory: root) { body, result, sequence in
            self.sequences.append(sequence)
            try await FolioleFramedSyncPayloadWorker.run { try self.respond(body, to: result) }
        }
        let selections = try ids.map { try request.selection(["object_id": $0, "object_type": "node", "include_current_node": true,
            "required_relation_ids": [String](), "review_fact_ids": [String](), "state_fact_ids": [String]()]) }
        return try await sender.send(selections) { selection, index in
            try await FolioleFramedSyncPayloadWorker.run {
                try FolioleFramedSyncOutboundPreparation.prepare(selection, index: index, request: self.request,
                    bridge: bridge, staging: self.staging, root: self.root, owner: self.owner)
            }
        }
    }

    func request(_ operation: String, _ payload: [String: Any]) throws -> [String: Any] {
        switch operation {
        case "inspect_framed_outbound": return ["resource_storage_keys": [String]()]
        case "prepare_framed_outbound":
            let id = try FolioleFramedSyncOutboundRequest.text(payload, "object_id"), record = fact(id)
            prepared.append(id)
            let content = try FolioleFramedSyncCanonicalManifest.contentID(facts: [record], blobs: [])
            let transfer = request.context.deriveTransferID(contentID: content)
            identities[transfer.hex] = (id, content)
            var value: [String: Any] = ["content_id": content.hex, "manifest_hash": content.hex, "transfer_id": transfer.hex,
                "header_message_bytes": try FramedSyncPreparedOutboundFixture.headerBytes(facts: [record], contentID: content,
                    transferID: transfer, groupID: request.context.groupID), "blobs": [[String: Any]]()]
            if let flag = flags[id] { value["batch_ready"] = flag }
            return value
        case "read_framed_outbound_fact":
            let id = try FolioleFramedSyncOutboundRequest.text(payload, "object_id")
            guard let index = payload["fragment_index"] as? Int else { throw failure("fragment_index_missing") }
            let parts = try messages(fact(id))
            guard parts.indices.contains(index) else { throw failure("fragment_index_invalid") }
            return ["message_bytes": Array(parts[index]).map(Int.init), "last_fragment": index == parts.count - 1]
        case "complete_framed_outbound":
            completed.append(try FolioleFramedSyncOutboundRequest.text(payload, "transfer_id")); return [:]
        default: throw failure("unexpected_bridge_operation")
        }
    }

    private func respond(_ body: URL, to result: URL) throws {
        let database = try FolioleFramedSyncTransferDatabase(url: root.appendingPathComponent("receiver.db"))
        let receiver = FolioleFramedSyncTransferReceiver(database: database, resourceRoot: root, owner: owner)
        try database.execute("CREATE TABLE IF NOT EXISTS test_committed_receipts (transfer_id TEXT PRIMARY KEY, content_id TEXT NOT NULL)")
        XCTAssertTrue(FileManager.default.createFile(atPath: result.path, contents: nil))
        let output = try FileHandle(forWritingTo: result); defer { try? output.close() }
        var group = [String]()
        defer { groups.append(group) }
        try FolioleFramedSyncTransferSequence.readEach(body, owner: owner) { unit in
            let identity = try XCTUnwrap(identities[unit.preamble.contextID.hex])
            group.append(identity.0)
            replayed.append(unit.preamble.contextID.hex)
            if let error = errors[identity.0] { throw failure(error) }
            _ = try receiver.receive(unit.url, groupKey: request.groupKey, context: request.context)
            try database.execute("INSERT OR IGNORE INTO test_committed_receipts VALUES (?, ?)", [unit.preamble.contextID.hex, identity.1.hex])
            let stored = try XCTUnwrap(database.rows("SELECT content_id FROM test_committed_receipts WHERE transfer_id = ?", [unit.preamble.contextID.hex]).first)
            XCTAssertEqual(stored[0] as? String, identity.1.hex)
            remotelyCommitted.insert(unit.preamble.contextID.hex)
            try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .outbound, lane: .receipt) { _ in
                var receipt = try receiver.receipt(groupKey: request.groupKey, value: ["transfer_id": unit.preamble.contextID.hex,
                    "content_id": identity.1.hex, "applied_state_hash": Data(repeating: 9, count: 32).hex,
                    "receiver_device_id": request.context.receiverDeviceID, "receiver_library_epoch": request.context.receiverLibraryEpoch])
                if response == .corruptLast && group.count == 2 { receipt[receipt.count - 1] ^= 1 }
                if response != .omitLast || group.count != 2 { try output.write(contentsOf: receipt) }
                if response == .duplicateFirst && group.count == 1 { try output.write(contentsOf: receipt) }
            }
        }
        try output.synchronize()
    }

    private func fact(_ id: String) -> Foliole_Sync_V22_FactRecord {
        var record = Foliole_Sync_V22_FactRecord()
        record.identity.kind = .nodeVersion; record.identity.objectType = "node"
        record.identity.globalID = id; record.identity.factID = "version-\(id)"; record.sharedStateHash = Data(repeating: 7, count: 32)
        record.body.fields = ["first", "second"].map { name in
            var field = Foliole_Sync_V22_CanonicalField(); field.name = name
            field.value.value = .stringValue(String(repeating: id.first.map(String.init) ?? "x", count: sizes[id] ?? 5))
            return field
        }
        return record
    }
    private func messages(_ record: Foliole_Sync_V22_FactRecord) throws -> [Data] {
        var message = Foliole_Sync_V22_ProtocolMessage(); message.payload = .fact(record)
        let bytes = try message.serializedData()
        if bytes.count <= 2_097_152 { return [bytes] }
        return try stride(from: 0, to: bytes.count, by: 512 * 1024).map { offset in
            var fragment = Foliole_Sync_V22_FactFragment()
            fragment.identity = record.identity; fragment.sharedStateHash = record.sharedStateHash
            fragment.encodedSha256 = Data(SHA256.hash(data: bytes)); fragment.totalByteLength = UInt64(bytes.count)
            fragment.offset = UInt64(offset); fragment.data = bytes.subdata(in: offset..<min(bytes.count, offset + 512 * 1024))
            var part = Foliole_Sync_V22_ProtocolMessage(); part.payload = .factFragment(fragment); return try part.serializedData()
        }
    }
    private func failure(_ code: String) -> Error { FolioleFramedSyncValidationError(code) }
}
