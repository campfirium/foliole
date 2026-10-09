import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncPullBatchTests: XCTestCase {
    func testOriginalSequenceReturnsOnlyPrefixAndAcknowledgesEachIdentity() async throws {
        let fixture = try PullBatchFixture(); defer { fixture.close() }
        let first = try fixture.transfer("a"), second = try fixture.transfer("b")
        let values = try await fixture.receive(first + second, requests: ["a", "b"])
        XCTAssertEqual(values.compactMap { $0["object_id"] as? String }, ["a", "b"])
        XCTAssertEqual(fixture.applied, fixture.acknowledged)
        XCTAssertEqual(fixture.applied.count, 2)
        let tail = try await fixture.receive(first, requests: ["a", "b"])
        XCTAssertEqual(tail.count, 1)
    }

    func testDependencyReturnsOnlyAcknowledgedPrefixAndFirstFailureStillThrows() async throws {
        for prefix in ["framed_sync_node_parent_missing:", "node_position_lineage_unproven:",
                       "parent_order_position_lineage_unproven:", "sync_parent_order_body_unavailable:",
            "framed_sync_review_node_missing:", "sync_node_open_state_node_missing:",
            "sync_parent_order_member_missing:",
            "framed_sync_parent_relation_version_missing:"] {
            let fixture = try PullBatchFixture(); defer { fixture.close() }
            let first = try fixture.transfer("a"), second = try fixture.transfer("b")
            fixture.applyErrorAt = 1; fixture.applyError = prefix + "parent"
            let values = try await fixture.receive(first + second, requests: ["a", "b"])
            XCTAssertEqual(values.compactMap { $0["object_id"] as? String }, ["a"])
            XCTAssertEqual(fixture.acknowledged, fixture.applied)
            fixture.applyErrorAt = fixture.applied.count
            do { _ = try await fixture.receive(second, requests: ["b"]); XCTFail("first dependency must throw") }
            catch { XCTAssertEqual(error.localizedDescription, prefix + "parent") }
        }
    }

    func testNonDependencyAndFailedAckNeverReturnSuccessfulPrefix() async throws {
        for code in ["receipt_identity_conflict", "framed_sync_authentication_failed", "framed_sync_frame_truncated",
            "receipt_identity_conflict:framed_sync_node_parent_missing:parent",
            "aead_failed:node_position_lineage_unproven:parent",
            "framed_sync_http_401:sync_parent_order_body_unavailable:parent",
            "framed_sync_http_400:framed_sync_node_parent_missing:parent extra",
            "framed_sync_node_parent_missing:", "framed_sync_node_parent_missing:parent\n"] {
            let fixture = try PullBatchFixture(); defer { fixture.close() }
            let first = try fixture.transfer("a"), second = try fixture.transfer("b")
            fixture.applyErrorAt = 1; fixture.applyError = code
            do { _ = try await fixture.receive(first + second, requests: ["a", "b"]); XCTFail("must throw") }
            catch { XCTAssertEqual(error.localizedDescription, code) }
            XCTAssertEqual(fixture.acknowledged.count, 1)
        }
        let fixture = try PullBatchFixture(); defer { fixture.close() }
        fixture.ackError = "ack_failed"
        let first = try fixture.transfer("a")
        do { _ = try await fixture.receive(first, requests: ["a"]); XCTFail("ACK failure must throw") }
        catch { XCTAssertEqual(error.localizedDescription, "ack_failed") }
        XCTAssertTrue(fixture.acknowledged.isEmpty)
    }

    func testLaterTruncationKeepsFirstApplyAndAuthenticatedAck() async throws {
        let fixture = try PullBatchFixture(); defer { fixture.close() }
        let first = try fixture.transfer("a"), second = try fixture.transfer("b")
        do { _ = try await fixture.receive(first + second.dropLast(), requests: ["a", "b"]); XCTFail("expected truncation") }
        catch {}
        XCTAssertEqual(fixture.applied.count, 1)
        XCTAssertEqual(fixture.acknowledged, fixture.applied)
        let reopened = try FolioleFramedSyncTransferDatabase(url: fixture.root.appendingPathComponent("inbound.db"))
        // The original receipt writer retires native staging after the shared apply succeeds.
        XCTAssertEqual(try reopened.rows("SELECT 1 FROM framed_sync_ios_transfers").count, 0)
    }

    func testReorderedAndExtraFactHeadersRejectBeforePersistingTransfer() async throws {
        for extra in [false, true] {
            let fixture = try PullBatchFixture(); defer { fixture.close() }
            let bytes = try fixture.transfer(extra ? "a" : "b", extra: extra)
            do { _ = try await fixture.receive(bytes, requests: ["a"]); XCTFail("expected header rejection") }
            catch {}
            XCTAssertTrue(fixture.applied.isEmpty)
            XCTAssertTrue(fixture.acknowledged.isEmpty)
            let database = try FolioleFramedSyncTransferDatabase(url: fixture.root.appendingPathComponent("inbound.db"))
            XCTAssertEqual(try database.rows("SELECT 1 FROM framed_sync_ios_transfers").count, 0)
        }
    }

    func testDuplicateAndUnrequestedResponseRejectAfterAcknowledgedPrefix() async throws {
        for duplicate in [false, true] {
            let fixture = try PullBatchFixture(); defer { fixture.close() }
            let first = try fixture.transfer("a"), next = try fixture.transfer(duplicate ? "a" : "b")
            do { _ = try await fixture.receive(first + next, requests: duplicate ? ["a", "b"] : ["a"]); XCTFail("expected rejection") }
            catch {}
            XCTAssertEqual(fixture.applied.count, 1)
            XCTAssertEqual(fixture.acknowledged, fixture.applied)
        }
    }

    func testCapturedOwnerRetirementStopsSuffixAfterFirstAck() async throws {
        let fixture = try PullBatchFixture(); defer { fixture.close() }
        let first = try fixture.transfer("a"), next = try fixture.transfer("b")
        fixture.retireAfterAck = true
        do { _ = try await fixture.receive(first + next, requests: ["a", "b"]); XCTFail("expected retired owner") }
        catch {}
        XCTAssertEqual(fixture.applied.count, 1)
        XCTAssertEqual(fixture.acknowledged, fixture.applied)
    }

    func testRequestRejectsResourcesDuplicatesAndRequiresRelationEndpointVersions() throws {
        var value = PullBatchFixture.input(["a"])
        var row = try XCTUnwrap(value["requests"] as? [[String: Any]]).first!
        row["required_relation_ids"] = ["[\"version-a\",\"parent-a\",0]"]
        value["requests"] = [row]
        let object = try FolioleFramedSyncPullBatchRequest.decode(value)[0]
        XCTAssertTrue(object.expectedFacts.contains("2:parent-a"))
        row["resources"] = [[String: Any]](); value["requests"] = [row]
        XCTAssertThrowsError(try FolioleFramedSyncPullBatchRequest.decode(value))
        XCTAssertThrowsError(try FolioleFramedSyncPullBatchRequest.decode(PullBatchFixture.input(["a", "a"])))
        XCTAssertThrowsError(try FolioleFramedSyncPullBatchRequest.decode(PullBatchFixture.input((0..<129).map(String.init))))
    }
}

private final class PullBatchFixture: FolioleCompanionSyncGroupDataRequesting {
    let root: URL
    let owner: FolioleFramedSyncPayloadBudget
    let context = FolioleFramedSyncTransferContext(groupID: "group", senderDeviceID: "remote",
        senderLibraryEpoch: "r", receiverDeviceID: "local", receiverLibraryEpoch: "l")
    let key = Data(0...31)
    var content = [String: Data](), applied = [String](), acknowledged = [String]()
    var retireAfterAck = false, applyErrorAt: Int? = nil
    var applyError = "", ackError: String? = nil

    init() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        owner = .init(libraryKey: root.path, generationID: "test")
    }
    func close() { try? FileManager.default.removeItem(at: root) }
    static func input(_ ids: [String]) -> [String: Any] {
        ["round_id": Data(repeating: 7, count: 16).hex, "requests": ids.map { id in
            ["object_id": id, "object_type": "node", "frontier_fact_ids": ["version-\(id)"],
             "required_relation_ids": [String](), "resource_hashes": [String](),
             "review_fact_ids": [String](), "state_fact_ids": [String]()] as [String: Any]
        }]
    }
    func transfer(_ id: String, extra: Bool = false) throws -> Data {
        var fact = Foliole_Sync_V22_FactRecord()
        fact.identity.kind = .nodeVersion; fact.identity.objectType = "node"
        fact.identity.globalID = id; fact.identity.factID = "version-\(id)"
        fact.sharedStateHash = Data(repeating: 7, count: 32)
        var field = Foliole_Sync_V22_CanonicalField(); field.name = "title"; field.value.value = .stringValue(id)
        fact.body.fields = [field]
        var facts = [fact]
        if extra { fact.identity.factID = "extra"; facts.append(fact) }
        let digest = try FolioleFramedSyncCanonicalManifest.contentID(facts: facts, blobs: [])
        let staging = try FolioleFramedSyncOutboundSQLite(database: .init(url: root.appendingPathComponent("source-\(id).db")))
        let attempt = try FolioleFramedSyncTransferWriter.prepare(groupKey: key, context: context, facts: facts, blobs: [], staging: staging)
        content[attempt.transferID.hex] = digest
        let output = OutputStream.toMemory()
        try FolioleFramedSyncTransferWriter.replay(attempt, staging: staging, output: output)
        return try XCTUnwrap(output.property(forKey: .dataWrittenToMemoryStreamKey) as? Data)
    }
    func receive(_ bytes: Data, requests: [String]) async throws -> [[String: Any]] {
        let url = root.appendingPathComponent("response"); try bytes.write(to: url)
        let receiver = try FolioleFramedSyncTransferReceiver(database: .init(url: root.appendingPathComponent("inbound.db")), resourceRoot: root, owner: owner)
        let requested = try FolioleFramedSyncPullBatchRequest.decode(Self.input(requests))
        return try await FolioleFramedSyncPullBatchReceiver(receiver: receiver, context: context,
            groupKey: key, owner: owner, bridge: self).receive(url, requested: requested) { bytes, _ in
                let id = try XCTUnwrap(self.applied.last), digest = try XCTUnwrap(self.content[id])
                let receipt = try await FolioleFramedSyncPayloadWorker.run {
                    try FolioleFramedSyncReceiptReader.read(InputStream(data: bytes), groupKey: self.key,
                        transferID: try FolioleCompanionFramedSyncPreparedOutbound.digest(["transfer_id": id], "transfer_id"),
                        contentID: digest, receiverDeviceID: self.context.receiverDeviceID,
                        receiverLibraryEpoch: self.context.receiverLibraryEpoch, owner: self.owner)
                }
                if let code = self.ackError { throw FolioleFramedSyncValidationError(code) }
                self.acknowledged.append(receipt.transferID.hex)
                if self.retireAfterAck { self.owner.retire({}) }
            }
    }
    func request(_ operation: String, _ value: [String: Any]) throws -> [String: Any] {
        XCTAssertEqual(operation, "apply_framed_transfer")
        if applyErrorAt == applied.count { throw FolioleFramedSyncValidationError(applyError) }
        let id = try XCTUnwrap(value["transfer_id"] as? String); applied.append(id)
        return ["transfer_id": id, "content_id": try XCTUnwrap(content[id]).hex,
            "applied_state_hash": Data(repeating: 9, count: 32).hex,
            "receiver_device_id": context.receiverDeviceID, "receiver_library_epoch": context.receiverLibraryEpoch]
    }
}
