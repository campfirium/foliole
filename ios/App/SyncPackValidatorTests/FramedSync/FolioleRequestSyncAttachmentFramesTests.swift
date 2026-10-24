import Foundation
import XCTest
import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleRequestSyncAttachmentFramesTests: XCTestCase {
    private let key = Data(repeating: 0, count: 32)
    private func context(_ peer: String = "b") throws -> FolioleFramedSyncSessionContext {
        try .init(groupID: "group", initiatorDeviceID: "a", initiatorLibraryEpoch: "a-epoch",
                  responderDeviceID: peer, responderLibraryEpoch: "b-epoch")
    }
    private func wire(_ blocks: Int) throws -> Data {
        let session = Data(repeating: 1, count: 16)
        var encoded = Data("FOLSYNC2".utf8) + Data([0, 96, 0, 26, 1, 0, 0, 0])
        encoded.append(try context().deriveContextID(sessionID: session))
        encoded.append(session); encoded.append(Data(repeating: 0, count: 32))
        let preamble = try FolioleFramedSyncPreamble(decoding: encoded)
        for index in 0...blocks {
            var attachment = Foliole_Sync_V22_RequestAttachment()
            attachment.requestID = Data(repeating: 0, count: 16)
            attachment.operation = "pull"; attachment.storageKey = String(repeating: "a", count: 64) + ".pdftext"
            attachment.byteLength = UInt64(blocks * 524288); attachment.offset = UInt64(index * 524288)
            attachment.maxBlocks = UInt32(min(blocks, 64)); attachment.state = index == blocks ? "end" : "block"
            if index < blocks { attachment.data = Data(repeating: UInt8(index), count: 524288) }
            var envelope = Foliole_Sync_V22_ProtocolMessage(); envelope.requestAttachment = attachment
            let plaintext = try FolioleFramedSyncCodec.encode(FolioleFramedSyncCodec.validateOutbound(envelope, authenticatedFrameType: 1))
            let header = try FolioleFramedSyncWireHeader(ciphertextBytes: plaintext.count + 16, sequence: UInt64(index), frameType: .sessionControl).encode()
            encoded.append(header)
            encoded.append(try FolioleFramedSyncFrameCrypto.encrypt(groupKey: key, preamble: preamble, header: header, plaintext: plaintext, sequence: UInt64(index)))
        }
        return encoded
    }
    private func read(_ bytes: Data, peer: String = "b", check: () throws -> Void = {},
                      consume: (Int, Data, Data) throws -> Void) throws {
        _ = try FolioleRequestSyncAttachmentFrames.read(stream: .init(input: InputStream(data: bytes)),
            groupKey: key, context: context(peer), check: check, consume: consume)
    }
    func testStagesSixteenMiBWithSmallMetadataAndBoundedBlocks() throws {
        var count = 0
        try read(wire(32)) { index, metadata, block in
            XCTAssertEqual(index, count); count += 1
            XCTAssertLessThan(metadata.count, 256)
            let decoded = try FolioleFramedSyncCodec.decode(metadata, authenticatedFrameType: 1)
            guard case .requestAttachment(let message) = decoded.payload else { return XCTFail() }
            XCTAssertTrue(message.data.isEmpty)
            XCTAssertEqual(block.count, index == 32 ? 0 : 524288)
        }
        XCTAssertEqual(count, 33)
    }
    func testStagesThirtyTwoMiBWithinAnExplicitLargerWindow() throws {
        var count = 0
        _ = try FolioleRequestSyncAttachmentFrames.read(stream: .init(input: InputStream(data: wire(64))),
            groupKey: key, context: context(), maxBlocks: 64, check: {}) { _, metadata, _ in
            XCTAssertLessThan(metadata.count, 256); count += 1
        }
        XCTAssertEqual(count, 65)
    }
    func testRejectsCorruptionContextTruncationCancellationAndOversizedWindows() throws {
        let bytes = try wire(1)
        var corrupt = bytes; corrupt[120] ^= 1
        XCTAssertThrowsError(try read(corrupt) { _, _, _ in XCTFail() })
        XCTAssertThrowsError(try read(bytes, peer: "other") { _, _, _ in XCTFail() })
        XCTAssertThrowsError(try read(Data(bytes.prefix(150))) { _, _, _ in XCTFail() })
        XCTAssertThrowsError(try read(bytes, check: { throw CancellationError() }) { _, _, _ in XCTFail() })
        XCTAssertThrowsError(try read(wire(33)) { _, _, _ in })
    }
    func testAppendsNativeBytesWithoutBase64AndRejectsChangedOffsets() throws {
        let fixture = try AttachmentBlockStorageFixture(); defer { fixture.close() }
        let bytes = Data(repeating: 7, count: 524288)
        _ = try fixture.storage.execute(action: "append-file", key: fixture.key, number: { _ in 0 }, data: bytes)
        XCTAssertEqual(try Data(contentsOf: fixture.partial), bytes)
        XCTAssertThrowsError(try fixture.storage.execute(action: "append-file", key: fixture.key, number: { _ in 0 }, data: bytes))
        XCTAssertEqual(try Data(contentsOf: fixture.partial), bytes)
    }
}
