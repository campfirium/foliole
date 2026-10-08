import Foundation
import FolioleFramedSyncRuntime

enum FolioleFramedSyncSessionWriter {
    static func encode(
        groupKey: Data, context: FolioleFramedSyncSessionContext,
        messages: [FolioleFramedSyncValidatedMessage],
        nonceDirectory: URL = defaultNonceDirectory(), owner: FolioleFramedSyncPayloadBudget? = nil
    ) throws -> Data {
        let output = OutputStream.toMemory()
        try write(groupKey: groupKey, context: context, output: output, nonceDirectory: nonceDirectory, owner: owner) { emit in
            for message in messages { try emit(message) }
        }
        guard let data = output.property(forKey: .dataWrittenToMemoryStreamKey) as? Data else {
            throw FolioleFramedSyncValidationError("framed_sync_stream_write_failed")
        }
        return data
    }

    static func write(
        groupKey: Data, context: FolioleFramedSyncSessionContext, output: OutputStream,
        nonceDirectory: URL = defaultNonceDirectory(), owner: FolioleFramedSyncPayloadBudget? = nil,
        produce: (_ emit: (FolioleFramedSyncValidatedMessage) throws -> Void) throws -> Void
    ) throws {
        let sessionID = withUnsafeBytes(of: UUID().uuid) { Data($0) }
        var random = UInt32.random(in: .min ... .max).bigEndian
        let noncePrefix = withUnsafeBytes(of: &random) { Data($0) }
        let contextID = context.deriveContextID(sessionID: sessionID)
        let preamble = try makePreamble(
            contextID: contextID, sessionID: sessionID, noncePrefix: noncePrefix
        )
        try persistNonceState(
            sessionID: sessionID, contextID: contextID,
            noncePrefix: noncePrefix, directory: nonceDirectory
        )
        let writer = FolioleFramedSyncStreamWriter(output: output)
        try writer.write(preamble: preamble.encoded)
        var sessionBytes = FolioleFramedSyncPreamble.byteCount
        var index = 0
        try produce { message in
            guard index < FolioleFramedSyncLimits.maxSessionFrames else {
                throw FolioleFramedSyncValidationError("session_frame_limit_exceeded")
            }
            guard message.payload.isSessionControl else {
                throw FolioleFramedSyncValidationError("session_control_payload_required")
            }
            try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .outbound) { _ in
            let plaintext = try FolioleFramedSyncCodec.encode(message)
            sessionBytes += plaintext.count + 32
            guard sessionBytes <= FolioleFramedSyncLimits.maxSessionBytes else {
                throw FolioleFramedSyncValidationError("session_byte_limit_exceeded")
            }
            let header = try FolioleFramedSyncWireHeader(
                ciphertextBytes: plaintext.count + 16,
                sequence: UInt64(index), frameType: .sessionControl
            ).encode()
            let ciphertext = try FolioleFramedSyncFrameCrypto.encrypt(
                groupKey: groupKey, preamble: preamble, header: header,
                plaintext: plaintext, sequence: UInt64(index)
            )
            try writer.write(header: header, ciphertext: ciphertext)
            index += 1
            }
        }
    }

    static func writeFile(
        to url: URL, groupKey: Data, context: FolioleFramedSyncSessionContext,
        nonceDirectory: URL = defaultNonceDirectory(), owner: FolioleFramedSyncPayloadBudget? = nil,
        produce: (_ emit: (FolioleFramedSyncValidatedMessage) throws -> Void) throws -> Void
    ) throws {
        guard !FileManager.default.fileExists(atPath: url.path), let output = OutputStream(url: url, append: false) else {
            throw FolioleFramedSyncValidationError("framed_sync_session_path_invalid")
        }
        do {
            try write(groupKey: groupKey, context: context, output: output,
                nonceDirectory: nonceDirectory, owner: owner, produce: produce)
        } catch {
            try? FileManager.default.removeItem(at: url)
            throw error
        }
    }

    private static func makePreamble(
        contextID: Data, sessionID: Data, noncePrefix: Data
    ) throws -> FolioleFramedSyncPreamble {
        var bytes = Data(repeating: 0, count: FolioleFramedSyncPreamble.byteCount)
        bytes.replaceSubrange(0..<8, with: Data("FOLSYNC2".utf8))
        bytes[8] = 0; bytes[9] = UInt8(FolioleFramedSyncPreamble.byteCount)
        bytes[10] = 0; bytes[11] = 22; bytes[12] = 1
        bytes.replaceSubrange(16..<48, with: contextID)
        bytes.replaceSubrange(48..<64, with: sessionID)
        bytes.replaceSubrange(64..<68, with: noncePrefix)
        return try FolioleFramedSyncPreamble(decoding: bytes)
    }

    private static func persistNonceState(
        sessionID: Data, contextID: Data, noncePrefix: Data, directory: URL
    ) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let file = directory.appendingPathComponent(sessionID.hex)
        let value = contextID + noncePrefix + Data(repeating: 0, count: 8)
        if FileManager.default.fileExists(atPath: file.path) {
            guard try Data(contentsOf: file) == value else {
                throw FolioleFramedSyncValidationError("session_nonce_reuse_detected")
            }
            return
        }
        guard FileManager.default.createFile(atPath: file.path, contents: value) else {
            throw FolioleFramedSyncValidationError("session_nonce_state_write_failed")
        }
    }

    private static func defaultNonceDirectory() -> URL {
        let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return root.appendingPathComponent("Foliole/framed-sync/session-nonces", isDirectory: true)
    }
}

private extension FolioleFramedSyncPayload {
    var isSessionControl: Bool {
        switch self {
        case .transferHeader, .fact, .factFragment, .blobChunk, .transferTrailer, .transferReceipt: false
        default: true
        }
    }
}
