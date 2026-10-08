import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncOutboundBatchTests: XCTestCase {
    func testFreshFlagsCombineIndependentOriginalTransfersAndCompleteEachReceipt() async throws {
        let fixture = try FramedSyncBatchSenderFixture(); defer { fixture.cleanup() }
        fixture.flags = ["one": true, "two": true]
        let outcomes = try await fixture.send(["one", "two"])
        XCTAssertEqual(fixture.groups, [["one", "two"]]); XCTAssertEqual(fixture.sequences, [true])
        XCTAssertEqual(outcomes.compactMap { $0["object_id"] as? String }, ["one", "two"])
        XCTAssertEqual(outcomes.compactMap { $0["kind"] as? String }, ["committed", "committed"])
        XCTAssertEqual(Set(fixture.completed).count, 2)
        let database = try FolioleFramedSyncTransferDatabase(url: fixture.root.appendingPathComponent("sender.db"))
        XCTAssertTrue(try database.rows("SELECT 1 FROM framed_sync_ios_outbound_attempts").isEmpty)
    }

    func testMissingOrFalseFlagUsesExplicitSinglePathAndFlushesSafePrefix() async throws {
        let fixture = try FramedSyncBatchSenderFixture(); defer { fixture.cleanup() }
        fixture.flags = ["one": true, "two": false, "four": true, "five": true]
        let outcomes = try await fixture.send(["one", "two", "three", "four", "five"])
        XCTAssertEqual(fixture.groups, [["one"], ["two"], ["three"], ["four", "five"]])
        XCTAssertEqual(fixture.sequences, [false, false, false, true])
        XCTAssertEqual(outcomes.compactMap { $0["kind"] as? String }, Array(repeating: "committed", count: 5))
    }

    func testTargetPackingAndLargeFragmentedOriginalStayBounded() async throws {
        let fixture = try FramedSyncBatchSenderFixture(); defer { fixture.cleanup() }
        fixture.flags = ["one": true, "two": true, "three": true, "large": true, "last": true]
        fixture.sizes = ["one": 300 * 1024, "two": 300 * 1024, "three": 300 * 1024, "large": 1100 * 1024]
        let outcomes = try await fixture.send(["one", "two", "three", "large", "last"])
        XCTAssertEqual(fixture.groups, [["one", "two"], ["three"], ["large"], ["last"]])
        XCTAssertEqual(fixture.sequences, [true, false, false, false])
        XCTAssertEqual(outcomes.count, 5); XCTAssertEqual(Set(fixture.completed).count, 5)
    }

    func testKnownDependencyDefersOnlyUnsafeItemAndContinuesIndependentNeighbor() async throws {
        for prefix in ["framed_sync_node_parent_missing:", "node_position_lineage_unproven:",
                       "parent_order_position_lineage_unproven:", "sync_parent_order_body_unavailable:",
            "framed_sync_review_node_missing:", "framed_sync_parent_relation_version_missing:"] {
            let fixture = try FramedSyncBatchSenderFixture(); defer { fixture.cleanup() }
            fixture.flags = ["one": true, "child": false, "last": true]
            let code = FolioleFramedSyncHTTPTransport.httpErrorCode(statusCode: 400,
                body: try JSONSerialization.data(withJSONObject: ["error": prefix + "missing"]))
            XCTAssertEqual(code, "framed_sync_http_400:" + prefix + "missing")
            fixture.errors = ["child": code]
            let outcomes = try await fixture.send(["one", "child", "last"])
            XCTAssertEqual(fixture.groups, [["one"], ["child"], ["last"]])
            XCTAssertEqual(outcomes.compactMap { $0["kind"] as? String }, ["committed", "deferred", "committed"])
            XCTAssertEqual(outcomes[1]["error"] as? String, code)
            XCTAssertEqual(fixture.completed.count, 2)
        }
    }

    func testBatchDependencyReplaysOriginalCommittedPrefixAndDefersOnlyChild() async throws {
        for prefix in ["framed_sync_node_parent_missing:", "node_position_lineage_unproven:",
                       "parent_order_position_lineage_unproven:", "sync_parent_order_body_unavailable:",
            "framed_sync_review_node_missing:", "framed_sync_parent_relation_version_missing:"] {
            let fixture = try FramedSyncBatchSenderFixture(); defer { fixture.cleanup() }
            fixture.flags = ["one": true, "child": true, "parent": true]
            fixture.errors = ["child": "framed_sync_http_400:" + prefix + "parent"]
            let outcomes = try await fixture.send(["one", "child", "parent"])
            XCTAssertEqual(fixture.groups, [["one", "child"], ["one"], ["child"], ["parent"]])
            XCTAssertEqual(fixture.prepared, ["one", "child", "parent"])
            XCTAssertEqual(fixture.replayed[0], fixture.replayed[2])
            XCTAssertEqual(outcomes.compactMap { $0["kind"] as? String }, ["committed", "deferred", "committed"])
            XCTAssertEqual(Set(fixture.completed), fixture.remotelyCommitted)
            XCTAssertEqual(fixture.completed.count, 2)
        }
    }

    func testBatchAuthenticationAndIdentityFailuresNeverReplaySingles() async throws {
        for code in ["framed_sync_http_401:authentication_failed", "receipt_identity_conflict", "framed_sync_frame_truncated",
            "receipt_identity_conflict:framed_sync_node_parent_missing:parent",
            "aead_failed:node_position_lineage_unproven:parent",
            "framed_sync_http_401:sync_parent_order_body_unavailable:parent",
            "framed_sync_http_400:framed_sync_node_parent_missing:parent extra",
            "framed_sync_node_parent_missing:", "framed_sync_node_parent_missing:parent\n"] {
            let fixture = try FramedSyncBatchSenderFixture(); defer { fixture.cleanup() }
            fixture.flags = ["one": true, "two": true]; fixture.errors = ["two": code]
            do { _ = try await fixture.send(["one", "two"]); XCTFail("failure must propagate") }
            catch { XCTAssertEqual(error.localizedDescription, code) }
            XCTAssertEqual(fixture.groups, [["one", "two"]])
            XCTAssertTrue(fixture.completed.isEmpty)
        }
    }

    func testMissingDuplicateAndCorruptReceiptRejectAfterCompletingAuthenticatedPrefix() async throws {
        for response in [FramedSyncBatchSenderFixture.Response.omitLast, .duplicateFirst, .corruptLast] {
            let fixture = try FramedSyncBatchSenderFixture(); defer { fixture.cleanup() }
            fixture.flags = ["one": true, "two": true]; fixture.response = response
            do { _ = try await fixture.send(["one", "two"]); XCTFail("incomplete receipt sequence must fail") }
            catch { XCTAssertNil(FolioleFramedSyncOutboundBatchSender.dependency(error)) }
            XCTAssertEqual(fixture.completed.count, 1)
        }
    }

    func testUnexpectedSingleFailureIsNeverConvertedToDeferred() async throws {
        let fixture = try FramedSyncBatchSenderFixture(); defer { fixture.cleanup() }
        fixture.errors = ["one": "unexpected_business_failure"]
        do { _ = try await fixture.send(["one"]); XCTFail("unexpected failure must propagate") }
        catch { XCTAssertEqual(error.localizedDescription, "unexpected_business_failure") }
        XCTAssertTrue(fixture.completed.isEmpty)
    }

    func testMetadataAndBatchCountLimitsRejectBeforePreparingPayload() throws {
        let fixture = try FramedSyncBatchSenderFixture(); defer { fixture.cleanup() }
        XCTAssertFalse(FolioleFramedSyncOutboundPreparation.batchReady(NSNumber(value: 1)))
        XCTAssertFalse(FolioleFramedSyncOutboundPreparation.batchReady(nil))
        XCTAssertTrue(FolioleFramedSyncOutboundPreparation.batchReady(true))
        XCTAssertThrowsError(try fixture.request.selections([] as [[String: Any]]))
        XCTAssertThrowsError(try fixture.request.selections(Array(repeating: ["object_id": "x"], count: 129)))
        XCTAssertThrowsError(try FolioleFramedSyncOutboundRequest.validateMetadata(["value": String(repeating: "x", count: 768 * 1024)]))
        XCTAssertNoThrow(try FolioleFramedSyncOutboundRequest.validateMetadata(["value": "small"])); XCTAssertTrue(fixture.groups.isEmpty)
    }
}
