import Foundation
import FolioleFramedSyncRuntime

final class FolioleFramedSyncHTTPReceiver: NSObject, URLSessionDataDelegate {
    private let responseURL: URL
    private let partialURL: URL
    private let expectedDeviceID: String
    private let expectedLibraryEpoch: String
    private var continuation: CheckedContinuation<URL, Error>?
    private var output: OutputStream?
    private var session: URLSession?

    init(responseURL: URL, expectedDeviceID: String, expectedLibraryEpoch: String) {
        self.responseURL = responseURL
        partialURL = responseURL.deletingLastPathComponent()
            .appendingPathComponent(".\(responseURL.lastPathComponent).\(UUID().uuidString).partial")
        self.expectedDeviceID = expectedDeviceID
        self.expectedLibraryEpoch = expectedLibraryEpoch
    }

    func upload(
        request: URLRequest,
        bodyURL: URL,
        configuration: URLSessionConfiguration
    ) async throws -> URL {
        try FileManager.default.createDirectory(
            at: responseURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let queue = OperationQueue()
            queue.maxConcurrentOperationCount = 1
            let session = URLSession(configuration: configuration, delegate: self, delegateQueue: queue)
            self.session = session
            session.uploadTask(with: request, fromFile: bodyURL).resume()
        }
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping @Sendable (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping @Sendable (URLSession.ResponseDisposition) -> Void
    ) {
        do {
            guard let http = response as? HTTPURLResponse else {
                throw FolioleFramedSyncValidationError("framed_sync_response_not_http")
            }
            try FolioleFramedSyncHTTPTransport.validateResponse(
                http,
                expectedDeviceID: expectedDeviceID,
                expectedLibraryEpoch: expectedLibraryEpoch
            )
            guard let output = OutputStream(url: partialURL, append: false) else {
                throw FolioleFramedSyncValidationError("framed_sync_response_file_open_failed")
            }
            output.open()
            self.output = output
            completionHandler(.allow)
        } catch {
            completionHandler(.cancel)
            finish(.failure(error))
        }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        do { try write(data) } catch { dataTask.cancel(); finish(.failure(error)) }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error { finish(.failure(error)); return }
        do {
            output?.close()
            output = nil
            try FileManager.default.moveItem(at: partialURL, to: responseURL)
            finish(.success(responseURL))
        } catch { finish(.failure(error)) }
    }

    private func write(_ data: Data) throws {
        guard let output else {
            throw FolioleFramedSyncValidationError("framed_sync_response_stream_unavailable")
        }
        try data.withUnsafeBytes { raw in
            guard let bytes = raw.bindMemory(to: UInt8.self).baseAddress else { return }
            var offset = 0
            while offset < data.count {
                let count = output.write(bytes + offset, maxLength: data.count - offset)
                guard count > 0 else {
                    throw output.streamError ?? FolioleFramedSyncValidationError("framed_sync_response_write_failed")
                }
                offset += count
            }
        }
    }

    private func finish(_ result: Result<URL, Error>) {
        guard let continuation else { return }
        self.continuation = nil
        output?.close()
        output = nil
        if case .failure = result { try? FileManager.default.removeItem(at: partialURL) }
        continuation.resume(with: result)
        session?.finishTasksAndInvalidate()
        session = nil
    }
}
