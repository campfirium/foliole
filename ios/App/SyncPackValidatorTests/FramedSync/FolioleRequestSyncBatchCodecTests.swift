import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime

final class FolioleRequestSyncBatchCodecTests: XCTestCase {
    func testObjectResultRoundTripsAsControlAndRejectsInvalidIdentity() throws {
        var result = Foliole_Sync_V22_RequestObjectResult()
        result.requestID = Data(repeating: 7, count: 16)
        result.objectType = "node"
        result.globalID = "node-1"
        for error in ["", "node_version_missing_parents:parent"] {
            result.error = error
            var message = Foliole_Sync_V22_ProtocolMessage()
            message.requestObjectResult = result
            let validated = try FolioleFramedSyncCodec.validateOutbound(message, authenticatedFrameType: 1)
            let encoded = try FolioleFramedSyncCodec.encode(validated)
            let decoded = try FolioleFramedSyncCodec.decode(encoded, authenticatedFrameType: 1)
            XCTAssertEqual(decoded.payload.corpusName, "request_object_result")
            XCTAssertEqual(try FolioleFramedSyncCodec.encode(decoded), encoded)
            XCTAssertThrowsError(try FolioleFramedSyncCodec.decode(encoded, authenticatedFrameType: 3))
            message.requestObjectResult.requestID = Data(repeating: 7, count: 15)
            XCTAssertThrowsError(try FolioleFramedSyncCodec.validateOutbound(message, authenticatedFrameType: 1))
        }
        var message = Foliole_Sync_V22_ProtocolMessage()
        message.requestObjectResult = result
        message.requestObjectResult.error = String(repeating: "x", count: 65_537)
        XCTAssertThrowsError(try FolioleFramedSyncCodec.validateOutbound(message, authenticatedFrameType: 1))
        message.requestObjectResult = result
        message.requestObjectResult.globalID = ""
        XCTAssertThrowsError(try FolioleFramedSyncCodec.validateOutbound(message, authenticatedFrameType: 1))
    }

    func testBatchEndRoundTripsUInt32CountAndRequiresRequestIdentity() throws {
        for count in [UInt32(0), 128, UInt32.max] {
            var message = Foliole_Sync_V22_ProtocolMessage()
            message.requestBatchEnd.requestID = Data(repeating: 9, count: 16)
            message.requestBatchEnd.objectCount = count
            let validated = try FolioleFramedSyncCodec.validateOutbound(message, authenticatedFrameType: 1)
            let encoded = try FolioleFramedSyncCodec.encode(validated)
            let decoded = try FolioleFramedSyncCodec.decode(encoded, authenticatedFrameType: 1)
            XCTAssertEqual(decoded.payload.corpusName, "request_batch_end")
            XCTAssertEqual(try FolioleFramedSyncCodec.encode(decoded), encoded)
            XCTAssertThrowsError(try FolioleFramedSyncCodec.decode(encoded, authenticatedFrameType: 3))
            message.requestBatchEnd.requestID = Data()
            XCTAssertThrowsError(try FolioleFramedSyncCodec.validateOutbound(message, authenticatedFrameType: 1))
        }
    }
}
