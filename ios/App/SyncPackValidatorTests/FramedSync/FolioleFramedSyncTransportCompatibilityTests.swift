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
                       "8b926880b18711d13081d20fb27bfdfde806371be0115bf0891ab7a98f1030d2")
        let preamble = try FolioleFramedSyncPreamble(decoding: Data(hex:
            "464f4c53594e43320060001d010000008b926880b18711d13081d20fb27bfdfde806371be0115bf0891ab7a98f1030d200112233445566778899aabbccddeeff0506070800000000000000000000000000000000000000000000000000000000"))
        let headerBytes = try Data(hex: "0000001e000000000000000000010000")
        let frame = FolioleFramedSyncWireFrame(
            header: try .init(decoding: headerBytes), headerBytes: headerBytes,
            ciphertext: try Data(hex: "0eab8a8acb9612cad746e3909df4ae0aa5b410db0422ca13f1c4b54b1e25")
        )
        let plaintext = try FolioleFramedSyncFrameCrypto.decrypt(
            groupKey: Data(0...31), preamble: preamble, frame: frame, expectedSequence: 0
        )
        XCTAssertEqual(String(data: plaintext, encoding: .utf8), "session-vector")
    }

    func testFrozenTransferVectorAuthenticates() throws {
        let preamble = try FolioleFramedSyncPreamble(decoding: Data(hex:
            "464f4c53594e43320060001d02000000202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f101112131415161718191a1b1c1d1e1f0102030400000000000000000000000000000000000000000000000000000000"))
        let header = try Data(hex: "0000001c000000000000000000020000")
        let frame = FolioleFramedSyncWireFrame(
            header: try .init(decoding: header), headerBytes: header,
            ciphertext: try Data(hex: "d472ab32ec48331d4665fa4f883727df470e197af2d252d21833dfef")
        )
        XCTAssertEqual(try FolioleFramedSyncFrameCrypto.decrypt(
            groupKey: Data(0...31), preamble: preamble, frame: frame, expectedSequence: 0),
            try Data(hex: "6672616d652d766563746f72"))
    }

    func testRetiredAndUnknownVersionsFailClosed() throws {
        for version: UInt8 in [28, 30] {
            var encoded = FolioleFramedSyncWireTests.preamble()
            encoded[11] = version
            XCTAssertThrowsError(try FolioleFramedSyncPreamble(decoding: encoded)) { error in
                XCTAssertEqual((error as? FolioleFramedSyncValidationError)?.code,
                               "framed_sync_protocol_version_unsupported")
            }
        }
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
