import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncTransportCompatibilityTests: XCTestCase {
    func testFrozenSessionVectorAuthenticatesWithCanonicalPeerContext() throws {
        let context = try FolioleFramedSyncSessionContext(
            groupID: "group-a", initiatorDeviceID: "device-a", initiatorLibraryEpoch: "epoch-a",
            responderDeviceID: "device-b", responderLibraryEpoch: "epoch-b"
        )
        let sessionID = try Data(hex: "00112233445566778899aabbccddeeff")
        XCTAssertEqual(context.deriveContextID(sessionID: sessionID).hex,
                       "9cd98dcbdf193c29fa6e2b9016bf3703ddeae6479ca9e510c79031392209a7ee")
        let preamble = try FolioleFramedSyncPreamble(decoding: Data(hex:
            "464f4c53594e43320060001a010000009cd98dcbdf193c29fa6e2b9016bf3703ddeae6479ca9e510c79031392209a7ee00112233445566778899aabbccddeeff0506070800000000000000000000000000000000000000000000000000000000"))
        let headerBytes = try Data(hex: "0000001e000000000000000000010000")
        let frame = FolioleFramedSyncWireFrame(
            header: try .init(decoding: headerBytes), headerBytes: headerBytes,
            ciphertext: try Data(hex: "d5006e492afee70649d4e7b1db4486f55d612ab7c3fcf40a193b9a8f4b5e")
        )
        let plaintext = try FolioleFramedSyncFrameCrypto.decrypt(
            groupKey: Data(0...31), preamble: preamble, frame: frame, expectedSequence: 0
        )
        XCTAssertEqual(String(data: plaintext, encoding: .utf8), "session-vector")
    }

    func testHTTPParserPreservesBinaryFramedBody() throws {
        let body = Data([0, 255, 1, 254])
        let head = "POST /companion/framed-sync HTTP/1.1\r\n" +
            "Content-Type: application/vnd.foliole.framed-sync\r\n" +
            "Content-Length: \(body.count)\r\n\r\n"
        let request = try FolioleCompanionHttpMessage.parse(Data(head.utf8) + body)
        XCTAssertEqual(request.bodyData, body)
        XCTAssertTrue(request.body.isEmpty)
    }
}

private extension Data {
    init(hex value: String) throws {
        let value = value.filter { !$0.isWhitespace }
        guard value.count.isMultiple(of: 2) else {
            throw FolioleFramedSyncValidationError("test_hex_invalid")
        }
        self.init(capacity: value.count / 2)
        for offset in stride(from: 0, to: value.count, by: 2) {
            let start = value.index(value.startIndex, offsetBy: offset)
            let end = value.index(start, offsetBy: 2)
            guard let byte = UInt8(value[start..<end], radix: 16) else {
                throw FolioleFramedSyncValidationError("test_hex_invalid")
            }
            append(byte)
        }
    }

    var hex: String { map { String(format: "%02x", $0) }.joined() }
}
