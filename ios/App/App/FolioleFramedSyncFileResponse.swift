import Foundation
import FolioleFramedSyncRuntime
import Network

enum FolioleFramedSyncFileResponse {
    static func sendFile(_ connection: NWConnection, url: URL, directory: URL,
        deviceID: String, epoch: String, owner: FolioleFramedSyncPayloadBudget? = nil,
        lane: FolioleFramedSyncPayloadBudget.Lane = .payload,
        onProgress: (() throws -> Void)? = nil, onComplete: (() throws -> Void)? = nil,
        onInterrupted: (() -> Void)? = nil) throws {
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        guard let length = attributes[.size] as? NSNumber else {
            throw FolioleFramedSyncValidationError("framed_sync_session_file_size_missing")
        }
        let input = try FileHandle(forReadingFrom: url)
        let headers = "HTTP/1.1 200 OK\r\n" +
            "Content-Type: \(FolioleFramedSyncHTTPTransport.contentType)\r\n" +
            "X-Foliole-Device-Id: \(deviceID)\r\nX-Foliole-Library-Epoch: \(epoch)\r\n" +
            "Content-Length: \(length)\r\nConnection: close\r\n\r\n"
        let cancellation = FolioleFramedSyncPayloadWorker.currentCancellation
        Task {
            defer {
                try? input.close()
                try? FileManager.default.removeItem(at: directory)
                connection.cancel()
            }
            do {
                try await send(connection, Data(headers.utf8))
                while true {
                    let loan = try await FolioleFramedSyncPayloadWorker.run {
                        try FolioleFramedSyncPayloadWorker.withCancellation(cancellation) {
                            try owner.map { try FolioleFramedSyncPayloadWorker.borrow($0, direction: .outbound, lane: lane) }
                        }
                    }
                    defer { loan?.release() }
                    guard cancellation?.isCancelled != true else { throw CancellationError() }
                    guard let chunk = try input.read(upToCount: 64 * 1024), !chunk.isEmpty else { break }
                    try await send(connection, chunk)
                    try onProgress?()
                }
                try onComplete?()
            } catch { onInterrupted?(); connection.cancel() }
        }
    }

    private static func send(_ connection: NWConnection, _ bytes: Data) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            connection.send(content: bytes, completion: .contentProcessed { error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume() }
            })
        }
    }
}
