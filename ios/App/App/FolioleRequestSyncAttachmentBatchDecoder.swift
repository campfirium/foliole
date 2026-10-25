import Foundation
import FolioleFramedSyncRuntime

/** Incremental multi-file decoder, retaining one ciphertext frame while the file consumer runs. */
final class FolioleRequestSyncAttachmentBatchDecoder {
    private let reader = FolioleFramedSyncIncrementalReader(maximumCiphertextBytes: 524288 + 24584 + 16)
    private let permission: FolioleAttachmentBatchAuthorization
    private let key: Data
    private let context: FolioleFramedSyncSessionContext
    private let check: () throws -> Void
    private let consume: (FolioleAttachmentBatchAuthorization.Event, Foliole_Sync_V22_RequestAttachment) throws -> Void
    private var sequence = 0
    private var wireBytes = 96
    var peakBufferedBytes: Int { reader.peakBufferedBytes }

    init(groupKey: Data, context: FolioleFramedSyncSessionContext, permission: FolioleAttachmentBatchAuthorization,
         check: @escaping () throws -> Void,
         consume: @escaping (FolioleAttachmentBatchAuthorization.Event, Foliole_Sync_V22_RequestAttachment) throws -> Void) {
        self.key = groupKey; self.context = context; self.permission = permission
        self.check = check; self.consume = consume
    }
    func append(_ data: Data) throws {
        try check()
        try reader.append(data, validate: { _ = try self.context.validate($0) }) { preamble, frame in
            try self.check()
            self.wireBytes += 16 + frame.ciphertext.count
            guard self.wireBytes <= self.permission.maximumWireBytes else {
                throw FolioleFramedSyncValidationError("attachment_batch_wire_limit")
            }
            let plaintext = try FolioleFramedSyncFrameCrypto.decrypt(groupKey: self.key, preamble: preamble,
                frame: frame, expectedSequence: UInt64(self.sequence))
            let decoded = try FolioleFramedSyncCodec.decode(plaintext, authenticatedFrameType: frame.header.frameType.rawValue)
            guard case .requestAttachment(let value) = decoded.payload else {
                throw FolioleFramedSyncValidationError("attachment_response_invalid")
            }
            let event = try self.permission.accept(value, encodedBytes: plaintext.count)
            try self.check(); try self.consume(event, value)
            self.sequence += 1
        }
    }
    func finish() throws { try check(); try reader.finish(); try permission.finish() }
}
