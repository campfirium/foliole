import Foundation

/** Retains at most one wire frame, irrespective of URLSession callback boundaries. */
public final class FolioleFramedSyncIncrementalReader {
    private var buffer = Data()
    private var preamble: FolioleFramedSyncPreamble?
    private var header: (FolioleFramedSyncWireHeader, Data)?
    private var target = FolioleFramedSyncPreamble.byteCount
    private var finished = false
    private let maximumCiphertextBytes: Int
    public private(set) var peakBufferedBytes = 0

    public init(maximumCiphertextBytes: Int = FolioleFramedSyncWireHeader.maxCiphertextBytes) {
        self.maximumCiphertextBytes = maximumCiphertextBytes
    }

    public func append(_ data: Data, validate: (FolioleFramedSyncPreamble) throws -> Void,
                       consume: (FolioleFramedSyncPreamble, FolioleFramedSyncWireFrame) throws -> Void) throws {
        guard !finished else { throw FolioleFramedSyncValidationError("framed_sync_stream_finished") }
        var cursor = data.startIndex
        while cursor < data.endIndex {
            let count = min(target - buffer.count, data.endIndex - cursor)
            buffer.append(data[cursor..<cursor + count]); cursor += count
            peakBufferedBytes = max(peakBufferedBytes, buffer.count)
            if buffer.count == target { try advance(validate: validate, consume: consume) }
        }
    }

    public func finish() throws {
        guard !finished, preamble != nil, header == nil, buffer.isEmpty else {
            throw FolioleFramedSyncValidationError("framed_sync_stream_truncated")
        }
        finished = true
    }

    private func advance(validate: (FolioleFramedSyncPreamble) throws -> Void,
                         consume: (FolioleFramedSyncPreamble, FolioleFramedSyncWireFrame) throws -> Void) throws {
        let bytes = buffer
        buffer = Data()
        guard let preamble else {
            let value = try FolioleFramedSyncPreamble(decoding: bytes)
            try validate(value)
            self.preamble = value; target = FolioleFramedSyncWireHeader.byteCount
            return
        }
        guard let (value, headerBytes) = header else {
            let value = try FolioleFramedSyncWireHeader(decoding: bytes)
            guard value.ciphertextBytes >= 16, value.ciphertextBytes <= maximumCiphertextBytes else {
                throw FolioleFramedSyncValidationError("framed_sync_frame_ciphertext_limit_exceeded")
            }
            header = (value, bytes); target = value.ciphertextBytes
            return
        }
        try consume(preamble, FolioleFramedSyncWireFrame(header: value, headerBytes: headerBytes, ciphertext: bytes))
        header = nil; target = FolioleFramedSyncWireHeader.byteCount
    }
}
