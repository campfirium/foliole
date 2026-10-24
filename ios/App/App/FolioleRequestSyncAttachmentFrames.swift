import Foundation
import FolioleFramedSyncRuntime

/** Authenticated frame/file primitive. Shared code decides offsets, recovery and publication. */
enum FolioleRequestSyncAttachmentFrames {
    static func read(stream: FolioleFramedSyncStreamReader, groupKey: Data, context: FolioleFramedSyncSessionContext,
                     maxBlocks: Int = 32, check: () throws -> Void, consume: (Int, Data, Data) throws -> Void) throws -> Data {
        guard (1...64).contains(maxBlocks) else { throw FolioleFramedSyncValidationError("attachment_response_window_invalid") }
        let preamble = try stream.nextPreamble()
        _ = try context.validate(preamble)
        var sequence = 0
        while let frame = try stream.nextFrame() {
            try check()
            guard sequence < maxBlocks + 1 else { throw FolioleFramedSyncValidationError("attachment_response_frame_limit") }
            let plaintext = try FolioleFramedSyncFrameCrypto.decrypt(groupKey: groupKey, preamble: preamble,
                frame: frame, expectedSequence: UInt64(sequence))
            let decoded = try FolioleFramedSyncCodec.decode(plaintext, authenticatedFrameType: frame.header.frameType.rawValue)
            guard case .requestAttachment(var attachment) = decoded.payload, attachment.operation == "pull",
                  !(attachment.state == "block" && sequence >= maxBlocks),
                  (attachment.state == "block" ? !attachment.data.isEmpty : attachment.data.isEmpty) else {
                throw FolioleFramedSyncValidationError("attachment_response_block_invalid")
            }
            let block = attachment.data
            attachment.data = Data()
            var envelope = Foliole_Sync_V22_ProtocolMessage()
            envelope.requestAttachment = attachment
            let metadata = try FolioleFramedSyncCodec.encode(FolioleFramedSyncCodec.validateOutbound(envelope, authenticatedFrameType: 1))
            guard metadata.count <= 24576 else { throw FolioleFramedSyncValidationError("attachment_response_metadata_limit") }
            try consume(sequence, metadata, block)
            sequence += 1
        }
        try check()
        return preamble.encoded
    }
}
