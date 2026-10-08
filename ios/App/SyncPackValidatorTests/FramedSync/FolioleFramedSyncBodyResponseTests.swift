import Foundation
import XCTest
import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncBodyResponseTests: XCTestCase {
    private let bodyHash = Data(repeating: 0xab, count: 32)

    func testExactBinaryAndEmptyBodyResponses() throws {
        let body = Data([0xef, 0xbb, 0xbf, 0, 255, 128])
        XCTAssertEqual(try decode(value(body), byteLength: body.count), body)
        XCTAssertEqual(try decode(value(Data()), byteLength: 0), Data())
        let maximum = Data(repeating: 255, count: 1024 * 1024)
        XCTAssertEqual(try decode(value(maximum), byteLength: maximum.count), maximum)
    }

    func testHashMustMatchExactCanonicalStringIdentity() throws {
        let original = value(Data([1]))
        let invalidHashes: [Any] = [bodyHash.hex.uppercased(), Data(repeating: 1, count: 32).hex, "ab", NSNull()]
        for invalid in invalidHashes {
            var response = original
            response["sha256"] = invalid
            XCTAssertThrowsError(try decode(response))
        }
        XCTAssertThrowsError(try FolioleFramedSyncBodyResponse.decode(value: original, hash: Data(), byteLength: 1))
    }

    func testLengthIsCanonicalDecimalStringAndNeverANumberOrBoolean() throws {
        let invalidLengths: [Any] = ["01", "+1", "-1", "1.0", "1e0", " 1", "18446744073709551616", NSNumber(value: 1), NSNumber(value: true), NSNumber(value: 1.5)]
        for invalid in invalidLengths {
            var response = value(Data([1]))
            response["byte_length"] = invalid
            XCTAssertThrowsError(try decode(response))
        }
        var tooLong = value(Data([1]))
        tooLong["byte_length"] = "2"
        XCTAssertThrowsError(try decode(tooLong))
        var mismatch = value(Data([1]))
        mismatch["byte_length"] = "0"
        XCTAssertThrowsError(try decode(mismatch))
    }

    func testBase64MustBeCanonicalBoundedAndHaveDeclaredByteLength() throws {
        for invalid in ["AQ", "AQ===", "AR==", "AQ==\n", "AQ-_", "@@@@", String(repeating: "A", count: 8)] {
            var response = value(Data([1]))
            response["data_base64"] = invalid
            XCTAssertThrowsError(try decode(response))
        }
        var excessiveBytes = value(Data([1, 2, 3]))
        excessiveBytes["byte_length"] = "1"
        XCTAssertThrowsError(try decode(excessiveBytes))
        var missing = value(Data())
        missing.removeValue(forKey: "data_base64")
        XCTAssertThrowsError(try decode(missing))
    }

    func testCallerLengthMustBeAtMostOneMiB() throws {
        for length in [UInt64(1_048_577), UInt64.max] {
            XCTAssertThrowsError(try FolioleFramedSyncBodyResponse.decode(value: value(Data()), hash: bodyHash, byteLength: length))
        }
    }

    private func value(_ bytes: Data) -> [String: Any] {
        ["sha256": bodyHash.hex, "byte_length": String(bytes.count),
         "data_base64": bytes.base64EncodedString()]
    }

    private func decode(_ value: [String: Any], byteLength: Int = 1) throws -> Data {
        try FolioleFramedSyncBodyResponse.decode(value: value, hash: bodyHash, byteLength: UInt64(byteLength))
    }
}
