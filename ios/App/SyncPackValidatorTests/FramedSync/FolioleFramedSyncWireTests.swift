import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime

final class FolioleFramedSyncWireTests: XCTestCase {
    func testReaderPreservesBinaryFramesAndAcceptsFragmentedInput() throws {
        let ciphertext = Data([0, 255, 1, 254])
        let header = try FolioleFramedSyncWireHeader(
            ciphertextBytes: ciphertext.count,
            sequence: 7,
            frameType: .fact
        ).encode()
        let wire = preamble() + header + ciphertext
        let reader = FolioleFramedSyncStreamReader(input: ChunkedInputStream(wire, chunkBytes: 3))

        XCTAssertEqual(try reader.nextPreamble().encoded, preamble())
        let frame = try XCTUnwrap(reader.nextFrame())
        XCTAssertEqual(frame.header.sequence, 7)
        XCTAssertEqual(frame.header.frameType, .fact)
        XCTAssertEqual(frame.ciphertext, ciphertext)
        XCTAssertNil(try reader.nextFrame())
    }

    func testReaderRejectsOversizedFrameBeforeReadingItsBody() throws {
        var header = Data(count: FolioleFramedSyncWireHeader.byteCount)
        let value = UInt32(FolioleFramedSyncWireHeader.maxCiphertextBytes + 1)
        header[0] = UInt8(value >> 24)
        header[1] = UInt8((value >> 16) & 0xff)
        header[2] = UInt8((value >> 8) & 0xff)
        header[3] = UInt8(value & 0xff)
        header[13] = UInt8(FolioleFramedSyncFrameType.sessionControl.rawValue)
        let reader = FolioleFramedSyncStreamReader(input: InputStream(data: preamble() + header))
        _ = try reader.nextPreamble()
        XCTAssertThrowsError(try reader.nextFrame()) { error in
            XCTAssertEqual(
                error as? FolioleFramedSyncValidationError,
                FolioleFramedSyncValidationError("wire_frame_limit_exceeded")
            )
        }
    }

    func testWriterProducesExactWireBytesAndRejectsLengthMismatch() throws {
        let output = OutputStream.toMemory()
        let writer = FolioleFramedSyncStreamWriter(output: output)
        let ciphertext = Data([4, 5])
        let header = try FolioleFramedSyncWireHeader(
            ciphertextBytes: ciphertext.count,
            sequence: 0,
            frameType: .sessionControl
        ).encode()
        try writer.write(preamble: preamble())
        try writer.write(header: header, ciphertext: ciphertext)
        XCTAssertEqual(
            output.property(forKey: .dataWrittenToMemoryStreamKey) as? Data,
            preamble() + header + ciphertext
        )
        XCTAssertThrowsError(try writer.write(header: header, ciphertext: Data([4]))) { error in
            XCTAssertEqual(
                error as? FolioleFramedSyncValidationError,
                FolioleFramedSyncValidationError("framed_sync_frame_body_length_mismatch")
            )
        }
    }

    static func preamble() -> Data {
        var value = Data(count: FolioleFramedSyncPreamble.byteCount)
        value.replaceSubrange(0..<8, with: Data("FOLSYNC2".utf8))
        value[8] = 0
        value[9] = UInt8(FolioleFramedSyncPreamble.byteCount)
        value[10] = 0
        value[11] = 22
        value[12] = 1
        return value
    }

    private func preamble() -> Data { Self.preamble() }
}

private final class ChunkedInputStream: InputStream {
    private let bytes: Data
    private let chunkBytes: Int
    private var offset = 0

    init(_ bytes: Data, chunkBytes: Int) {
        self.bytes = bytes
        self.chunkBytes = chunkBytes
        super.init(data: Data())
    }

    override var hasBytesAvailable: Bool { offset < bytes.count }

    override func open() {}

    override func close() {}

    override func read(_ buffer: UnsafeMutablePointer<UInt8>, maxLength len: Int) -> Int {
        guard offset < bytes.count else { return 0 }
        let count = min(len, chunkBytes, bytes.count - offset)
        bytes.copyBytes(to: buffer, from: offset..<(offset + count))
        offset += count
        return count
    }
}
