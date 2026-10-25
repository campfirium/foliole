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
    private func permission(_ blocks: Int, limit: Int = 32) throws -> FolioleAttachmentReceiveAuthorization {
        try .init(requestID: Data(repeating: 0, count: 16), storageKey: String(repeating: "a", count: 64) + ".pdftext",
                  byteLength: UInt64(blocks * 524288), offset: 0, maxBlocks: limit)
    }
    private func read(_ bytes: Data, blocks: Int = 1, peer: String = "b", check: @escaping () throws -> Void = {},
                      authorization: FolioleAttachmentReceiveAuthorization? = nil,
                      consume: @escaping (UInt64, Data) throws -> Void) throws {
        let decoder = FolioleRequestSyncAttachmentDecoder(groupKey: key, context: try context(peer),
            permission: try authorization ?? permission(blocks), check: check, consume: consume)
        try decoder.append(bytes); try decoder.finish()
    }
    func testWritesSixteenMiBAsBoundedAuthorizedBlocks() throws {
        var count = 0
        try read(wire(32), blocks: 32) { offset, block in
            XCTAssertEqual(offset, UInt64(count * 524288)); count += 1
            XCTAssertEqual(block.count, 524288)
        }
        XCTAssertEqual(count, 32)
    }
    func testWritesThirtyTwoMiBWithinAnExplicitLargerWindow() throws {
        var count = 0
        try read(wire(64), authorization: permission(64, limit: 64)) { _, _ in count += 1 }
        XCTAssertEqual(count, 64)
    }
    func testRejectsCorruptionContextTruncationCancellationAndOversizedWindows() throws {
        let bytes = try wire(1)
        var corrupt = bytes; corrupt[120] ^= 1
        XCTAssertThrowsError(try read(corrupt) { _, _ in XCTFail() })
        XCTAssertThrowsError(try read(bytes, peer: "other") { _, _ in XCTFail() })
        XCTAssertThrowsError(try read(Data(bytes.prefix(150))) { _, _ in XCTFail() })
        XCTAssertThrowsError(try read(bytes, check: { throw CancellationError() }) { _, _ in XCTFail() })
        XCTAssertThrowsError(try read(wire(33), blocks: 33) { _, _ in })
    }
    func testRejectsOtherFileRequestOffsetAndLengthBeforeWriting() throws {
        let data = try wire(2), original = String(repeating: "a", count: 64) + ".pdftext"
        for permission in [
            try FolioleAttachmentReceiveAuthorization(requestID: Data(repeating: 0, count: 16), storageKey: String(repeating: "b", count: 64) + ".pdftext", byteLength: 1048576, offset: 0, maxBlocks: 2),
            try FolioleAttachmentReceiveAuthorization(requestID: Data(repeating: 1, count: 16), storageKey: original, byteLength: 1048576, offset: 0, maxBlocks: 2),
            try FolioleAttachmentReceiveAuthorization(requestID: Data(repeating: 0, count: 16), storageKey: original, byteLength: 1048577, offset: 0, maxBlocks: 2),
            try FolioleAttachmentReceiveAuthorization(requestID: Data(repeating: 0, count: 16), storageKey: original, byteLength: 1048576, offset: 524288, maxBlocks: 2)
        ] {
            XCTAssertThrowsError(try read(data, authorization: permission) { _, _ in XCTFail() })
        }
    }
    func testIncrementalDecoderWritesBeforeEndAndBoundsCoalescedCallbacks() throws {
        let bytes = try wire(2)
        let firstFrameEnd = 96 + 16 + (try FolioleFramedSyncWireHeader(decoding: Data(bytes[96..<112]))).ciphertextBytes
        for fragment in [1, 7, 65536, bytes.count] {
            var received = 0
            let decoder = FolioleRequestSyncAttachmentDecoder(groupKey: key, context: try context(),
                permission: try permission(2), check: {}) { _, _ in received += 1 }
            for start in stride(from: 0, to: firstFrameEnd, by: fragment) {
                try decoder.append(Data(bytes[start..<min(start + fragment, firstFrameEnd)]))
            }
            XCTAssertEqual(received, 1)
            try decoder.append(Data(bytes[firstFrameEnd...]))
            try decoder.finish()
            XCTAssertEqual(received, 2)
            XCTAssertLessThanOrEqual(decoder.peakBufferedBytes, 524288 + 24584 + 16)
            XCTAssertThrowsError(try decoder.append(Data([0])))
        }
    }
    func testIncrementalDecoderRejectsCorruptionBeforeWriteAndCancellationBetweenFragments() throws {
        var bytes = try wire(1)
        bytes[120] ^= 1
        let decoder = FolioleRequestSyncAttachmentDecoder(groupKey: key, context: try context(),
            permission: try permission(1), check: {}) { _, _ in XCTFail("Unauthenticated write") }
        XCTAssertThrowsError(try decoder.append(bytes))
        var cancelled = false
        let interrupted = FolioleRequestSyncAttachmentDecoder(groupKey: key, context: try context(),
            permission: try permission(1), check: { if cancelled { throw CancellationError() } }) { _, _ in XCTFail() }
        try interrupted.append(Data(bytes.prefix(100)))
        cancelled = true
        XCTAssertThrowsError(try interrupted.append(Data(bytes.dropFirst(100))))
    }
    func testRealHTTPWritesAuthenticatedPartialBeforeResponseEnds() async throws {
        let fixture = try AttachmentBlockStorageFixture(); defer { fixture.close() }
        try fixture.call("truncate", numbers: ["length": 0])
        let bytes = try wire(2)
        let firstEnd = 112 + (try FolioleFramedSyncWireHeader(decoding: Data(bytes[96..<112]))).ciphertextBytes
        let server = try AttachmentStreamingHTTPServer(prefix: Data(bytes.prefix(firstEnd)), suffix: Data(bytes.dropFirst(firstEnd)))
        defer { server.close() }
        let wrote = expectation(description: "first file block written before response completes")
        let writer = try fixture.storage.receive(key: fixture.key, offset: 0, check: {}) { fixture.storage.finishReceive(fixture.key) }
        defer { try? writer.close() }
        let decoder = FolioleRequestSyncAttachmentDecoder(groupKey: key, context: try context(),
            permission: try permission(2), check: {}) { offset, data in
                try writer.append(offset: offset, data: data)
                if offset == 0 { wrote.fulfill() }
            }
        let request = fixture.directory.appendingPathComponent("request")
        let response = fixture.directory.appendingPathComponent("response")
        try Data([1]).write(to: request)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.connectionProxyDictionary = [:]
        configuration.timeoutIntervalForRequest = 5
        configuration.timeoutIntervalForResource = 5
        let work = Task {
            try await FolioleFramedSyncHTTPTransport.post(endpoint: server.endpoint,
                peer: .init(groupID: "group", deviceID: "b", libraryEpoch: "b-epoch", memberAuthHeaders: [
                    "x-device-id": "a", "x-nonce": "test", "x-signature": "test", "x-timestamp": "test"]),
                requestBodyURL: request, responseBodyURL: response, configuration: configuration,
                bodyConsumer: .init(append: decoder.append, finish: decoder.finish, cancel: {}))
        }
        await fulfillment(of: [wrote], timeout: 3)
        XCTAssertEqual(try Data(contentsOf: fixture.partial).count, 524288)
        XCTAssertFalse(FileManager.default.fileExists(atPath: response.path))
        server.finish()
        _ = try await work.value
        XCTAssertEqual(try Data(contentsOf: fixture.partial).count, 1048576)
    }
    func testDirectWriterRetainsItsLockUntilRealIoExits() throws {
        let fixture = try AttachmentBlockStorageFixture(); defer { fixture.close() }
        try fixture.call("truncate", numbers: ["length": 0])
        let bytes = Data(repeating: 7, count: 524288)
        let writer = try fixture.storage.receive(key: fixture.key, offset: 0, check: {}) { fixture.storage.finishReceive(fixture.key) }
        try writer.append(offset: 0, data: bytes)
        XCTAssertThrowsError(try writer.append(offset: 0, data: bytes))
        fixture.storage.close()
        let other = try FolioleAttachmentBlockStorage(root: fixture.root, trash: { fixture.trash }); defer { other.close() }
        XCTAssertThrowsError(try other.execute(action: "acquire", key: fixture.key))
        try writer.close()
        XCTAssertNoThrow(try other.execute(action: "acquire", key: fixture.key))
        XCTAssertEqual(try Data(contentsOf: fixture.partial), bytes)
    }
    func testOwnerRetirementWaitsForNativeOperationAcknowledgement() throws {
        let owner = FolioleFramedSyncPayloadBudget(libraryKey: "library", generationID: "generation")
        let cancelled = expectation(description: "cancelled"), drained = expectation(description: "drained")
        let operation = try owner.beginOperation { cancelled.fulfill() }
        let premature = expectation(description: "no premature drain"); premature.isInverted = true
        owner.retire { premature.fulfill(); drained.fulfill() }
        wait(for: [cancelled, premature], timeout: 0.05)
        owner.finishOperation(operation)
        wait(for: [drained], timeout: 1)
        XCTAssertThrowsError(try owner.beginOperation {})
    }
}
