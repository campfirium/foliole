import Foundation

public struct FolioleFramedSyncPreamble: Sendable, Equatable {
    public static let byteCount = 96
    private static let magic = Data("FOLSYNC2".utf8)

    public let encoded: Data

    public init(decoding encoded: Data) throws {
        guard encoded.count == Self.byteCount,
              encoded.prefix(Self.magic.count) == Self.magic,
              encoded.uint16BE(at: 8) == UInt16(Self.byteCount),
              encoded.uint16BE(at: 10) == UInt16(FolioleFramedSyncLimits.protocolVersion),
              [1, 2].contains(encoded[12]),
              [0, 1].contains(encoded[13]),
              encoded.uint16BE(at: 14) == 0,
              encoded[76..<Self.byteCount].allSatisfy({ $0 == 0 }) else {
            throw FolioleFramedSyncValidationError("framed_sync_preamble_invalid")
        }
        self.encoded = encoded
    }
}

public struct FolioleFramedSyncWireHeader: Sendable, Equatable {
    public static let byteCount = 16
    public static let maxCiphertextBytes = 2 * 1024 * 1024 + 16

    public let ciphertextBytes: Int
    public let sequence: UInt64
    public let frameType: FolioleFramedSyncFrameType

    public init(ciphertextBytes: Int, sequence: UInt64, frameType: FolioleFramedSyncFrameType) throws {
        guard (0...Self.maxCiphertextBytes).contains(ciphertextBytes) else {
            throw FolioleFramedSyncValidationError("wire_frame_limit_exceeded")
        }
        self.ciphertextBytes = ciphertextBytes
        self.sequence = sequence
        self.frameType = frameType
    }

    public init(decoding encoded: Data) throws {
        guard encoded.count == Self.byteCount else {
            throw FolioleFramedSyncValidationError("frame_header_length_invalid")
        }
        let bodyBytes = encoded.uint32BE(at: 0)
        guard bodyBytes <= UInt32(Self.maxCiphertextBytes) else {
            throw FolioleFramedSyncValidationError("wire_frame_limit_exceeded")
        }
        guard let frameType = FolioleFramedSyncFrameType(rawValue: encoded.uint16BE(at: 12)) else {
            throw FolioleFramedSyncValidationError("frame_type_invalid")
        }
        guard encoded.uint16BE(at: 14) == 0 else {
            throw FolioleFramedSyncValidationError("frame_flags_invalid")
        }
        try self.init(
            ciphertextBytes: Int(bodyBytes),
            sequence: encoded.uint64BE(at: 4),
            frameType: frameType
        )
    }

    public func encode() -> Data {
        var result = Data()
        result.appendUInt32BE(UInt32(ciphertextBytes))
        result.appendUInt64BE(sequence)
        result.appendUInt16BE(frameType.rawValue)
        result.appendUInt16BE(0)
        return result
    }
}

public struct FolioleFramedSyncWireFrame: Sendable, Equatable {
    public let header: FolioleFramedSyncWireHeader
    public let headerBytes: Data
    public let ciphertext: Data
}

public final class FolioleFramedSyncStreamReader {
    private let input: InputStream
    private var readPreamble = false

    public init(input: InputStream) {
        self.input = input
        input.open()
    }

    deinit { input.close() }

    public func nextPreamble() throws -> FolioleFramedSyncPreamble {
        guard !readPreamble else {
            throw FolioleFramedSyncValidationError("framed_sync_preamble_already_read")
        }
        let data = try readExact(
            FolioleFramedSyncPreamble.byteCount,
            truncated: "framed_sync_preamble_truncated"
        )
        readPreamble = true
        return try FolioleFramedSyncPreamble(decoding: data)
    }

    public func nextFrame() throws -> FolioleFramedSyncWireFrame? {
        guard readPreamble else {
            throw FolioleFramedSyncValidationError("framed_sync_preamble_required")
        }
        guard let headerBytes = try readExactOrEnd(
            FolioleFramedSyncWireHeader.byteCount,
            truncated: "framed_sync_frame_header_truncated"
        ) else { return nil }
        let header = try FolioleFramedSyncWireHeader(decoding: headerBytes)
        let ciphertext = try readExact(
            header.ciphertextBytes,
            truncated: "framed_sync_frame_body_truncated"
        )
        return FolioleFramedSyncWireFrame(
            header: header,
            headerBytes: headerBytes,
            ciphertext: ciphertext
        )
    }

    private func readExact(_ count: Int, truncated: String) throws -> Data {
        guard let data = try readExactOrEnd(count, truncated: truncated) else {
            throw FolioleFramedSyncValidationError(truncated)
        }
        return data
    }

    private func readExactOrEnd(_ count: Int, truncated: String) throws -> Data? {
        var bytes = [UInt8](repeating: 0, count: count)
        var offset = 0
        while offset < count {
            let read = bytes.withUnsafeMutableBufferPointer { buffer in
                input.read(buffer.baseAddress! + offset, maxLength: count - offset)
            }
            if read < 0 { throw input.streamError ?? FolioleFramedSyncValidationError(truncated) }
            if read == 0 {
                if offset == 0 { return nil }
                throw FolioleFramedSyncValidationError(truncated)
            }
            offset += read
        }
        return Data(bytes)
    }
}

public final class FolioleFramedSyncStreamWriter {
    private let output: OutputStream
    private var wrotePreamble = false

    public init(output: OutputStream) {
        self.output = output
        output.open()
    }

    deinit { output.close() }

    public func write(preamble: Data) throws {
        guard !wrotePreamble else {
            throw FolioleFramedSyncValidationError("framed_sync_preamble_already_written")
        }
        _ = try FolioleFramedSyncPreamble(decoding: preamble)
        try writeAll(preamble)
        wrotePreamble = true
    }

    public func write(header: Data, ciphertext: Data) throws {
        guard wrotePreamble else {
            throw FolioleFramedSyncValidationError("framed_sync_preamble_required")
        }
        let decoded = try FolioleFramedSyncWireHeader(decoding: header)
        guard decoded.ciphertextBytes == ciphertext.count else {
            throw FolioleFramedSyncValidationError("framed_sync_frame_body_length_mismatch")
        }
        try writeAll(header)
        try writeAll(ciphertext)
    }

    private func writeAll(_ data: Data) throws {
        try data.withUnsafeBytes { raw in
            guard let base = raw.bindMemory(to: UInt8.self).baseAddress else { return }
            var offset = 0
            while offset < data.count {
                let written = output.write(base + offset, maxLength: data.count - offset)
                guard written > 0 else {
                    throw output.streamError ?? FolioleFramedSyncValidationError("framed_sync_stream_write_failed")
                }
                offset += written
            }
        }
    }
}

private extension Data {
    func uint16BE(at offset: Int) -> UInt16 {
        UInt16(self[offset]) << 8 | UInt16(self[offset + 1])
    }

    func uint32BE(at offset: Int) -> UInt32 {
        (0..<4).reduce(0) { ($0 << 8) | UInt32(self[offset + $1]) }
    }

    func uint64BE(at offset: Int) -> UInt64 {
        (0..<8).reduce(0) { ($0 << 8) | UInt64(self[offset + $1]) }
    }

    mutating func appendUInt16BE(_ value: UInt16) {
        append(UInt8(value >> 8)); append(UInt8(value & 0xff))
    }

    mutating func appendUInt32BE(_ value: UInt32) {
        for shift in stride(from: 24, through: 0, by: -8) { append(UInt8((value >> shift) & 0xff)) }
    }

    mutating func appendUInt64BE(_ value: UInt64) {
        for shift in stride(from: 56, through: 0, by: -8) { append(UInt8((value >> shift) & 0xff)) }
    }
}
