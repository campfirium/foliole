import Foundation
import FolioleFramedSyncRuntime

enum FolioleFramedSyncServerBatchResponse {
    struct Unit {
        let url: URL
        let messageBytes: UInt64
        let batchReady: Bool
        var dispose: () -> Void = {}
    }

    static func write(_ requests: [Data], to outputURL: URL, owner: FolioleFramedSyncPayloadBudget,
        inspect: (Data) throws -> Void, seal: (Data, Int) throws -> Unit) throws -> URL {
        guard (1...128).contains(requests.count), requests.reduce(0, { $0 + $1.count }) <= 768 * 1024 else {
            throw FolioleFramedSyncValidationError("framed_sync_difference_batch_invalid")
        }
        // Validate the entire authenticated request before any response publication is sealed.
        for request in requests { try inspect(request) }
        guard FileManager.default.createFile(atPath: outputURL.path, contents: nil) else {
            throw FolioleFramedSyncValidationError("framed_sync_stream_write_failed")
        }
        let output = try FileHandle(forWritingTo: outputURL)
        defer { try? output.close() }
        var bytes: UInt64 = 0
        for (index, request) in requests.enumerated() {
            let unit = try seal(request, index)
            defer { unit.dispose() }
            if index > 0 && (!unit.batchReady || bytes + unit.messageBytes > 1_048_576 ||
                bytes + unit.messageBytes > 2_097_152) { break }
            try append(unit.url, to: output, owner: owner)
            bytes += unit.messageBytes
            if !unit.batchReady || bytes >= 1_048_576 { break }
        }
        try output.synchronize()
        return outputURL
    }

    private static func append(_ url: URL, to output: FileHandle, owner: FolioleFramedSyncPayloadBudget) throws {
        let input = try FileHandle(forReadingFrom: url)
        defer { try? input.close() }
        while try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .outbound, { _ in
            guard let bytes = try input.read(upToCount: 64 * 1024), !bytes.isEmpty else { return false }
            try output.write(contentsOf: bytes)
            return true
        }) {}
    }
}
