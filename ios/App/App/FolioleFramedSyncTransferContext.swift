import Foundation
import FolioleFramedSyncRuntime

extension FolioleFramedSyncPreamble {
    var contextKind: UInt8 { encoded[12] }
    var contextID: Data { encoded[16..<48] }
    var identifier: Data { encoded[48..<64] }
    var noncePrefix: Data { encoded[64..<68] }
    var startingSequence: UInt64 { encoded.uint64BE(at: 68) }
}

extension Data {
    var hex: String { map { String(format: "%02x", $0) }.joined() }

    mutating func appendLengthPrefixed(_ value: String) {
        appendLengthPrefixed(Data(value.utf8))
    }

    mutating func appendLengthPrefixed(_ value: Data) {
        appendUInt32BE(UInt32(value.count)); append(value)
    }

    mutating func appendUInt32BE(_ value: UInt32) {
        for shift in stride(from: 24, through: 0, by: -8) { append(UInt8((value >> shift) & 0xff)) }
    }

    mutating func appendUInt64BE(_ value: UInt64) {
        for shift in stride(from: 56, through: 0, by: -8) { append(UInt8((value >> shift) & 0xff)) }
    }

    func uint64BE(at offset: Int) -> UInt64 {
        (0..<8).reduce(0) { ($0 << 8) | UInt64(self[offset + $1]) }
    }
}
