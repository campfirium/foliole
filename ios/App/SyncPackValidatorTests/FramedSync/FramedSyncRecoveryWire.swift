import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

enum FramedSyncRecoveryWire {
    static func transfer(
        context: FolioleFramedSyncTransferContext, contentID: Data, transferID: Data,
        attemptID: Data = Data(repeating: 7, count: 16)
    ) throws -> Data {
        var manifest = Foliole_Sync_V22_TransferManifest()
        manifest.protocolVersion = 22; manifest.groupID = context.groupID; manifest.contentID = contentID
        var header = Foliole_Sync_V22_TransferHeader()
        header.transferID = transferID; header.attemptID = attemptID; header.manifest = manifest
        var trailer = Foliole_Sync_V22_TransferTrailer()
        trailer.transferID = transferID; trailer.manifestHash = contentID
        var first = Foliole_Sync_V22_ProtocolMessage(); first.payload = .transferHeader(header)
        var last = Foliole_Sync_V22_ProtocolMessage(); last.payload = .transferTrailer(trailer)
        let preamble = try transferPreamble(transferID: transferID, attemptID: attemptID)
        let output = OutputStream.toMemory(); let writer = FolioleFramedSyncStreamWriter(output: output)
        try writer.write(preamble: preamble.encoded)
        for (sequence, item) in [first, last].enumerated() {
            let validated = try FolioleFramedSyncCodec.validateOutbound(
                item, authenticatedFrameType: sequence == 0
                    ? FolioleFramedSyncFrameType.transferHeader.rawValue
                    : FolioleFramedSyncFrameType.transferTrailer.rawValue
            )
            let plaintext = try FolioleFramedSyncCodec.encode(validated)
            let frameType: FolioleFramedSyncFrameType = sequence == 0 ? .transferHeader : .transferTrailer
            let header = try FolioleFramedSyncWireHeader(
                ciphertextBytes: plaintext.count + 16, sequence: UInt64(sequence), frameType: frameType
            ).encode()
            let ciphertext = try FolioleFramedSyncFrameCrypto.encrypt(
                groupKey: Data(0...31), preamble: preamble, header: header,
                plaintext: plaintext, sequence: UInt64(sequence)
            )
            try writer.write(header: header, ciphertext: ciphertext)
        }
        return try XCTUnwrap(output.property(forKey: .dataWrittenToMemoryStreamKey) as? Data)
    }

    private static func transferPreamble(transferID: Data, attemptID: Data) throws -> FolioleFramedSyncPreamble {
        var bytes = Data(repeating: 0, count: FolioleFramedSyncPreamble.byteCount)
        bytes.replaceSubrange(0..<8, with: Data("FOLSYNC2".utf8)); bytes[9] = 96
        bytes[11] = 22; bytes[12] = 2
        bytes.replaceSubrange(16..<48, with: transferID)
        bytes.replaceSubrange(48..<64, with: attemptID)
        bytes.replaceSubrange(64..<68, with: Data([1, 2, 3, 4]))
        return try .init(decoding: bytes)
    }

    static func firstFrame(_ wire: Data) throws -> Data {
        let reader = FolioleFramedSyncStreamReader(input: InputStream(data: wire))
        let preamble = try reader.nextPreamble()
        let frame = try XCTUnwrap(reader.nextFrame())
        let output = OutputStream.toMemory()
        let writer = FolioleFramedSyncStreamWriter(output: output)
        try writer.write(preamble: preamble.encoded)
        try writer.write(header: frame.headerBytes, ciphertext: frame.ciphertext)
        return try XCTUnwrap(output.property(forKey: .dataWrittenToMemoryStreamKey) as? Data)
    }
}
