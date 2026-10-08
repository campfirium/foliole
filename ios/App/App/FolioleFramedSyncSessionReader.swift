import Foundation
import FolioleFramedSyncRuntime

struct FolioleFramedSyncSessionReadResult {
    let sessionID: Data
    let messages: [FolioleFramedSyncValidatedMessage]
}

enum FolioleFramedSyncSessionReader {
    static func read(
        _ data: Data, groupKey: Data, context: FolioleFramedSyncSessionContext,
        maximumFrames: Int
    ) throws -> FolioleFramedSyncSessionReadResult {
        guard (1...FolioleFramedSyncLimits.maxSessionFrames).contains(maximumFrames) else {
            throw FolioleFramedSyncValidationError("session_frame_limit_invalid")
        }
        guard data.count <= FolioleFramedSyncLimits.maxSessionBytes else {
            throw FolioleFramedSyncValidationError("session_byte_limit_exceeded")
        }
        return try read(InputStream(data: data), groupKey: groupKey, context: context, maximumFrames: maximumFrames)
    }

    static func read(
        _ stream: InputStream, groupKey: Data, context: FolioleFramedSyncSessionContext,
        maximumFrames: Int
    ) throws -> FolioleFramedSyncSessionReadResult {
        var messages = [FolioleFramedSyncValidatedMessage]()
        let session = try readEach(stream, groupKey: groupKey, context: context,
            maximumFrames: maximumFrames) { messages.append($0) }
        return .init(sessionID: session.sessionID, messages: messages)
    }

    static func readEach(
        _ stream: InputStream, groupKey: Data, context: FolioleFramedSyncSessionContext,
        maximumFrames: Int, owner: FolioleFramedSyncPayloadBudget? = nil,
        onPlaintextBytes: ((Int) throws -> Void)? = nil,
        consume: (FolioleFramedSyncValidatedMessage) throws -> Void
    ) throws -> FolioleFramedSyncSessionReadResult {
        guard (1...FolioleFramedSyncLimits.maxSessionFrames).contains(maximumFrames) else {
            throw FolioleFramedSyncValidationError("session_frame_limit_invalid")
        }
        let reader = FolioleFramedSyncStreamReader(input: stream)
        let preamble = try reader.nextPreamble()
        let sessionID = try context.validate(preamble)
        var sequence: UInt64 = 0
        var bytes = FolioleFramedSyncPreamble.byteCount
        while try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .inbound, { _ in
            guard let frame = try reader.nextFrame() else { return false }
            bytes += FolioleFramedSyncWireHeader.byteCount + frame.ciphertext.count
            guard bytes <= FolioleFramedSyncLimits.maxSessionBytes else {
                throw FolioleFramedSyncValidationError("session_byte_limit_exceeded")
            }
            guard sequence < UInt64(maximumFrames) else {
                throw FolioleFramedSyncValidationError("session_frame_limit_exceeded")
            }
            let plaintext = try FolioleFramedSyncFrameCrypto.decrypt(
                groupKey: groupKey, preamble: preamble,
                frame: frame, expectedSequence: sequence
            )
            try onPlaintextBytes?(plaintext.count)
            try consume(FolioleFramedSyncCodec.decode(
                plaintext, authenticatedFrameType: frame.header.frameType.rawValue
            ))
            sequence += 1
            return true
        }) {}
        return .init(sessionID: sessionID, messages: [])
    }
}
