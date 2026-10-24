import Foundation
import FolioleFramedSyncRuntime

/** Permission for one native write operation; no persisted transfer state. */
final class FolioleAttachmentReceiveAuthorization {
    let requestID: Data
    let storageKey: String
    let byteLength: UInt64
    let start: UInt64
    let maxBlocks: Int
    private(set) var offset: UInt64
    private(set) var blocks = 0
    private(set) var pending = false
    private var ended = false
    var maximumWireBytes: Int { 96 + maxBlocks * 524288 + (maxBlocks + 1) * (24576 + 48) }

    init(requestID: Data, storageKey: String, byteLength: UInt64, offset: UInt64, maxBlocks: Int) throws {
        guard requestID.count == 16, FolioleCompanionCanonicalAttachmentKey.valid(storageKey), byteLength > 0,
              byteLength <= 8589934592, offset < byteLength, offset % 524288 == 0, (1...64).contains(maxBlocks) else { throw Self.invalid() }
        self.requestID = requestID; self.storageKey = storageKey; self.byteLength = byteLength
        self.start = offset; self.offset = offset; self.maxBlocks = maxBlocks
    }
    func accept(_ value: Foliole_Sync_V22_RequestAttachment) throws -> Bool {
        guard !ended, requestID == value.requestID, storageKey == value.storageKey, value.operation == "pull",
              byteLength == value.byteLength, offset == value.offset else { throw Self.invalid() }
        if value.state == "end" {
            guard value.data.isEmpty, blocks > 0 || value.pending || offset == byteLength else { throw Self.invalid() }
            ended = true; pending = value.pending; return false
        }
        guard value.state == "block", blocks < maxBlocks, offset < byteLength,
              value.data.count == min(524288, Int(byteLength - offset)) else { throw Self.invalid() }
        offset += UInt64(value.data.count); blocks += 1; return true
    }
    func finish() throws { guard ended else { throw FolioleFramedSyncValidationError("attachment_response_incomplete") } }
    private static func invalid() -> Error { FolioleFramedSyncValidationError("attachment_receive_authorization_invalid") }
}
