import Foundation
import XCTest
import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncBodyRangeResponseTests: XCTestCase {
    private let bodyHash = Data(repeating: 0xab, count: 32)
    private let offset = UInt64.max

    func testExactBinaryAndEmptyRangeResponses() throws {
        let body = Data([0xef, 0xbb, 0xbf, 0, 255, 128])
        XCTAssertEqual(try decode(value(body), maxBytes: body.count), body)
        XCTAssertEqual(try decode(value(Data()), maxBytes: 1), Data())
        let maximum = Data(repeating: 255, count: 512 * 1024)
        XCTAssertEqual(try decode(value(maximum), maxBytes: maximum.count), maximum)
    }

    func testHashAndOffsetMustMatchExactCanonicalStringIdentity() throws {
        let original = value(Data([1]))
        let invalidHashes: [Any] = [bodyHash.hex.uppercased(), Data(repeating: 1, count: 32).hex, "ab", NSNull()]
        for invalid in invalidHashes {
            var response = original
            response["sha256"] = invalid
            XCTAssertThrowsError(try decode(response))
        }
        let invalidOffsets: [Any] = ["0", "018446744073709551615", "+18446744073709551615", "18446744073709551616", NSNumber(value: true)]
        for invalid in invalidOffsets {
            var response = original
            response["offset"] = invalid
            XCTAssertThrowsError(try decode(response))
        }
        XCTAssertThrowsError(try FolioleFramedSyncBodyRangeResponse.decode(value: original, hash: Data(), offset: offset, maxBytes: 1))
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

    func testCallerRangeLimitMustBeBetweenOneAnd512KiB() throws {
        for limit in [Int.min, -1, 0, 512 * 1024 + 1, Int.max] {
            XCTAssertThrowsError(try decode(value(Data()), maxBytes: limit))
        }
    }

    private func value(_ bytes: Data) -> [String: Any] {
        ["sha256": bodyHash.hex, "offset": String(offset), "byte_length": String(bytes.count),
         "data_base64": bytes.base64EncodedString()]
    }

    private func decode(_ value: [String: Any], maxBytes: Int = 1) throws -> Data {
        try FolioleFramedSyncBodyRangeResponse.decode(value: value, hash: bodyHash, offset: offset, maxBytes: maxBytes)
    }
}
