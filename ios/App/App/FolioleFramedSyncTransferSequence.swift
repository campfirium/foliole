import Foundation
import FolioleFramedSyncRuntime

/// Unauthenticated headers locate exact original units; the original consumer authenticates each one.
enum FolioleFramedSyncTransferSequence {
    static let maximumMessageBytes = 2_097_152
    static let maximumUnits = 128
    struct Unit {
        let url: URL
        let preamble: FolioleFramedSyncPreamble
        let receipt: Bool
    }

    static func readEach(_ source: URL, owner: FolioleFramedSyncPayloadBudget? = nil,
        consume: (Unit) throws -> Void) throws {
        let reader = try Reader(source, owner: owner)
        defer { reader.close() }
        while let unit = try reader.next() { try consume(unit) }
    }

    static func readEachAsync(_ source: URL, owner: FolioleFramedSyncPayloadBudget,
        consume: (Unit) async throws -> Void) async throws {
        let reader = try await FolioleFramedSyncPayloadWorker.run { try Reader(source, owner: owner) }
        defer { reader.close() }
        while let unit = try await FolioleFramedSyncPayloadWorker.run({ try reader.next() }) {
            try await consume(unit)
        }
    }

    private final class Reader {
        let input: FileHandle
        let length: UInt64
        let directory: URL
        let owner: FolioleFramedSyncPayloadBudget?
        var count = 0, messageBytes: UInt64 = 0
        var compressed = false, firstKind: FolioleFramedSyncFrameType?
        var previous: URL?

        init(_ source: URL, owner: FolioleFramedSyncPayloadBudget?) throws {
            input = try FileHandle(forReadingFrom: source)
            length = try input.seekToEnd()
            try input.seek(toOffset: 0)
            directory = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-framed-units-\(UUID().uuidString)")
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            self.owner = owner
        }
        func close() {
            try? input.close()
            try? FileManager.default.removeItem(at: directory)
        }
        func next() throws -> Unit? {
            if let previous { try FileManager.default.removeItem(at: previous); self.previous = nil }
            guard try input.offset() < length else {
                guard count > 0 else { throw invalid("framed_sync_preamble_truncated") }
                return nil
            }
            try owner?.requireActive()
            let start = try input.offset()
            let preamble = try FolioleFramedSyncPreamble(decoding: exact(input, 96, length: length))
            guard preamble.contextKind == 2 else { throw invalid("framed_sync_batch_transfer_required") }
            count += 1; messageBytes += 96
            guard count <= maximumUnits else { throw invalid("framed_sync_batch_item_limit_exceeded") }
            compressed = compressed || preamble.encoded[13] != 0
            try checkBatch(count: count, compressed: compressed, messageBytes: messageBytes)
            let receipt = try scanUnit(input, length: length, count: count,
                messageBytes: &messageBytes, firstKind: &firstKind)
            let end = try input.offset()
            let url = directory.appendingPathComponent("unit.body")
            try copyRange(input, start: start, end: end, to: url, owner: owner, receipt: receipt)
            previous = url
            try input.seek(toOffset: end)
            return Unit(url: url, preamble: preamble, receipt: receipt)
        }
    }

    private static func scanUnit(_ input: FileHandle, length: UInt64, count: Int,
        messageBytes: inout UInt64, firstKind: inout FolioleFramedSyncFrameType?, maximumFrames: Int? = 4_130) throws -> Bool {
        var frames = 0, receipt = false
        while true {
            let header = try FolioleFramedSyncWireHeader(decoding: exact(input, 16, length: length))
            guard header.ciphertextBytes >= 16 else { throw invalid("framed_sync_frame_body_length_mismatch") }
            frames += 1
            if let maximumFrames, frames > maximumFrames { throw invalid("transfer_frame_limit_exceeded") }
            if frames == 1 {
                guard header.frameType == .transferHeader || header.frameType == .transferReceipt else {
                    throw invalid("transfer_header_required")
                }
                if let firstKind, firstKind != header.frameType { throw invalid("framed_sync_batch_kind_mismatch") }
                firstKind = header.frameType; receipt = header.frameType == .transferReceipt
            } else if header.frameType == .transferReceipt { throw invalid("transfer_receipt_required") }
            if receipt && header.ciphertextBytes > 1_048_576 { throw invalid("framed_sync_receipt_limit_exceeded") }
            messageBytes += UInt64(header.ciphertextBytes - 16)
            try checkBatch(count: count, compressed: false, messageBytes: messageBytes)
            let offset = try input.offset(), bytes = UInt64(header.ciphertextBytes)
            guard offset <= length, bytes <= length - offset else { throw invalid("framed_sync_frame_body_truncated") }
            try input.seek(toOffset: offset + bytes)
            if receipt || header.frameType == .transferTrailer { return receipt }
        }
    }

    private static func checkBatch(count: Int, compressed: Bool, messageBytes: UInt64) throws {
        if count > 1 && (compressed || messageBytes > maximumMessageBytes) {
            throw invalid("framed_sync_batch_message_limit_exceeded")
        }
    }

    private static func exact(_ input: FileHandle, _ count: Int, length: UInt64) throws -> Data {
        let offset = try input.offset()
        guard offset <= length, UInt64(count) <= length - offset,
              let bytes = try input.read(upToCount: count), bytes.count == count else {
            throw invalid("framed_sync_sequence_truncated")
        }
        return bytes
    }

    private static func copyRange(_ input: FileHandle, start: UInt64, end: UInt64, to url: URL,
        owner: FolioleFramedSyncPayloadBudget?, receipt: Bool) throws {
        guard FileManager.default.createFile(atPath: url.path, contents: nil) else { throw invalid("framed_sync_stream_write_failed") }
        let output = try FileHandle(forWritingTo: url)
        defer { try? output.close() }
        try input.seek(toOffset: start)
        var remaining = end - start
        while remaining > 0 {
            try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .inbound, lane: receipt ? .receipt : .payload) { _ in
                let bytes = try exact(input, Int(min(remaining, 64 * 1024)), length: end)
                try output.write(contentsOf: bytes)
                remaining -= UInt64(bytes.count)
            }
        }
        try output.synchronize()
    }

    static func transferSize(_ source: URL) throws -> (bytes: UInt64, compressed: Bool) {
        let input = try FileHandle(forReadingFrom: source)
        defer { try? input.close() }
        let length = try input.seekToEnd(); try input.seek(toOffset: 0)
        let preamble = try FolioleFramedSyncPreamble(decoding: exact(input, 96, length: length))
        guard preamble.contextKind == 2 else { throw invalid("framed_sync_batch_transfer_required") }
        var bytes: UInt64 = 96, kind: FolioleFramedSyncFrameType?
        let receipt = try scanUnit(input, length: length, count: 1, messageBytes: &bytes, firstKind: &kind, maximumFrames: nil)
        guard !receipt, try input.offset() == length else { throw invalid("framed_sync_transfer_not_consumed") }
        return (bytes, preamble.encoded[13] != 0)
    }

    static func appendReceipt(_ source: URL, to output: FileHandle, owner: FolioleFramedSyncPayloadBudget) throws {
        let input = try FileHandle(forReadingFrom: source)
        defer { try? input.close() }
        while try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .outbound, lane: .receipt, { _ in
            guard let bytes = try input.read(upToCount: 64 * 1024), !bytes.isEmpty else { return false }
            try output.write(contentsOf: bytes)
            return true
        }) {}
    }

    private static func invalid(_ code: String) -> Error { FolioleFramedSyncValidationError(code) }
}
