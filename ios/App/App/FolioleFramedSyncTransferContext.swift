import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

struct FolioleFramedSyncTransferContext {
    let groupID: String
    let senderDeviceID: String
    let senderLibraryEpoch: String
    let receiverDeviceID: String
    let receiverLibraryEpoch: String

    func validate(_ preamble: FolioleFramedSyncPreamble, header: Foliole_Sync_V22_TransferHeader) throws {
        guard preamble.contextKind == 2, preamble.startingSequence == 0,
              header.transferID == preamble.contextID,
              header.attemptID == preamble.identifier,
              header.manifest.groupID == groupID,
              deriveTransferID(contentID: header.manifest.contentID) == preamble.contextID else {
            throw FolioleFramedSyncValidationError("inbound_transfer_identity_mismatch")
        }
    }

    func deriveTransferID(contentID: Data) -> Data {
        var bytes = Data()
        bytes.appendLengthPrefixed("foliole-framed-sync-transfer-v1")
        bytes.appendUInt32BE(22)
        [groupID, senderDeviceID, senderLibraryEpoch,
         receiverDeviceID, receiverLibraryEpoch].forEach { bytes.appendLengthPrefixed($0) }
        bytes.appendLengthPrefixed(contentID)
        return Data(SHA256.hash(data: bytes))
    }
}

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
