import Foundation
import FolioleFramedSyncRuntime

/** Authenticates each frame and its write permission before invoking the file writer. */
enum FolioleRequestSyncAttachmentFrames {
    static func read(stream: FolioleFramedSyncStreamReader, groupKey: Data, context: FolioleFramedSyncSessionContext,
                     permission: FolioleAttachmentReceiveAuthorization, check: () throws -> Void,
                     consume: (UInt64, Data) throws -> Void) throws {
        let preamble = try stream.nextPreamble()
        _ = try context.validate(preamble)
        var sequence = 0, wireBytes = 96
        while let frame = try stream.nextFrame() {
            try check()
            wireBytes += 16 + frame.ciphertext.count
            guard sequence < permission.maxBlocks + 1, wireBytes <= permission.maximumWireBytes else {
                throw FolioleFramedSyncValidationError("attachment_response_frame_limit")
            }
            let plaintext = try FolioleFramedSyncFrameCrypto.decrypt(groupKey: groupKey, preamble: preamble,
                frame: frame, expectedSequence: UInt64(sequence))
            let decoded = try FolioleFramedSyncCodec.decode(plaintext, authenticatedFrameType: frame.header.frameType.rawValue)
            guard case .requestAttachment(let attachment) = decoded.payload,
                  plaintext.count - attachment.data.count <= 24584 else {
                throw FolioleFramedSyncValidationError("attachment_response_invalid")
            }
            let offset = permission.offset
            if try permission.accept(attachment) { try check(); try consume(offset, attachment.data) }
            sequence += 1
        }
        try check(); try permission.finish()
    }
}
