import Foundation

struct FramedSyncFrameHeader {
    static let byteCount = 16
    static let maximumCiphertextBytes: UInt32 = 2 * 1024 * 1024 + 16

    let ciphertextBytes: UInt32
    let flags: UInt16
    let frameType: UInt16
    let sequence: UInt64

    static func decode(_ bytes: Data) throws -> FramedSyncFrameHeader {
        guard bytes.count == byteCount else { throw FrameHeaderError.invalidSize }
        let result = FramedSyncFrameHeader(
            ciphertextBytes: bytes.readBigEndianUInt32(at: 0),
            flags: bytes.readBigEndianUInt16(at: 14),
            frameType: bytes.readBigEndianUInt16(at: 12),
            sequence: bytes.readBigEndianUInt64(at: 4)
        )
        guard result.ciphertextBytes <= maximumCiphertextBytes else {
            throw FrameHeaderError.ciphertextLimitExceeded
        }
        guard result.frameType != 0, result.flags == 0 else {
            throw FrameHeaderError.invalidHeader
        }
        return result
    }
}

enum FrameHeaderError: Error, Equatable {
    case ciphertextLimitExceeded
    case invalidHeader
    case invalidSize
}

private extension Data {
    func readBigEndianUInt16(at offset: Int) -> UInt16 {
        (UInt16(self[offset]) << 8) | UInt16(self[offset + 1])
    }

    func readBigEndianUInt32(at offset: Int) -> UInt32 {
        (UInt32(readBigEndianUInt16(at: offset)) << 16) |
            UInt32(readBigEndianUInt16(at: offset + 2))
    }

    func readBigEndianUInt64(at offset: Int) -> UInt64 {
        (UInt64(readBigEndianUInt32(at: offset)) << 32) |
            UInt64(readBigEndianUInt32(at: offset + 4))
    }
}
